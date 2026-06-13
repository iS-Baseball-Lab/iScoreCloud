// next.config.ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // 💡 開発中は 'export' にしないことで、rewrites などの開発用のカスタムルートを有効化する
  output: isDev ? undefined : 'export',
  images: {
    unoptimized: true,
  },
  // TypeScript チェックはビルドプロセスと分離して実行
  // (next build 時の OOM 対策 — tsc は別途 `npx tsc --noEmit` で確認)
  typescript: {
    ignoreBuildErrors: false,
  },
  // 静的エクスポートでは Middleware や Server Components (SSR) が使えないため、
  // サーバー側の設定は最小限にします。
  
  // 💡 開発環境のみ、APIリクエストを Workers (wrangler dev - localhost:8787) へプロキシする
  ...(isDev ? {
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8787/api/:path*',
        },
      ];
    }
  } : {})
};

export default nextConfig;
