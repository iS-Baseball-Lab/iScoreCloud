// next.config.ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // 💡 開発中は 'export' にしないことで、rewrites などの開発用のカスタムルートを有効化する
  output: isDev ? undefined : 'export',
  images: {
    unoptimized: true,
  },
  // TypeScript 型チェックはビルドプロセスと分離して高速化
  // (next build 時の高速化 — 型チェックは別途 `npm run check` 等で確認)
  // ※ Next.js 16 では build 時に ESLint は自動スキップされます
  typescript: {
    ignoreBuildErrors: true,
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
