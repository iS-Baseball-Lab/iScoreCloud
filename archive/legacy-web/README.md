# Legacy Web App Archive (`archive/legacy-web`)

このディレクトリには、Web版（非LIFF画面）廃止に伴い退避された旧Web版のページルートおよび専用UIコンポーネントが元のディレクトリ構造（`src/...`）のまま保管されています。

- **ビルド対象外**: Next.js App Router (`src/app`) の外に配置されているため、`next build` / 静的エクスポート（`out/`）には含まれません。
- **型チェック・Lint対象外**: `tsconfig.json` の `exclude` および `eslint.config.mjs` の `ignores` により、`npm run check` (`tsc`) や ESLint の検査対象外となっています。
- **現行本番画面**:
  - メインページ（LP）: `src/app/page.tsx` (`/`)
  - LINEミニアプリ（LIFF）: `src/app/liff/**` (`/liff/*`)
