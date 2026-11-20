# iScoreCloud（アイ・スコアクラウド）⚾

学童野球・中学野球・高校野球・草野球チームの現場運営と公式スコア記録をスマホ1台（**iScoreCloud LINEミニアプリ**）で完結させるクラウド統合プラットフォームです。

---

## 主な機能

- **早稲田式・4分割デジタルスコアブック ＆ 紙スコアAI読取**
  - グラウンドでの1球・打席入力、紙スコアブック写真のAI解析取込（`gemini-4-hydrogen` マルチプール構成）、伝統的な清書スコアブック出力（PDF / PNG / A4早見表）に対応。
  - **公認野球規則 第9章（`9.01`〜`9.22`）完全準拠エンジン**（[`baseball-official-rules.ts`](src/lib/liff/baseball-official-rules.ts)）により、自責点再構成・チーム自責点分離・勝敗/S/H・規定打席特例（`9.22(a)`）を一元算出。
- **肩肘保護・リアルタイム球数制限アラート**
  - 学童70球基準・中学100球基準・大会別規定に応じた3段階アラート（注意・交代準備・上限到達）および試合前の連投・7日間累計球数チェック。
- **LINE試合速報コックピット（単一担当者排他入力 ＋ リアルタイム閲覧モード）**
  - 片手フリック対応キーパッド、丸数字全角グリッドスコアボード自動生成、途中交代時の安全な担当引継。
- **スケジュール・4グループ出欠・遠征配車・備品管理**
  - `選手 / 母 / 父 / スタッフ` 別の出欠集計（休部期間の親子自動連動）、簡易配車エディタ、Google Maps 連動の**遠征・隊列ライブマップ**、車両別・担当者別の道具/備品持参チェック。
- **LINEグループ連携 ＆ 週末自動リマインド（初期値OFF）**
  - `/liff/settings/team` からチームごとにON/OFF切替可能（デフォルトは完全OFF）。ON時は Cloudflare Workers Cron Triggers により指定曜日・時刻（JST）に週末予定・未回答者・配車/当番サマリーを自動Push配信。
- **チーム名鑑・個人成長レポート・軽量フォトギャラリー**
  - 2階層権限保護の名鑑プロフィール、休養・復帰タイムライン付き成長グラフ、端末内自動軽量化＋無圧縮STORE方式ZIP一括保存対応アルバム。

---

## 技術スタック

| レイヤー | 採用技術 |
| :--- | :--- |
| フロントエンド | Next.js 16 (App Router, Static Export + React Compiler), React 19, Tailwind CSS v4, TypeScript |
| LINE連携 | LINE Front-end Framework (`@line/liff`), LINE Messaging API |
| エッジAPI / Cron | Cloudflare Workers, Hono (`src/worker.ts`, `src/api/**`) |
| データベース / ストレージ | Cloudflare D1 (SQLite) + Drizzle ORM, Cloudflare R2 (`BUCKET`) |
| テスト / CI | Vitest (`src/__tests__/**`), GitHub Actions (`.github/workflows/ci.yml`), Cloudflare Workers Builds |

---

## 開発コマンド

```bash
# 依存パッケージのインストール（Corepack 有効化環境）
pnpm install

# フロントエンド開発サーバー起動 (http://localhost:3000)
pnpm run dev

# ユニットテストの実行 (Vitest)
pnpm test

# 品質ゲート一括検証（Vitest + Next.js 本番ビルド + TypeScript 型チェック）
pnpm run check

# Cloudflare Workers ローカルプレビュー
pnpm run preview
```

---

## データベースマイグレーション（Cloudflare D1）

スキーマ定義は `src/db/schema/`、SQLマイグレーションは `drizzle/` 配下で管理しています。

```bash
# ローカル D1 へのマイグレーション適用
pnpm run db:mig:local

# 本番リモート D1 へのマイグレーション適用
pnpm run db:mig:remote
```

---

## デプロイフロー

`main` ブランチへの Push により以下が自動実行されます：
1. **GitHub Actions CI**（`.github/workflows/ci.yml`）：`pnpm install --frozen-lockfile` ➔ `pnpm run check`（自動テスト・厳格型検査・静的エクスポート検証）
2. **Cloudflare Workers Builds**：`pnpm run build` ➔ `pnpm exec wrangler deploy` によるエッジ本番デプロイ

UI/UX 規約・マルチチーム分離認可規約・野球規則エンジンの詳細は [`.agent/skills/i-score-dev/SKILL.md`](.agent/skills/i-score-dev/SKILL.md) を参照してください。
