# テスト方針

## 自動テスト

`@cloudflare/vitest-pool-workers`を使い、Miniflare上でD1/R2バインディングを実際に動かした状態でテストする(モックではなく、Workers環境そのものに近い形で検証する)。vitest 4.1以上が必要。

対象は主にサーバー側の純粋ロジックと、DB/R2を絡めた統合的な挙動。

- 人数絞り込みの判定(`min_players <= N AND (max_players IS NULL OR max_players >= N)`。`max_players`未入力=上限なし)
- セッションのハッシュ化と検証ロジック
- 所有者/adminの認可判定(自分の登録のみ編集可、adminは全件可)
- 論理削除後にゲーム一覧へ出てこないこと
- 写真の枚数上限(5枚)とサイズ上限(2MB)のバリデーション
- タグの新規作成と付与、同名タグの再利用

Discord側とのやり取り(トークン交換、guilds/membersの呼び出し)は`fetch`をモックして、成功/404(未参加)/エラー時の分岐を検証する。

フロント(React)の自動テストは当面未整備の想定。画面数が増えて壊れやすくなったら`@testing-library/react`の導入を検討する。

```bash
npm test
```

## 手動検証(実装時に整備)

### 1. ビルドと起動

```bash
npm install
npm run build     # vite build (クライアント)
npx wrangler dev   # ローカルでWorker起動。--local でD1/R2もローカルエミュレーション
```

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
