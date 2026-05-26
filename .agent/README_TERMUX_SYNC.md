# 📱 Termux (agy) ＆ PC (Antigravity) 開発コンテキスト同期ガイド

このガイドは、Android ＋ Termux 上で動作する `antigravity` (agy) 環境と、PC デスクトップ環境の Antigravity との間で、会話コンテキスト、開発タスク進捗（`task.md`）および設計計画（`implementation_plan.md`）を Git 経由でシームレスに同期・共有するための解説書です。

---

## 🔄 同期の仕組み

PC側の Antigravity（私）が更新した最新の設計図とタスク進捗は、リポジトリ内の **`i-score/.agent/`** フォルダに実体ファイルとして格納されています：
* `.agent/task.md` ➜ 最新のタスク進捗チェックリスト
* `.agent/implementation_plan.md` ➜ 設計・実装計画書
* `.agent/walkthrough.md` ➜ 改修完了報告書

このリポジトリを GitHub 経由でプッシュ＆プルするだけで、PCとスマホの双方で「今どこまで実装が進んでいるか」が完璧に共有されます。

---

## 🛠️ Termux 側での環境同期手順

Termux 上でエージェントを立ち上げて開発を引き継ぐ際、以下の手順を実行することで PC 側のブレイン記憶と完全にリンクさせることができます。

### ステップ 1: リポジトリの最新化
開発を引き継ぐ前に、Termux のターミナルで最新のソースコードおよび進捗ファイルを GitHub からプルします。
```bash
cd ~/i-score  # プロジェクトのディレクトリに移動
git pull origin main
```

### ステップ 2: ブレインフォルダへのシンボリックリンクの作成 (推奨)
Termux 上で動作する Antigravity (agy) は、通常 `~/.gemini/antigravity/brain/[会話ID]/` に進捗を読み書きしようとします。
以下のワンライナーコマンドを実行して、Termux のブレイン領域からプロジェクト内の最新ファイルへシンボリックリンク（ショートカット）を貼ることで、完全な自動同期が実現します。

```bash
# 現在の会話ID (PC側): 054c4a74-19bd-411e-b0e9-10dbdf1a3f4b

# ブレインフォルダのディレクトリを作成 (存在しない場合)
mkdir -p ~/.gemini/antigravity/brain/054c4a74-19bd-411e-b0e9-10dbdf1a3f4b/

# 既存のファイルを削除し、プロジェクトの.agent/内のファイルへのシンボリックリンクを貼る
rm -f ~/.gemini/antigravity/brain/054c4a74-19bd-411e-b0e9-10dbdf1a3f4b/task.md
ln -s ~/i-score/.agent/task.md ~/.gemini/antigravity/brain/054c4a74-19bd-411e-b0e9-10dbdf1a3f4b/task.md

rm -f ~/.gemini/antigravity/brain/054c4a74-19bd-411e-b0e9-10dbdf1a3f4b/implementation_plan.md
ln -s ~/i-score/.agent/implementation_plan.md ~/.gemini/antigravity/brain/054c4a74-19bd-411e-b0e9-10dbdf1a3f4b/implementation_plan.md

rm -f ~/.gemini/antigravity/brain/054c4a74-19bd-411e-b0e9-10dbdf1a3f4b/walkthrough.md
ln -s ~/i-score/.agent/walkthrough.md ~/.gemini/antigravity/brain/054c4a74-19bd-411e-b0e9-10dbdf1a3f4b/walkthrough.md
```

これで、スマホ側のエージェントが読み書きするタスクファイルが、Git管理されている `i-score/.agent/` 配下のファイルと直結します！

---

## 🏃‍♂️ 開発の引き継ぎワークフロー

1. **PCでの作業終了時**:
   * PC側の Antigravity（私）が `task.md` を最新状態に書き換えます。
   * PC側のターミナルでコミット・プッシュします：
     ```bash
     git add .agent/
     git commit -m "docs: sync brain artifacts"
     git push
     ```
2. **スマホ（Termux）での作業開始時**:
   * スマホ側で `git pull` します。
   * Termux 上でエージェントを起動し、**「PC側の続きから開発を進めて」** と伝えるだけで、最新のタスクを読み込んで即座に正確なコード執筆を再開できます！
3. **スマホからPCへ戻す時**:
   * スマホ側のエージェントがタスクを更新したら、スマホの Termux から GitHub にプッシュします。
   * PC側で `git pull` して開発を再開します。

この Git を介した脳（ブレイン）同期システムにより、いつでもどこでも PC とスマホの間で完全にシームレスなペアプログラミング環境が実現します！
