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

    // A. 試合に紐づくチームの「早見表画像」および相手スタメンを取得
    const match = await db.select({ 
      teamId: matches.teamId,
      opponentLineup: matches.opponentLineup
    })
    .from(matches)
    .where(eq(matches.id, matchId as string))
    .get();
    if (!match) {
      return c.json({ success: false, error: "試合が見つかりません" }, 404);
    }

    const team = await db.select({ scorebookLegendUrl: teams.scorebookLegendUrl }).from(teams).where(eq(teams.id, match.teamId)).get();
    const legendUrl = team?.scorebookLegendUrl;

    const fileBytes = await file.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(fileBytes);
    const fileMimeType = file.type || "image/png";

    // C-0. チームの登録全選手およびスタメン情報を取得してプロンプトに注入
    const allPlayers = await db.select({
      id: schema.players.id,
      name: schema.players.name,
      nameKana: schema.players.nameKana,
      uniformNumber: schema.players.uniformNumber
    })
    .from(schema.players)
    .where(eq(schema.players.teamId, match.teamId))
    .all();

    const lineups = await db.select({
      battingOrder: schema.matchLineups.battingOrder,
      name: schema.players.name
    })
    .from(schema.matchLineups)
    .innerJoin(schema.players, eq(schema.matchLineups.playerId, schema.players.id))
    .where(eq(schema.matchLineups.matchId, matchId))
    .orderBy(asc(schema.matchLineups.battingOrder))
    .all();

    let playerRosterPrompt = "";
    if (allPlayers.length > 0) {
      const rosterText = allPlayers.map(p => p.uniformNumber ? `${p.name}${p.nameKana ? `(${p.nameKana})` : ''} [#${p.uniformNumber}]` : p.name).join(", ");
      playerRosterPrompt = `\n⚠️ 【重要: 自チーム登録全選手リスト】このチーム（自チーム）に所属する選手一覧は以下の通りです。スコアブックに苗字のみや略称で記載されている場合でも、このリストに存在する正式名称（フルネーム）に最も近い選手名を選択・名寄せして出力してください。バッター名(b)および投手名(p)（自チームの投球イニングの投手）の両方に適用してください。\n[${rosterText}]\n`;
    }

    let lineupPrompt = "";
    if (lineups.length > 0) {
      const lineupText = lineups.map(l => `${l.battingOrder}番: ${l.name}`).join(", ");
      lineupPrompt = `\n⚠️ 【重要: 自チームスタメン情報】この試合の自チームのスタメン打順は以下の通りです。打順(bo)に対応する選手名は、このスタメンリストの選手名を最優先で一致させてください。\n[${lineupText}]\n`;
    }

    let opponentLineupPrompt = "";
    if (match?.opponentLineup) {
      try {
        const oppLineup = JSON.parse(match.opponentLineup);
        if (Array.isArray(oppLineup) && oppLineup.length > 0) {
          const oppText = oppLineup
            .filter((p: any) => p.name)
            .map((p: any) => p.order > 0 ? `${p.order}番: ${p.name}` : p.name)
            .join(", ");
          if (oppText) {
            opponentLineupPrompt = `\n⚠️ 【重要: 相手チームの登録スタメン】この試合の対戦相手（相手チーム）のスタメン情報は以下の通りです。相手チームの打席におけるバッター名(b)は、このリストの選手名に最も近いものに名寄せして出力してください。\n[${oppText}]\n`;
          }
        }
      } catch (e) {}
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
${legendPromptAdd}${playerRosterPrompt}${lineupPrompt}${opponentLineupPrompt}

早稲田式スコアブックの読み取りルール:
1. 各マスは1打席を表します。マスの中央にある記号が最終的な打撃結果またはアウト時の守備位置です。
2. 進塁はマスのひし形の枠線と実線で表されます（右下:1塁, 右上:2塁, 左上:3塁, 左下:本塁）。
3. マスの右下にある丸数字（①, ②, ③）はそのイニングでのアウトカウントです。
4. 【投球履歴（BSO）の解析】: マスの中には、ボール(B)・ストライク(S)・ファウル等の投球ごとの記録が小さなチェックマークや数字で書かれています。これらを読み取り、最終的なボール数(b)とストライク数(s)、および1球ごとの投球結果(pi: 例 ["ボール", "ストライク", "ファウル", "センター前ヒット"]) を抽出してください。
5. 【投手名(p)の抽出ルール】: 各打席で対峙している投手の名前を抽出してください。投手交代の特記がない限り、イニングを跨いでも前の打席と同じ投手名を維持して出力してください。自チームの投球イニング（相手の攻撃）での投手名は、上記の「自チーム登録全選手リスト」に最も近いものに名寄せして出力してください。
6. 【得点数(ru)の抽出ルール】: マス内の本塁生還(HP)や本塁打(HR)など、その打席で発生した得点数を ru (数値) に正確に設定してください。
7. 【超重要】画像に含まれるすべてのイニングと全打席を漏れなく最後まで解析してください。途中で打ち切らないでください。

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
      "bl": 2,            // 最終ボールカウント (数値)
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
          "m": "盗塁",    // method
          "io": false,    // 進塁失敗によるアウトか (isOut, boolean)
          "pn": 3         // この進塁が起きた球数 (pitchNumber, 数値, オプショナル)
        }
      ]
    }
  ]
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
        inning: typeof e.i === 'number' ? e.i : (typeof e.inning === 'number' ? e.inning : 1),
        isTop: typeof e.t === 'boolean' ? e.t : (typeof e.isTop === 'boolean' ? e.isTop : true),
        battingOrder: typeof e.bo === 'number' ? e.bo : (typeof e.battingOrder === 'number' ? e.battingOrder : 1),
        batterName: typeof e.b === 'string' ? e.b : (typeof e.batterName === 'string' ? e.batterName : (e.b !== undefined && typeof e.b !== 'number' ? String(e.b) : (e.batterName ? String(e.batterName) : ""))),
        pitcherName: typeof e.p === 'string' ? e.p : (typeof e.pitcherName === 'string' ? e.pitcherName : (e.p ? String(e.p) : (e.pitcherName ? String(e.pitcherName) : ""))),
        result: typeof e.r === 'string' ? e.r : (typeof e.result === 'string' ? e.result : (e.r ? String(e.r) : (e.result ? String(e.result) : ""))),
        outsInThisPlay: typeof e.o === 'number' ? e.o : (typeof e.outsInThisPlay === 'number' ? e.outsInThisPlay : 0),
        endingOuts: typeof e.eo === 'number' ? e.eo : (typeof e.endingOuts === 'number' ? e.endingOuts : 0),
        runsInThisPlay: typeof e.ru === 'number' ? e.ru : (typeof e.runsInThisPlay === 'number' ? e.runsInThisPlay : 0),
        balls: typeof e.bl === 'number' ? e.bl : (typeof e.balls === 'number' ? e.balls : (typeof e.b === 'number' ? e.b : 0)),
        strikes: typeof e.s === 'number' ? e.s : (typeof e.strikes === 'number' ? e.strikes : 0),
        pitches: Array.isArray(e.pi) ? e.pi : (Array.isArray(e.pitches) ? e.pitches : []),
        advances: (e.a || e.advances || []).map((a: any) => ({
          runnerName: typeof a.rn === 'string' ? a.rn : (typeof a.runnerName === 'string' ? a.runnerName : String(a.rn ?? a.runnerName ?? "")),
          from: a.f ?? a.from,
          to: a.t ?? a.to,
          method: a.m ?? a.method,
          isOut: typeof a.io === 'boolean' ? a.io : (typeof a.isOut === 'boolean' ? a.isOut : undefined),
          pitchNumber: typeof a.pn === 'number' ? a.pn : (typeof a.pitchNumber === 'number' ? a.pitchNumber : undefined)
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
