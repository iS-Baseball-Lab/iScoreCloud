// filepath: next.config.ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // 💡 開発中は 'export' にしないことで、rewrites などの開発用のカスタムルートを有効化する
  output: isDev ? undefined : "export",
  // 🚀 Next.js 16 React Compiler（コンポーネント・Hooksの自動メモ化による不要な再レンダリング根絶）
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
  // 🚀 大型アイコン・日付・UIパッケージのバンドル最適化（Tree-Shaking強化）
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@hugeicons/core-free-icons",
      "@hugeicons/react",
      "date-fns",
      "radix-ui",
      "react-icons",
    ],
  },
  // TypeScript 型チェックはビルドプロセスと分離して高速化
  // (next build 時の高速化 — 型チェックは別途 `npm run check` 等で確認)
  // ※ Next.js 16 では build 時に ESLint は自動スキップされます
  typescript: {
    ignoreBuildErrors: true,
  },

  // 💡 開発環境のみ、APIリクエストを Workers (wrangler dev - localhost:8787) へプロキシする
  ...(isDev
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:8787/api/:path*",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
