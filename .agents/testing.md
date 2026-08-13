# テスト方針

## 自動テスト

`@cloudflare/vitest-pool-workers`を使い、Miniflare上でD1/R2バインディングを実際に動かした状態でテストする(モックではなく、Workers環境そのものに近い形で検証する)。vitest 4.1以上が必要。

対象は主にサーバー側の純粋ロジックと、DB/R2を絡めた統合的な挙動。

- セッションのハッシュ化と検証ロジック、セッション期限切れ・自動延長
- 所有者/登録者/adminの認可判定
- 論理削除後にゲーム一覧へ出てこないこと
- 写真の枚数上限とサイズ上限のバリデーション
- タグの新規作成と付与、同名タグの再利用

Discord側とのやり取り(トークン交換、guilds/membersの呼び出し)は`fetch`をモックして、成功/404(未参加)/エラー時の分岐を検証する。

人数絞り込みの判定(条件式は`.agents/data-model.md`参照)はサーバー側ではなくクライアント側の純粋ロジック(`src/client/game-filter.ts`)であり、`src/client/*.test.ts`(`bgg`/`bga`/`game-filter`/`game-form`/`game-format`)として検証する。`vitest.config.ts`に`test.include`の指定が無いため、これらのクライアント側テストもサーバー側と同じ`cloudflareTest`プール(Miniflare上)で実行されている。純粋関数のみを対象にしている今は問題ないが、DOMやReactコンポーネントのテストを書く場合は`projects`でプールを分ける必要がある。Reactコンポーネント自体のテストは当面未整備の想定で、`@testing-library/react`の導入は画面数が増えて壊れやすくなったら検討する。

```bash
npm test
```

`npm test`は`node scripts/ensure-wrangler-config.mjs && vitest run`を実行する。`vitest.config.ts`が`wrangler.jsonc`の存在を前提とするため、`vitest`を直接叩く前に必ず`wrangler.jsonc`を生成する連結スクリプトにしてある(`wrangler.jsonc`が既に存在すれば`ensure-wrangler-config.mjs`は何もしない)。

## 手動検証(実装時に整備)

### 1. ビルドと起動

```bash
npm install
npm run dev:worker   # vite build && wrangler dev。ビルド済みクライアント+APIを1プロセスで配信
```

クライアント側のみHMRしながら見た目を素早く確認したい場合は`npm run dev`(`vite`のみ)を使うが、`/api/*`等へのプロキシは無いためログインを伴う画面は動かない(`.agents/architecture.md`参照)。

### 2. API直叩き

```bash
curl -s http://localhost:8787/api/health
curl -s http://localhost:8787/api/games | python3 -m json.tool
```

未ログイン状態での401、Origin不一致時の403あたりはcurlで機械的に確認できる。

### 3. Discord OAuth2の実機確認

対象Discordサーバーの参加、OAuth2アプリのClient ID/Secret、Redirect URIを設定した上で通しの確認を行う。あわせて`__Host-`Cookieのdev環境での挙動も検証する。

### 4. ブラウザでの見た目確認

Playwrightは依存には含めず、検証用のスクラッチディレクトリで都度使う想定とする。
モバイル幅(390x844)での一覧、詳細、フォームのレイアウト崩れ、写真アップロードのプレビュー表示を確認する。

## CI

GitHub Actionsは`ci.yml`と`deploy.yml`の2ワークフローに分かれる。

- `ci.yml`：push・PR時に`check` → `typecheck` → `test` → `build`を実行する
- `deploy.yml`：`ci.yml`がmainブランチで成功した後に`workflow_run`で起動し、D1マイグレーション適用と`wrangler deploy`を自動で行う。forkからのPRでの誤発火を防ぐため`head_repository.full_name`を確認する
