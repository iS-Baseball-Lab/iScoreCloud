// filepath: src/api/matches/scorebook.ts
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { MatchService } from "@/services/match.service";
import * as schema from "@/db/schema";
import type { WorkerEnv, AtBatEvent, ValidationMessage } from "@/types/api";

const scorebookRouter = new Hono<{ Bindings: WorkerEnv }>();

const { matches, teams } = schema;

// 1. スコアブック画像のAI解析エンドポイント
scorebookRouter.post("/import", async (c) => {
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

    // B. アップロード画像を Base64 にエンコード
    const fileBytes = await file.arrayBuffer();
    const fileBase64 = Buffer.from(fileBytes).toString("base64");
    const fileMimeType = file.type || "image/png";

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
            const legendBase64 = Buffer.from(legendBytes).toString("base64");
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
            const legendBase64 = Buffer.from(legendBytes).toString("base64");
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
${legendPromptAdd}

早稲田式スコアブックの読み取りルール:
1. 各マスは1打席を表します。マスの中央にある記号が最終的な打撃結果またはアウト時の守備位置です（例: 「5-3」はサードゴロ、「K」は三振、「B」または「BB」は四球、「7」はレフト前安打、「8」はセンターフライ、「E6」はショートのエラーなど）。
2. マスの中にあるひし形の枠線と、そこに引かれた実線が進塁を表します。
   - 右下の線：1塁への進塁
   - 右上の線：2塁への進塁
   - 左上の線：3塁への進塁
   - 左下の線および赤などで塗りつぶされたひし形：本塁への生還（得点）
   - 各進塁の横に書かれている小さな記号や数字は進塁理由（例: 「S」は盗塁、「WP」はワイルドピッチ、「E」はエラーなど）。
3. マスの右下にある丸で囲まれた数字（例: ①, ②, ③）は、そのイニングでのアウトカウントを表します。
4. 各イニングは、3アウトになった打席で終了（チェンジ）し、そのマスの右下や右側に斜めの二重線「//」などが描かれて区切られます。

出力フォーマットは指定された JSON スキーマに従ってください。手書き文字の解読には細心の注意を払い、打順(1〜9)とイニング(1〜7または9)が整合するようにマッピングしてください。`;

    // F. Gemini API の呼び出し (HTTP Fetch)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
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
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              events: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    inning: { type: "INTEGER" },
                    isTop: { type: "BOOLEAN" },
                    battingOrder: { type: "INTEGER" },
                    batterName: { type: "STRING" },
                    pitcherName: { type: "STRING" },
                    result: { type: "STRING" },
                    outsInThisPlay: { type: "INTEGER" },
                    endingOuts: { type: "INTEGER" },
                    runsInThisPlay: { type: "INTEGER" },
                    advances: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          runnerName: { type: "STRING" },
                          from: { type: "STRING", enum: ["1B", "2B", "3B", "HP"] },
                          to: { type: "STRING", enum: ["1B", "2B", "3B", "HP"] },
                          method: { type: "STRING" }
                        },
                        required: ["runnerName", "to"]
                      }
                    }
                  },
                  required: ["inning", "isTop", "battingOrder", "batterName", "pitcherName", "result", "outsInThisPlay", "endingOuts", "runsInThisPlay", "advances"]
                }
              }
            },
            required: ["events"]
          }
        }
      })
    });

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      return c.json({ success: false, error: `Gemini API Error: ${errorText}` }, 500);
    }

    const geminiData = await geminiRes.json() as any;
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      return c.json({ success: false, error: "AIからの解析結果が空でした" }, 500);
    }

    const parsedJson = JSON.parse(responseText) as { events: AtBatEvent[] };
    const events = parsedJson.events || [];

    // G. 論理矛盾検知（Validation）の実行
    const validationMessages = validateEvents(events);

    return c.json({
      success: true,
      events,
      validationMessages
    });

  } catch (error: any) {
    console.error("Scorebook import error:", error);
    return c.json({ success: false, error: error.message || "解析処理中にエラーが発生しました" }, 500);
  }
});

// 2. 確定データの一括保存エンドポイント
scorebookRouter.post("/save", async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const matchId = c.req.param("id") as string;

  try {
    const body = await c.req.json() as { events: AtBatEvent[] };
    if (!body.events || !Array.isArray(body.events)) {
      return c.json({ success: false, error: "打席イベントデータが必要です" }, 400);
    }

    await MatchService.saveScorebookImport(db, matchId, body.events);
    return c.json({ success: true });

  } catch (error: any) {
    console.error("Scorebook save error:", error);
    return c.json({ success: false, error: error.message || "データの保存中にエラーが発生しました" }, 500);
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
