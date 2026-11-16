// filepath: src/api/matches/webhook.ts
/* 💡 iScoreCloud 規約: 
   1. Cloudflare Workers + Hono で実行。
   2. 現場でのコピー性を最大化するため、特定のメッセージ「ID」に対して groupId のみを返信する。 */

import { Hono } from 'hono';
import { LineWebhookRequest } from '@/types/match';
import type { WorkerEnv } from '@/types/api';

const webhook = new Hono<{ Bindings: WorkerEnv }>();

async function verifyLineWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  channelSecret: string
): Promise<boolean> {
  if (!signatureHeader || !channelSecret) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(channelSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(rawBody)
    );
    const bytes = new Uint8Array(sigBuf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const expectedBase64 = btoa(binary);
    const provided = signatureHeader.trim();
    if (expectedBase64.length !== provided.length) return false;
    let diff = 0;
    for (let i = 0; i < expectedBase64.length; i++) {
      diff |= expectedBase64.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

webhook.post('/', async (c) => {
  const channelSecret = (
    c.env.LINE_CHANNEL_SECRET ||
    c.env.LINE_CLIENT_SECRET ||
    ''
  ).trim();
  if (!channelSecret) {
    return c.json({ error: 'Webhook secret is not configured' }, 503);
  }

  const signature = c.req.header('x-line-signature') || '';
  const rawBody = await c.req.text();
  const isSignatureValid = await verifyLineWebhookSignature(
    rawBody,
    signature,
    channelSecret
  );
  if (!isSignatureValid) {
    return c.json({ error: 'Invalid LINE signature' }, 401);
  }

  try {
    // 💡 規約: 型安全のため明示的にキャスト
    const body = JSON.parse(rawBody) as LineWebhookRequest;

    // 検証リクエストへの即時応答
    if (!body.events || body.events.length === 0) {
      return c.text('OK', 200);
    }

    for (const event of body.events) {
      // 🌟 グループイベントから ID を抽出
      if (event.source.type === 'group' && event.source.groupId) {
        const gid = event.source.groupId;

        // 🧪 デバッグプロトコル: 「ID」というメッセージに反応
        if (
          event.type === 'message' && 
          event.message?.type === 'text' && 
          event.message.text === 'ID' &&
          c.env.LINE_CHANNEL_ACCESS_TOKEN
        ) {
          // 💡 現場視認性改善: 余計な文字を排除し、groupId のみを返信
          await fetch("https://api.line.me/v2/bot/message/reply", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${c.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              replyToken: event.replyToken,
              messages: [{ 
                type: "text", 
                text: gid
              }],
            }),
          });
        }
      }
    }

    return c.text('OK', 200);
  } catch (err: unknown) {
    // エラー時はログに残しつつ、LINE側には 200 を返してリトライを防ぐ
    console.error("[iScoreCloud Webhook Error]:", err);
    return c.text('OK', 200);
  }
});

export default webhook;
