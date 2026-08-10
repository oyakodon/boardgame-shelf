# AGENTS.md

- すべての応答は日本語で行うこと

## 概要

boardgame-shelfは、ボードゲーム会向けに、各自の持つゲームを登録して横断的に一覧できるようにするWebサイトである。

詳しいコンテキストは `.agents/` 配下に分割してある。作業前に該当ファイルを参照すること。

## .agents/ ファイル索引

| ファイル | 内容 |
|---|---|
| `.agents/architecture.md` | 製品概要、スコープ、ディレクトリ構成、技術スタックとビルド(フロントエンドの構成方針込み)、明示的な決定事項 |
| `.agents/data-model.md` | D1のテーブル定義とマイグレーション方針 |
| `.agents/auth.md` | Discord OAuth2の流れ、セッション、権限(member/admin) |
| `.agents/api-contract.md` | `/api/*` のエンドポイント一覧とリクエスト/レスポンス、エラー規約 |
| `.agents/testing.md` | vitest(+ vitest-pool-workers)による自動テスト方針と、wrangler devでの手動検証手順 |

