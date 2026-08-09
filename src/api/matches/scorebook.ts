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

    // A. 試合に紐づくチームの「早見表画像」、相手スタメン、およびイニング別スコアボードを取得
    const match = await db.select({ 
      teamId: matches.teamId,
      opponentLineup: matches.opponentLineup,
      myScore: matches.myScore,
      opponentScore: matches.opponentScore,
      myInningScores: matches.myInningScores,
      opponentInningScores: matches.opponentInningScores,
      battingOrder: matches.battingOrder
    })
    .from(matches)
    .where(eq(matches.id, matchId as string))
    .get();
    if (!match) {
      return c.json({ success: false, error: "試合が見つかりません" }, 404);
    }

    // formData から直接渡された legendUrl もサポート
    const legendUrlFromForm = formData.get("legendUrl") as string | null;
    const team = await db.select({ scorebookLegendUrl: teams.scorebookLegendUrl }).from(teams).where(eq(teams.id, match.teamId)).get();
    const legendUrl = legendUrlFromForm || team?.scorebookLegendUrl;

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
      playerRosterPrompt = `\n⚠️ 【自チーム登録全選手リスト】自チームの所属選手一覧: [${rosterText}]\n`;
    }

    let lineupPrompt = "";
    if (lineups.length > 0) {
      const lineupText = lineups.map(l => `${l.battingOrder}番: ${l.name}`).join(", ");
      lineupPrompt = `\n⚠️ 【自チームスタメン情報】自チームのスタメン打順: [${lineupText}]\n`;
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
            opponentLineupPrompt = `\n⚠️ 【相手チーム登録スタメン】対戦相手のスタメン打順: [${oppText}]\n`;
          }
        }
      } catch (e) {}
    }

    const isMyTeamFirst = match.battingOrder === "first";
    let teamAttackRulePrompt = "";
    if (isMyTeamFirst) {
      teamAttackRulePrompt = `
⚠️ 【超重要: 先攻/後攻と打者・投手の割り当てルール】
この試合で、自チームは【先攻 (表の攻撃)】、相手チームは【後攻 (裏の攻撃)】です。
1. **表の攻撃 (t: true)** ➔ 【自チームの打席イニング】です。
   ・バッター名(b): 「自チームスタメン情報」および「自チーム登録全選手リスト」から名寄せして適用してください。
   ・投手名(p): 対戦相手の投手名（画像内の手書き文字）を出力してください。
2. **裏の攻撃 (t: false)** ➔ 【相手チームの打席イニング】です。
   ・バッター名(b): 「相手チーム登録スタメン」の選手名を適用してください（※絶対に自チームの選手名を適用しないでください！）。
   ・投手名(p): 「自チーム登録全選手リスト」に最も近い自チームの投手名を適用してください。`;
    } else {
      teamAttackRulePrompt = `
⚠️ 【超重要: 先攻/後攻と打者・投手の割り当てルール】
この試合で、自チームは【後攻 (裏の攻撃)】、相手チームは【先攻 (表の攻撃)】です。
1. **表の攻撃 (t: true)** ➔ 【相手チームの打席イニング】です。
   ・バッター名(b): 「相手チーム登録スタメン」の選手名を適用してください（※絶対に自チームの選手名を適用しないでください！）。
   ・投手名(p): 「自チーム登録全選手リスト」に最も近い自チームの投手名を適用してください。
2. **裏の攻撃 (t: false)** ➔ 【自チームの打席イニング】です。
   ・バッター名(b): 「自チームスタメン情報」および「自チーム登録全選手リスト」から名寄せして適用してください。
   ・投手名(p): 対戦相手の投手名（画像内の手書き文字）を出力してください。`;
    }

    let scoreboardPrompt = "";
    if (match) {
      try {
        const myScores: number[] = JSON.parse(match.myInningScores || "[]");
        const oppScores: number[] = JSON.parse(match.opponentInningScores || "[]");
        
        const topScores = isMyTeamFirst ? myScores : oppScores;
        const bottomScores = isMyTeamFirst ? oppScores : myScores;
        
        const scoreSummaryLines: string[] = [];
        if (topScores.length > 0) {
          scoreSummaryLines.push(`・【表（先攻）イニング別得点】: ${topScores.map((s, idx) => `${idx + 1}回:${s}点`).join(", ")} (合計: ${isMyTeamFirst ? (match.myScore ?? 0) : (match.opponentScore ?? 0)}点)`);
        }
        if (bottomScores.length > 0) {
          scoreSummaryLines.push(`・【裏（後攻）イニング別得点】: ${bottomScores.map((s, idx) => `${idx + 1}回:${s}点`).join(", ")} (合計: ${isMyTeamFirst ? (match.opponentScore ?? 0) : (match.myScore ?? 0)}点)`);
        }

        if (scoreSummaryLines.length > 0) {
          scoreboardPrompt = `\n⚠️ 【精度向上用ヒント: 登録済みイニング別スコアボード】
この試合の確定（または入力済み）スコアボード情報は以下の通りです。各打席での得点数(ru)や本塁生還進塁(HP)を解析する際は、イニングごとの得点数がこのスコアボード結果と矛盾しないように優先して照合してください。
${scoreSummaryLines.join("\n")}\n`;
        }
      } catch (e) {}
    }

    // C. Gemini API 用の画像パーツリストを構築 (画像1: 手書きスコアブック)
    const imageParts: any[] = [
      {
        inlineData: {
          mimeType: fileMimeType,
          data: fileBase64
        }
      }
    ];

    // D. 早見表画像があれば取得してパーツに追加 (マルチイメージ対応: 画像2)
    let legendPromptAdd = "";
    let isLegendLoaded = false;

    if (legendUrl) {
      try {
        if (legendUrl.startsWith("data:")) {
          // A-1. Data URI (data:image/png;base64,...) の直接パース
          const [header, base64Data] = legendUrl.split(",");
          const mimeMatch = header.match(/data:(.*?);/);
          const legendMimeType = mimeMatch ? mimeMatch[1] : "image/png";

          if (base64Data) {
            imageParts.push({
              inlineData: {
                mimeType: legendMimeType,
                data: base64Data.trim()
              }
            });
            isLegendLoaded = true;
          }
        } else {
          const marker = "/api/images/";
          const markerIdx = legendUrl.indexOf(marker);

          if (markerIdx !== -1 && c.env.BUCKET) {
            // A-2. R2 から直接ロード
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
              isLegendLoaded = true;
            }
          } else {
            // A-3. HTTP / Relative URL のフェッチ
            let targetUrl = legendUrl;
            if (legendUrl.startsWith("/")) {
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
              isLegendLoaded = true;
            } else {
              console.warn(`[ScorebookImport] Failed to fetch legendUrl (Status ${legendRes.status}): ${targetUrl}`);
            }
          }
        }

        if (isLegendLoaded) {
          legendPromptAdd = `\n🔥【最重要ルール: 添付画像 2 の「記号早見表（レジェンド）」の絶対遵守】
添付された【画像 2】は、このチームが公式に登録している「スコア記号早見表（レジェンド）」です。
画像 2 には、このチーム特有の記号・略称・図形（例: 安打、アウト、三振、四死球、盗塁、牽制死、牽制悪送球、牽制球などの独自の表記や書き方ルール）が定義されています。
画像 1（手書きスコアブック）のマスを解析する際は、画像 2 の定義と照らし合わせ、画像 2 に記載されている記号ルールを『最優先』として解析結果を出力してください。画像 2 の記号と一般的な早稲田式スコアの解釈が衝突する場合は、必ず画像 2 の定義を優先してください。`;
        }
      } catch (err) {
        console.error("[ScorebookImport] Failed to load scorebook legend image:", err);
      }
    }

    // E. プロンプトの設計
    const prompt = `あなたは野球のスコアブック（主に日本で主流の早稲田式・成美堂式）の記号と構造を完全に理解したAIスコアラーです。
添付されたスコアブックの画像（画像 1）を精確に解析し、打席ごとのプレイイベントを構造化データとして出力してください。
${legendPromptAdd}${playerRosterPrompt}${lineupPrompt}${opponentLineupPrompt}${teamAttackRulePrompt}${scoreboardPrompt}

早稲田式スコアブックの読み取りルール:
1. 各マスは1打席を表します。マスの中央にある記号が最終的な打撃結果またはアウト時の守備位置です。
2. 進塁はマスのひし形の枠線と実線で表されます（右下:1塁, 右上:2塁, 左上:3塁, 左下:本塁）。
3. マスの右下にある丸数字（①, ②, ③）はそのイニングでのアウトカウントです。
4. 【投球履歴（BSO）の解析】: マスの中には、ボール(B)・ストライク(S)・ファウル等の投球ごとの記録が小さなチェックマークや数字で書かれています。これらを読み取り、最終的なボール数(b)とストライク数(s)、および1球ごとの投球結果(pi: 例 ["ボール", "ストライク", "牽制", "ファウル", "センター前ヒット"]) を抽出してください。投球履歴欄の 'k', 'K', '牽' などの表記は「牽制」として認識してください。
5. 【投手名(p)の抽出ルール】: 各打席で対峙している投手の名前を抽出してください。投手交代の特記がない限り、イニングを跨いでも前の打席と同じ投手名を維持して出力してください。自チームの投球イニング（相手の攻撃）での投手名は、上記の「自チーム登録全選手リスト」に最も近いものに名寄せして出力してください。
6. 【得点数(ru)の抽出ルール】: マス内の本塁生還(HP)や本塁打(HR)など、その打席で発生した得点数を ru (数値) に正確に設定してください。
7. 【超重要】画像に含まれるすべてのイニングと全打席を漏れなく最後まで解析してください。途中で打ち切らないでください。
8. 【安打（ヒット）の解析ルール】:
   スコアブックにおける安打（ヒット）は、マス内に以下のような記号・表記で記録されます。これらを絶対にアウト（フライやゴロ）と誤認せず、「安打（ヒット）」として抽出してください。
   - **単打・二塁打・三塁打・本塁打**: '1B', '2B', '3B', 'HR', 'H', '本塁打', '二塁打' などの表記。
   - **打球方向の数字＋ヒット表記**: マス内に数字 '7' (レフト), '8' (センター), '9' (ライト), '5' (サード), '6' (ショート), '4' (セカンド), '3' (ファースト) が書かれ、そこに一本線・波線・斜線が付いている、あるいは単にヒットとして書かれている場合は、アウトではなく 「7前安打 (レフト前ヒット)」 や 「8中安打 (センター前ヒット)」 のように、必ず 「ヒット」または「安打」の文字を含めて打撃結果(r)に出力 してください。
   - **ヒットとアウトの判別**: '7F' は「レフトフライ（アウト）」、'7L' は「レフトライナー（アウト）」、'7-3' や '6-3' は「ゴロアウト」。明確にフライ(F)やゴロ(ハイフン)の表記がない限り、外野打球数字 '7', '8', '9' は安打（ヒット）として優先的に解析してください。
9. 【牽制球・牽制死・牽制悪送球の解析ルール】:
   - **牽制死（牽制アウト）**: 進塁線上に 'P-O', 'P.O', 'PO', 'TO' (Throw Out), '牽制死', '牽死' や、守備送球番号（例: 投手牽制1塁死なら '1-3', '1-4', 捕手牽制なら '2-3', '2-4'）とアウト記号（波線・×・丸数字 ①等）が記録されている場合は、走者の進塁情報(a)に "m": "牽制死", "io": true, "f": "1B" (元の塁), "t": "1B" (または目標塁) として追加し、o (この打席のアウト数) に1を加算してください。
   - **牽制悪送球**: 牽制の悪送球による進塁の場合、進塁線の記号（'E1', 'E2' や '1'の丸印など）から "m": "牽制悪送球", "io": false として進塁情報(a)を抽出してください。
10. 【手書きマスの解釈例 (Few-Shot Pattern)】:
   - 例1: マス中央に '8'、右下に ① ➔ 結果 r: "8飛" (センターフライ), o: 1
   - 例2: マス中央に '7' に横線 ➔ 結果 r: "7前安打" (レフト前ヒット), o: 0, a: [{"rn": "打者名", "f": "1B", "t": "1B", "m": "安打", "io": false}]
   - 例3: 右下線上に波線＋'P-O' ➔ 進塁 a: [{"rn": "走者名", "f": "1B", "t": "1B", "m": "牽制死", "io": true}], o: 1
   - 例4: BSO欄に 'B','B','S','B','B' ➔ 結果 r: "四球", bl: 4, s: 1

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
        "牽制",
        "ファウル",
        "センター前ヒット"
      ],
      "a": [              // advances
        {
          "rn": "走者名", // runnerName
          "f": "1B",      // from
          "t": "2B",      // to
          "m": "盗塁",    // method (例: "盗塁", "牽制死", "牽制悪送球", "暴投")
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
          temperature: 0.0,
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
