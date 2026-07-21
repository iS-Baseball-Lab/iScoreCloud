// filepath: src/api/matches/scorebook.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, asc } from "drizzle-orm";
import { MatchService } from "@/services/match.service";
import * as schema from "@/db/schema";
import type { WorkerEnv, AtBatEvent, ValidationMessage } from "@/types/api";

const scorebookRouter = new Hono<{ Bindings: WorkerEnv }>();

const { matches, teams } = schema;

// 1. スコアブック画像のAI解析エンドポイント
scorebookRouter.post("/:id/scorebook/import", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const matchId = c.req.param("id") as string;
  const apiKey = c.env.GEMINI_API_KEY;

  if (!apiKey) {
    return c.json({ success: false, error: "GEMINI_API_KEY is not set" }, 500);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return c.json({ success: false, error: "画像ファイルが必要です" }, 400);
    }

    // A. 試合に紐づくチームの「早見表画像」を取得
    const match = await db.select({ teamId: matches.teamId }).from(matches).where(eq(matches.id, matchId as string)).get();
    if (!match) {
      return c.json({ success: false, error: "試合が見つかりません" }, 404);
    }

    const team = await db.select({ scorebookLegendUrl: teams.scorebookLegendUrl }).from(teams).where(eq(teams.id, match.teamId)).get();
    const legendUrl = team?.scorebookLegendUrl;

    const fileBytes = await file.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(fileBytes);
    const fileMimeType = file.type || "image/png";

    // C-0. 試合のスタメン情報を取得してプロンプトに注入
    const lineups = await db.select({
      battingOrder: schema.matchLineups.battingOrder,
      name: schema.players.name
    })
    .from(schema.matchLineups)
    .innerJoin(schema.players, eq(schema.matchLineups.playerId, schema.players.id))
    .where(eq(schema.matchLineups.matchId, matchId))
    .orderBy(asc(schema.matchLineups.battingOrder))
    .all();

    let lineupPrompt = "";
    if (lineups.length > 0) {
      const lineupText = lineups.map(l => `${l.battingOrder}番: ${l.name}`).join(", ");
      lineupPrompt = `\n⚠️ 【重要: スタメン情報】この試合の自チームのスタメンは以下の通りです。画像内の文字が潰れていて読み取りづらい場合は、このスタメンリストの選手名を最優先して紐づけてください。\n[${lineupText}]\n`;
    }

    // C. Gemini API 用の画像パーツリストを構築
    const imageParts: any[] = [
      {
        inlineData: {
          mimeType: fileMimeType,
          data: fileBase64
        }
      }
    ];

    // D. 早見表画像があれば取得してパーツに追加 (マルチイメージ対応)
    let legendPromptAdd = "";
    if (legendUrl) {
      try {
        const marker = "/api/images/";
        const markerIdx = legendUrl.indexOf(marker);

        if (markerIdx !== -1 && c.env.BUCKET) {
          // A. 自分の配信サーバーのパス（/api/images/）であれば、R2から直接ロードする（最速・安全）
          const r2Key = legendUrl.substring(markerIdx + marker.length);
          const r2Object = await c.env.BUCKET.get(r2Key);
          
          if (r2Object) {
            const legendBytes = await r2Object.arrayBuffer();
            const legendBase64 = arrayBufferToBase64(legendBytes);
            const legendMimeType = r2Object.httpMetadata?.contentType || "image/png";

            imageParts.push({
              inlineData: {
                mimeType: legendMimeType,
                data: legendBase64
              }
            });

            legendPromptAdd = `\n⚠️ 【画像 2】は、このチームが使用しているスコア記号の早見表（レジェンド）です。この画像 2 に定義されている記号の記述ルール（三振、四球、ヒットなどの独自の表現）を最優先にして、画像 1（手書きスコアブック）を解析してください。`;
          }
        } else {
          // B. 外部URLなどの場合は HTTP でフェッチする
          let targetUrl = legendUrl;
          if (legendUrl.startsWith("/")) {
            // 相対URLの場合はリクエストのホスト名（オリジン）を付与して絶対URLにする
            const requestUrl = new URL(c.req.url);
            targetUrl = `${requestUrl.origin}${legendUrl}`;
          }

          const legendRes = await fetch(targetUrl);
          if (legendRes.ok) {
            const legendBytes = await legendRes.arrayBuffer();
            const legendBase64 = arrayBufferToBase64(legendBytes);
            const legendMimeType = legendRes.headers.get("content-type") || "image/png";

            imageParts.push({
              inlineData: {
                mimeType: legendMimeType,
                data: legendBase64
              }
            });

            legendPromptAdd = `\n⚠️ 【画像 2】は、このチームが使用しているスコア記号の早見表（レジェンド）です。この画像 2 に定義されている記号の記述ルール（三振、四球、ヒットなどの独自の表現）を最優先にして、画像 1（手書きスコアブック）を解析してください。`;
          }
        }
      } catch (err) {
        console.error("Failed to load scorebook legend image:", err);
      }
    }

    // E. プロンプトの設計
    const prompt = `あなたは野球のスコアブック（主に日本で主流の早稲田式・成美堂式）の記号と構造を完全に理解したAIスコアラーです。
添付されたスコアブックの画像（画像 1）を精確に解析し、打席ごとのプレイイベントを構造化データとして出力してください。
${legendPromptAdd}${lineupPrompt}

早稲田式スコアブックの読み取りルール:
1. 各マスは1打席を表します。マスの中央にある記号が最終的な打撃結果またはアウト時の守備位置です。
2. 進塁はマスのひし形の枠線と実線で表されます（右下:1塁, 右上:2塁, 左上:3塁, 左下:本塁）。
3. マスの右下にある丸数字（①, ②, ③）はそのイニングでのアウトカウントです。
4. 【投球履歴（BSO）の解析】: マスの中には、ボール(B)・ストライク(S)・ファウル等の投球ごとの記録が小さなチェックマークや数字で書かれています。これらを読み取り、最終的なボール数(b)とストライク数(s)、および1球ごとの投球結果(pi: 例 ["ボール", "ストライク", "ファウル", "センター前ヒット"]) を抽出してください。
5. 【超重要】画像に含まれるすべてのイニングと全打席を漏れなく最後まで解析してください。途中で打ち切らないでください。

出力フォーマットは必ず以下のJSON形式に従い、\`\`\`json と \`\`\` で囲んで出力してください。
【JSON構造】
{
  "events": [
    {
      "i": 1,             // inning
      "t": true,          // isTop
      "bo": 1,            // battingOrder
      "b": "選手名",      // batterName
      "p": "選手名",      // pitcherName
      "r": "打席結果",    // result
      "o": 1,             // outsInThisPlay
      "eo": 1,            // endingOuts
      "ru": 0,            // runsInThisPlay
      "b": 2,             // 最終ボールカウント (数値)
      "s": 2,             // 最終ストライクカウント (数値)
      "pi": [             // 1球ごとの投球履歴 (配列)
        "ボール",
        "ストライク",
        "ボール",
        "ファウル",
        "センター前ヒット"
      ],
      "a": [              // advances
        {
          "rn": "走者名", // runnerName
          "f": "1B",      // from
          "t": "2B",      // to
          "m": "盗塁"     // method
        }
      ]
    }
  ]
}
}
注意: \`f\` と \`t\` は "1B", "2B", "3B", "HP" のいずれかを使用してください。`;

    // F. Gemini API の呼び出し (HTTP Fetch)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              ...imageParts
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return c.json({ success: false, error: `Gemini API Error: ${errorText}` }, 500);
    }

    const geminiData = await geminiRes.json() as any;
    const finishReason = geminiData.candidates?.[0]?.finishReason;
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      return c.json({ success: false, error: `AIからの解析結果が空でした (終了理由: ${finishReason})` }, 500);
    }

    let jsonText = responseText.trim();
    if (jsonText.startsWith("```")) {
      const cleaned = jsonText.replace(/^```[a-zA-Z0-9]*\n/, "").replace(/\n```$/, "");
      jsonText = cleaned.trim();
    }
    
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (parseError: any) {
      console.error("JSON parse failed. Raw text:", jsonText);
      throw new Error(`JSON構文エラー (${finishReason}): ${parseError.message}\n--- 生データ ---\n${jsonText.slice(0, 1000)}`);
    }
    const rawEvents = parsedJson.events || [];
    
    // 短縮キー（i, t, boなど）をAtBatEvent形式にマッピングする（互換性のためフルキーへのフォールバックも用意）
    const events: AtBatEvent[] = rawEvents.map((e: any) => {
      const mappedEvent: AtBatEvent = {
        inning: e.i,
        isTop: e.t,
        battingOrder: e.bo,
        batterName: e.b || "",
        pitcherName: e.p || "",
        result: e.r || "",
        outsInThisPlay: e.o || 0,
        endingOuts: e.eo || 0,
        runsInThisPlay: e.ru || 0,
        balls: e.b || 0,
        strikes: e.s || 0,
        pitches: e.pi || [],
        advances: (e.a || []).map((a: any) => ({
          runnerName: a.rn ?? a.runnerName,
          from: a.f ?? a.from,
          to: a.t ?? a.to,
          method: a.m ?? a.method
        }))
      };
      return mappedEvent;
    });

    // G. 論理矛盾検知（Validation）の実行
    const validationMessages = validateEvents(events);

    return c.json({
      success: true,
      events,
      validationMessages
    });

  } catch (error: any) {
    console.error("Scorebook import error:", error);
    const details = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
    return c.json({ 
      success: false, 
      error: `解析処理中にエラーが発生しました: ${error.message || error}`,
      details
    }, 500);
  }
});

scorebookRouter.post("/:id/scorebook/save", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const matchId = c.req.param("id") as string;

  try {
    const body = await c.req.json() as { events: AtBatEvent[], validationMessages?: ValidationMessage[] };
    if (!body.events || !Array.isArray(body.events)) {
      return c.json({ success: false, error: "打席イベントデータが必要です" }, 400);
    }

    await MatchService.saveScorebookImport(db, matchId, body.events, body.validationMessages || []);
    return c.json({ success: true });

  } catch (error: any) {
    console.error("Scorebook save error:", error);
    return c.json({ 
      success: false, 
      error: error.message || "データの保存中にエラーが発生しました",
      stack: error.stack,
      details: String(error)
    }, 500);
  }
});

// H. 野球ルール検証のヘルパー関数
function validateEvents(events: AtBatEvent[]): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  
  // イニング・表裏ごとにグループ化して検証
  const groups: { [key: string]: AtBatEvent[] } = {};
  events.forEach(e => {
    const key = `${e.inning}-${e.isTop ? 'top' : 'bottom'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  for (const key in groups) {
    const inningEvents = groups[key].sort((a, b) => a.battingOrder - b.battingOrder);
    if (inningEvents.length === 0) continue;

    let accumulatedOuts = 0;
    let currentRunners: { [key: string]: string } = {};

    for (let i = 0; i < inningEvents.length; i++) {
      const e = inningEvents[i];
      
      accumulatedOuts += e.outsInThisPlay;
      if (accumulatedOuts > 3) {
        messages.push({
          type: 'ERROR',
          inning: e.inning,
          isTop: e.isTop,
          battingOrder: e.battingOrder,
          message: `イニング内のアウト数が3を超えています（現在のアウト数: ${accumulatedOuts}）。アウト記入ミスの可能性があります。`
        });
      }

      if (accumulatedOuts === 3 && i < inningEvents.length - 1) {
        messages.push({
          type: 'ERROR',
          inning: e.inning,
          isTop: e.isTop,
          battingOrder: e.battingOrder,
          message: `すでに3アウトでチェンジしているはずですが、後続の打席データが存在します。`
        });
      }

      const batterAdvance = e.advances.find(adv => adv.runnerName === e.batterName);
      
      if (!e.result.startsWith('E') && !e.result.startsWith('FC') && !e.result.includes('B') && !e.result.match(/^[1-9]+$/) && !batterAdvance && e.outsInThisPlay === 0) {
        messages.push({
          type: 'WARNING',
          inning: e.inning,
          isTop: e.isTop,
          battingOrder: e.battingOrder,
          message: `打者「${e.batterName}」がアウトになっておらず、進塁情報もありません（結果: ${e.result}）。進塁マークの書き漏らしの可能性があります。`
        });
      }

      e.advances.forEach(adv => {
        if (adv.from && !currentRunners[adv.from]) {
          messages.push({
            type: 'WARNING',
            inning: e.inning,
            isTop: e.isTop,
            battingOrder: e.battingOrder,
            message: `塁上（${adv.from}）にいないはずの「${adv.runnerName}」の進塁（${adv.from} ➔ ${adv.to}）が記録されています。直前の打席での出塁・進塁の書き漏らし、または盗塁マークの書き忘れの可能性があります。`
          });
        }
      });

      const homeInCount = e.advances.filter(adv => adv.to === 'HP').length;
      if (homeInCount !== e.runsInThisPlay) {
        messages.push({
          type: 'ERROR',
          inning: e.inning,
          isTop: e.isTop,
          battingOrder: e.battingOrder,
          message: `この打席での得点数（${e.runsInThisPlay}点）と、実際に本塁へ生還した走者数（${homeInCount}人）が一致していません。得点の記入ミス、または本塁生還線の書き漏らしがあります。`
        });
      }

      const nextRunners: { [key: string]: string } = {};
      e.advances.forEach(adv => {
        if (adv.to !== 'HP') {
          nextRunners[adv.to] = adv.runnerName;
        }
      });
      currentRunners = nextRunners;
    }
  }

  return messages;
}

export default scorebookRouter;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Edge ランタイムや Node.js 互換環境で Buffer が使える場合は、超高速（約1ms）で変換
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }

  // Buffer が使えない場合のフォールバック（チャンク分割で btoa を使用）
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    // @ts-ignore
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
