# 運用

## 環境変数とバインディング

`wrangler.jsonc`には次のバインディングと変数を持たせる。

```jsonc
{
  "d1_databases": [{ "binding": "DB", "database_name": "boardgame-shelf" }],
  "r2_buckets":   [{ "binding": "BUCKET", "bucket_name": "boardgame-shelf-photos" }],
  "vars": {
    "DISCORD_CLIENT_ID": "...",
    "DISCORD_GUILD_ID": "...",
    "ADMIN_DISCORD_IDS": "111...,222..."
  }
}
```

`DISCORD_CLIENT_SECRET`と`ADMIN_API_TOKEN`(`.agents/auth.md`参照)は`wrangler secret put`で登録し、`vars`には置かない。

`wrangler.jsonc`自体はD1/R2のIDやDiscordのID等の非秘密情報を含むがgit管理はしない。`wrangler.jsonc.example`がテンプレートで、ローカル開発では`scripts/ensure-wrangler-config.mjs`が(存在しなければ)複製して`wrangler.jsonc`を作る。CI/デプロイ時は同じテンプレートのプレースホルダーをGitHub Actionsのrepository variablesで置き換えて都度生成する。

## `run_worker_first`の必要性

`wrangler.jsonc`の`assets`設定:

```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*", "/auth/*", "/img/*"]
}
```

`not_found_handling: "single-page-application"`は、静的アセットに一致しない全パスを`index.html`にフォールバックさせるSPA向けの設定である。これを`run_worker_first`無しで使うと、`/api/*`や`/auth/*`のようなWorker側で処理すべきパスまで先に静的アセット探索が走り、該当ファイルが無いために`index.html`へフォールバックしてしまい、APIが常に200のHTMLを返す不具合になる(`c3bd976`で実際に踏んだ)。`run_worker_first`に該当プレフィックスを列挙することで、それらのパスは静的アセット探索より先にWorkerのコード(Honoルーティング)を通すようになる。

## デプロイ

GitHub Actionsは`ci.yml`と`deploy.yml`の2ワークフローに分かれる。

- `ci.yml`：push・PR時に`check` → `typecheck` → `test` → `build`を実行する
- `deploy.yml`：`ci.yml`がmainブランチへの**push**を起点として成功した後に`workflow_run`で起動する。forkからのPRでの誤発火を防ぐため、`workflow_run`イベントが`push`由来かつ`head_repository`が本リポジトリであることを確認する。`workflow_dispatch`での手動実行はブランチを問わず許可する(マージ前のブランチから試し打ちできるように)

`deploy.yml`の手順:

1. `npm run build`でクライアントをビルド
2. `wrangler.jsonc.example`のプレースホルダーをrepository variablesで置き換えて`wrangler.jsonc`を生成
3. `wrangler d1 migrations apply boardgame-shelf --remote`でD1マイグレーションを適用
4. `wrangler deploy`

マイグレーション適用を`wrangler deploy`より必ず先に実行する。新しい列を前提にしたコードが先にデプロイされると、マイグレーション未適用の本番D1に対してエラーになるため。

## バックアップと無料枠

- **バックアップ**：D1は`wrangler d1 export`で定期的にダンプする。R2はゲーム写真のみを保持し、失われても再登録できる範囲として扱う
- **無料枠**：Workersは1日10万リクエスト、D1はストレージ5GB、読み取り500万行/日、書き込み10万行/日、R2はストレージ10GB(取り出し課金なし)。この規模の利用はどれも十分小さい。写真をブラウザ側で縮小する前提が崩れるとR2の消費が急増するため、その点だけ注意する
- **退会者**：Discordサーバーを抜けたメンバーの登録は自動では削除しない。ゲームの情報自体は会にとって有用なので残し、必要に応じて管理者が`status`を`retired`にする
