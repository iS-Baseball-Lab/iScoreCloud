// filepath: src/lib/liff/gemini-json-repair.ts

export interface GeminiJsonParseOptions {
  /**
   * ストリーム途中切断（MAX_TOKENS / UNKNOWN）により末尾が欠損している場合に、
   * 完結済みの配列要素まで巻き戻して閉じ括弧を補完する救出を許可するか（既定: false）
   */
  allowTruncatedSalvage?: boolean;
}

export type GeminiJsonParseOutcome<T> =
  | {
      ok: true;
      value: T;
      repaired: boolean;
      salvagedTruncated: boolean;
    }
  | {
      ok: false;
      error: string;
      likelyTruncated: boolean;
    };

interface BracketFrame {
  kind: "{" | "[";
  /** オブジェクト内で次のキー開始（または '}'）を待っている状態か */
  expectingKey: boolean;
  /** 直前に値（文字列・数値・真偽値・null・オブジェクト・配列）が完了した直後か */
  afterValue: boolean;
}

interface SyntaxRepairScanResult {
  repairedText: string;
  unclosedAtEof: boolean;
  /** ルート配列またはトップレベルプロパティ配列内の「完結した要素オブジェクト '}'」直後の出力文字位置リスト */
  completedArrayItemCutPoints: Array<{
    length: number;
    closingSuffix: string;
  }>;
  /** トップレベルオブジェクトの「完結したプロパティ値」直後のカンマ位置 */
  lastTopLevelCommaLength: number;
}

const NEXT_OBJECT_KEY_RE =
  /^"[A-Za-z_][A-Za-z0-9_]*"\s*:\s*(?:["{[\-0-9]|true\b|false\b|null\b|undefined\b)/;

const SHORT_ARRAY_STRING_TOKEN_RE = /^"[^"\r\n]{0,32}"\s*(?:,|])/;

function skipAsciiWhitespace(src: string, start: number): number {
  let idx = start;
  while (idx < src.length) {
    const code = src.charCodeAt(idx);
    if (
      code === 0x20 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      code === 0xfeff
    ) {
      idx += 1;
    } else {
      break;
    }
  }
  return idx;
}

function isJsonValueStarterChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return (
    ch === '"' ||
    ch === "{" ||
    ch === "[" ||
    ch === "-" ||
    (ch >= "0" && ch <= "9") ||
    ch === "t" ||
    ch === "f" ||
    ch === "n" ||
    ch === "u"
  );
}

function stripMarkdownFenceAndExtractEnvelope(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  if (s.startsWith("```")) {
    s = s
      .replace(/^```[a-zA-Z0-9_-]*\s*\r?\n?/, "")
      .replace(/\r?\n?```\s*$/, "")
      .trim();
  }

  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else {
    startIdx = Math.max(firstBrace, firstBracket);
  }
  if (startIdx > 0) {
    s = s.slice(startIdx);
  }
  return s.trim();
}

function popTrailingComma(chunks: string[]): void {
  for (let idx = chunks.length - 1; idx >= 0; idx -= 1) {
    const token = chunks[idx];
    const trimmed = token.trim();
    if (!trimmed) continue;
    if (trimmed === ",") {
      chunks[idx] = "";
    } else if (trimmed.endsWith(",")) {
      const lastCommaPos = token.lastIndexOf(",");
      chunks[idx] = token.slice(0, lastCommaPos) + token.slice(lastCommaPos + 1);
    }
    break;
  }
}

function buildClosingSuffix(stack: readonly BracketFrame[]): string {
  let suffix = "";
  for (let idx = stack.length - 1; idx >= 0; idx -= 1) {
    suffix += stack[idx].kind === "{" ? "}" : "]";
  }
  return suffix;
}

/**
 * Gemini 軽量モデル（flash-lite 系等）で発生しやすい JSON 構文崩れを状態機械で非破壊修復する:
 * 1. 文字列値内部の未エスケープ半角ダブルクォーテーション（例: `"obs":"右下:"6-3""` / `"rl":"遊ゴロ("6-3")"`）
 * 2. 文字列リテラル内の生改行・タブ・制御文字・不正バックスラッシュ（`\6` 等）
 * 3. プロパティ間・オブジェクト間のカンマ抜け（`{"i":1 "bo":2}`, `}{`）および末尾カンマ（`,}` / `,]`）
 * 4. 非標準リテラル（`undefined` / `NaN` / `Infinity`）の `null` 正規化
 * 5. ルート閉じ括弧以降に付随した説明文の切り捨て
 */
function scanAndRepairJsonSyntax(src: string): SyntaxRepairScanResult {
  const out: string[] = [];
  let outLen = 0;
  const push = (piece: string) => {
    if (!piece) return;
    out.push(piece);
    outLen += piece.length;
  };

  const stack: BracketFrame[] = [];
  let inString = false;
  let stringRole: "key" | "value" = "value";
  const completedArrayItemCutPoints: Array<{
    length: number;
    closingSuffix: string;
  }> = [];
  let lastTopLevelCommaLength = 0;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inString) {
      if (ch === "\\") {
        const next = src[i + 1];
        if (
          next === '"' ||
          next === "\\" ||
          next === "/" ||
          next === "b" ||
          next === "f" ||
          next === "n" ||
          next === "r" ||
          next === "t"
        ) {
          push("\\" + next);
          i += 1;
          continue;
        }
        if (next === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
          push(src.slice(i, i + 6));
          i += 5;
          continue;
        }
        // 不正なエスケープ（例: \6 や末尾単独 \）はバックスラッシュ自体をエスケープ
        push("\\\\");
        continue;
      }

      if (ch === "\n") {
        push("\\n");
        continue;
      }
      if (ch === "\r") {
        push("\\r");
        continue;
      }
      if (ch === "\t") {
        push("\\t");
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        continue;
      }

      if (ch === '"') {
        const nextIdx = skipAsciiWhitespace(src, i + 1);
        const nextCh = src[nextIdx];
        const top = stack[stack.length - 1];

        let isTrueClosingQuote = false;
        let injectCommaAfterClose = false;

        if (nextIdx >= src.length) {
          isTrueClosingQuote = true;
        } else if (stringRole === "key") {
          if (nextCh === ":") {
            isTrueClosingQuote = true;
          }
        } else if (!top) {
          isTrueClosingQuote = false;
        } else if (top.kind === "{") {
          if (nextCh === "}") {
            isTrueClosingQuote = true;
          } else if (nextCh === ",") {
            const afterCommaIdx = skipAsciiWhitespace(src, nextIdx + 1);
            const afterCommaCh = src[afterCommaIdx];
            if (
              afterCommaCh === "}" ||
              (afterCommaCh === '"' &&
                NEXT_OBJECT_KEY_RE.test(src.slice(afterCommaIdx)))
            ) {
              isTrueClosingQuote = true;
            }
          } else if (
            nextCh === '"' &&
            NEXT_OBJECT_KEY_RE.test(src.slice(nextIdx))
          ) {
            // カンマ抜け（例: "pt":"投手" "bo":1）
            isTrueClosingQuote = true;
            injectCommaAfterClose = true;
          }
        } else if (top.kind === "[") {
          if (nextCh === "]") {
            isTrueClosingQuote = true;
          } else if (nextCh === ",") {
            const afterCommaIdx = skipAsciiWhitespace(src, nextIdx + 1);
            const afterCommaCh = src[afterCommaIdx];
            if (
              afterCommaCh === "]" ||
              isJsonValueStarterChar(afterCommaCh)
            ) {
              isTrueClosingQuote = true;
            }
          } else if (
            nextCh === '"' &&
            SHORT_ARRAY_STRING_TOKEN_RE.test(src.slice(nextIdx))
          ) {
            // 配列要素間のカンマ抜け（例: ["S" "B"]）
            isTrueClosingQuote = true;
            injectCommaAfterClose = true;
          }
        }

        if (isTrueClosingQuote) {
          push('"');
          inString = false;
          if (top) {
            if (stringRole === "key") {
              top.expectingKey = false;
              top.afterValue = false;
            } else if (injectCommaAfterClose) {
              push(",");
              top.afterValue = false;
              top.expectingKey = top.kind === "{";
            } else {
              top.afterValue = true;
            }
          }
        } else {
          // 文字列値内部の未エスケープ引用符として保護
          push('\\"');
        }
        continue;
      }

      push(ch);
      continue;
    }

    // ── 文字列外 ──
    if (
      ch === " " ||
      ch === "\t" ||
      ch === "\n" ||
      ch === "\r" ||
      ch === "\uFEFF" ||
      ch === "\u200B"
    ) {
      push(ch === "\uFEFF" || ch === "\u200B" ? "" : ch);
      continue;
    }

    const top = stack[stack.length - 1];

    if (ch === "{") {
      if (top && top.afterValue) {
        push(",");
        top.afterValue = false;
      }
      push("{");
      stack.push({ kind: "{", expectingKey: true, afterValue: false });
      continue;
    }

    if (ch === "[") {
      if (top && top.afterValue) {
        push(",");
        top.afterValue = false;
      }
      push("[");
      stack.push({ kind: "[", expectingKey: false, afterValue: false });
      continue;
    }

    if (ch === "}" || ch === "]") {
      const expectedClose = top ? (top.kind === "{" ? "}" : "]") : ch;
      if (ch !== expectedClose) {
        continue;
      }
      popTrailingComma(out);
      outLen = out.reduce((acc, part) => acc + part.length, 0);
      push(ch);
      stack.pop();

      const parent = stack[stack.length - 1];
      if (parent) {
        parent.afterValue = true;
        parent.expectingKey = false;
        // 配列内の1要素オブジェクト `{ ... }` が完結した直後の安全チェックポイントを記録
        if (ch === "}" && parent.kind === "[" && stack.length <= 2) {
          completedArrayItemCutPoints.push({
            length: outLen,
            closingSuffix: buildClosingSuffix(stack),
          });
        }
      } else {
        // ルート JSON オブジェクト／配列が完結したため、後続の余計な説明テキストを切り捨てる
        break;
      }
      continue;
    }

    if (ch === '"') {
      if (top && top.afterValue) {
        push(",");
        top.afterValue = false;
        if (top.kind === "{") {
          top.expectingKey = true;
        }
      }
      inString = true;
      stringRole = top && top.kind === "{" && top.expectingKey ? "key" : "value";
      push('"');
      continue;
    }

    if (ch === ":") {
      if (top && top.kind === "{") {
        top.expectingKey = false;
        top.afterValue = false;
      }
      push(":");
      continue;
    }

    if (ch === ",") {
      if (top) {
        if (!top.afterValue) {
          // 連続カンマ `,,` や先頭カンマ `[,` は除去
          continue;
        }
        top.afterValue = false;
        if (top.kind === "{") {
          top.expectingKey = true;
          if (stack.length === 1) {
            lastTopLevelCommaLength = outLen;
          }
        }
      }
      push(",");
      continue;
    }

    // 数値・真偽値・null・undefined・NaN・Infinity トークン
    const tokenMatch = src
      .slice(i)
      .match(/^(?:true|false|null|undefined|NaN|-?Infinity|[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (tokenMatch) {
      const rawTok = tokenMatch[0];
      if (top && top.afterValue) {
        push(",");
        top.afterValue = false;
      }
      if (
        rawTok === "undefined" ||
        rawTok === "NaN" ||
        rawTok === "Infinity" ||
        rawTok === "-Infinity"
      ) {
        push("null");
      } else if (rawTok.startsWith("+")) {
        push(rawTok.slice(1));
      } else {
        push(rawTok);
      }
      if (top) {
        top.afterValue = true;
        top.expectingKey = false;
      }
      i += rawTok.length - 1;
      continue;
    }

    push(ch);
  }

  return {
    repairedText: out.join(""),
    unclosedAtEof: inString || stack.length > 0,
    completedArrayItemCutPoints,
    lastTopLevelCommaLength,
  };
}

/**
 * Gemini ストリーム応答から JSON を安全にパース・構文修復（および必要時のみ途中切断救出）する純関数。
 */
export function repairAndParseGeminiJson<T>(
  rawText: string,
  options?: GeminiJsonParseOptions
): GeminiJsonParseOutcome<T> {
  const envelope = stripMarkdownFenceAndExtractEnvelope(rawText);
  if (!envelope) {
    return {
      ok: false,
      error: "Empty JSON payload",
      likelyTruncated: true,
    };
  }

  // 1. 最速パス: 標準 JSON としてそのままパース可能なら無加工で返却
  try {
    const direct = JSON.parse(envelope) as T;
    return {
      ok: true,
      value: direct,
      repaired: false,
      salvagedTruncated: false,
    };
  } catch (directErr) {
    const directErrorMsg =
      directErr instanceof Error ? directErr.message : String(directErr);

    // 2. 構文修復パス（未エスケープ引用符・生改行・カンマ抜け・末尾カンマ・後続テキスト除去）
    const scanned = scanAndRepairJsonSyntax(envelope);
    if (!scanned.unclosedAtEof) {
      try {
        const repairedVal = JSON.parse(scanned.repairedText) as T;
        return {
          ok: true,
          value: repairedVal,
          repaired: true,
          salvagedTruncated: false,
        };
      } catch (repairedErr) {
        const msg =
          repairedErr instanceof Error
            ? repairedErr.message
            : directErrorMsg;
        return {
          ok: false,
          error: msg,
          likelyTruncated: false,
        };
      }
    }

    // 3. ストリーム途中切断時の完結済み配列要素サルベージ（allowTruncatedSalvage 指定時のみ）
    if (options?.allowTruncatedSalvage) {
      for (
        let idx = scanned.completedArrayItemCutPoints.length - 1;
        idx >= 0;
        idx -= 1
      ) {
        const cp = scanned.completedArrayItemCutPoints[idx];
        const candidateJson =
          scanned.repairedText.slice(0, cp.length) + cp.closingSuffix;
        try {
          const salvagedVal = JSON.parse(candidateJson) as T;
          return {
            ok: true,
            value: salvagedVal,
            repaired: true,
            salvagedTruncated: true,
          };
        } catch {
          // 1つ前のチェックポイントを試行
        }
      }

      if (
        scanned.lastTopLevelCommaLength > 0 &&
        scanned.repairedText.startsWith("{")
      ) {
        const candidateObj =
          scanned.repairedText.slice(0, scanned.lastTopLevelCommaLength) + "}";
        try {
          const salvagedObj = JSON.parse(candidateObj) as T;
          return {
            ok: true,
            value: salvagedObj,
            repaired: true,
            salvagedTruncated: true,
          };
        } catch {
          // fall through
        }
      }
    }

    return {
      ok: false,
      error: directErrorMsg,
      likelyTruncated: true,
    };
  }
}
