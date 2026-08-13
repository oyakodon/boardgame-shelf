# アーキテクチャ

## 概要

boardgame-shelfは、ボードゲーム会で「今日は5人だけど何ができる？」「あれ持ってるの誰だっけ？」に即答できる状態を作るためのWebサイトである。

- メンバーが自分の所有するゲームを登録し、全員の蔵書を横断してプレイ人数から絞り込める
- 利用者は特定のDiscordサーバーの参加者に限る。認証はDiscord OAuth2
- 規模は数十人、ゲーム数は最大1000件、写真は数千枚。運用費はほぼゼロ(Cloudflare無料枠)を前提とする
- ゲームの基本情報はメンバーの手入力。BGGとBGA(ボードゲームアリーナ)のリンクは任意の補助情報として持つが、自動取得はしない。どちらもURLをそのまま保存せず、IDまたはスラッグだけを保存してURLは表示時に組み立てる(フォームにゲームページのURLを貼り付けてもIDだけ抽出する)

会場でスマートフォンから開く使い方を主とする。単一のCloudflare Workerが静的アセット(React SPA)とAPIの両方を配信する。

## スコープ

- Discordログイン/ログアウト。対象サーバーのメンバーのみ利用可
- ゲームの登録、編集、削除(所有者・登録者は自分に関わるゲームのみ、管理者は全件)
- ゲーム一覧(キーワード、プレイ人数、所有者、タグで絞り込み)
- ゲーム詳細(写真、人数、プレイ時間、コメント)
- 写真登録(1ゲームあたり5枚まで)
- Discordへの通知(Webhook)
- タグによる分類(登録は任意。誰でも登録できる)

### スコープ外(恒久的に扱わない)

- ゲーム自体の汎用データベース化(BGGの代替を目指さない)
- 複数の会や複数のDiscordサーバーをまたぐマルチテナント化

## ディレクトリ構成(予定)

まだコードは存在しない。実装開始時に以下の構成で作る。

```
migrations/            D1マイグレーション(wrangler d1 migrations)
  0001_init.sql
src/
  worker/               Hono API (Cloudflare Workers)
    index.ts             Workerエントリ。Honoアプリの起動、静的アセットへのフォールバック
    app.ts                ルーティング定義
    auth/
      discord.ts          OAuth2 (login/callback/PKCE)
      session.ts           セッション発行、検証、Cookie操作
    routes/
      games.ts
      photos.ts
      img.ts
      tags.ts
      me.ts
    db.ts                 D1クエリのラッパー
    r2.ts                  R2 put/get のラッパー
  client/                 React + Vite SPA
    main.tsx
    routes/                画面ごとのコンポーネント
    components/
    api.ts                 fetch ラッパー(型は shared から)
    index.css              Tailwindのエントリ
  shared/
    types.ts               server/client共通のAPI型
wrangler.jsonc
package.json
tsconfig.json
biome.json
```

`src/shared/types.ts` に API のリクエスト/レスポンス型を集約し、worker側とclient側の両方から参照する。

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

## 技術スタックとビルド

| 層 | 採用 |
| --- | --- |
| 配信とAPI | Cloudflare Workers(単一Workerで静的アセット+API) |
| APIフレームワーク | Hono |
| データベース | D1 |
| 画像ストレージ | R2 |
| フロントエンド | React + Vite(SPA) + Tailwind CSS |
| ルーティング(SPA内) | React Router v7、Library Mode(SSRを使わないSPAなので、v7のFramework Modeは採用しない) |
| デプロイ | Wrangler(手動 or GitHub Actions) |
| フォーマッタ/リンタ | Biome v2系(2スペース、行幅120、ダブルクォート) |
| テスト | vitest(4.1以上) + `@cloudflare/vitest-pool-workers`(Workers環境をMiniflareでエミュレートし、D1/R2バインディングに対して実行) |
| パッケージマネージャ | npm |

- クライアントは `vite build` で静的アセットを出力し、`wrangler.jsonc` の `assets` にディレクトリを指定する
- Worker本体(`src/worker/index.ts`)はビルド不要。`wrangler dev`/`wrangler deploy` が内部でesbuildバンドルするため、別途のビルドステップは要らない
- 開発時は `wrangler dev` 1プロセスで完結させる方針とする(Vite devサーバーとの二重起動は行わず、`wrangler dev` の `assets` 機能でクライアントも配信する想定)。ホットリロードの体験が悪ければ、Vite devサーバー+プロキシ構成に見直す
- `wrangler.jsonc` に `routes` を設定すると、`dev.host` を明示しない限り `wrangler dev` はその `routes` の最初のホスト名をローカル開発時のHostとしてシミュレートする(Discord OAuth2の`redirect_uri`がローカルでも本番ドメインになってしまう不具合の原因になった)。そのため `dev.host` に `"localhost:8787"` を明示している。ポートを省略すると補完されず`redirect_uri`からポート番号が抜け落ちるため、ポートまで含めて書く
- 状態管理はログイン中ユーザー情報のみ軽量なReact Contextで共有し、それ以外は各画面のローカルstateとする。Redux等のグローバル状態管理ライブラリは規模的に不要と判断し導入しない
- フォームはreact-hook-form等を使わず、controlled componentsで素朴に書く。入力項目数が少ないため

## フロントエンド

React + Vite + TypeScriptのSPA。画面数とフォームの多さから、素のDOM操作ではなくフレームワークを使う判断とした。

### 画面一覧

| パス | 内容 |
| --- | --- |
| `/login` | Discordログインボタンだけを置く |
| `/` | 蔵書一覧。カードのグリッド。上部に絞り込み |
| `/games/:id` | 詳細。写真、人数、時間、コメント、所有者、タグ |
| `/games/new`, `/games/:id/edit` | 登録と編集のフォーム |

ルーティングはReact Routerを使う。「そのメンバーの棚」は専用画面(`/users/:id`)を持たず、一覧の所有者絞り込みで代替する。表示名もDiscordの名前をそのまま使い、サイト内での変更機能は持たないため`/me`も置かない。

### 一覧の絞り込み

四つの軸を上部に置く。

- **人数**：1から8以上までのボタン。押すとその人数で遊べるゲームだけが残る(`min_players <= N AND (max_players IS NULL OR max_players >= N)`。`max_players`未入力は上限なし扱い)
- **キーワード**：タイトル、コメントに対する部分一致
- **所有者**：メンバーの選択
- **タグ**：複数選択可。選択したタグをすべて持つゲームに絞る(AND)

会場でスマートフォンから開く使い方が主なので、一覧は1画面に多くのタイトルが入る密度にし、絞り込みは指で押せる大きさのボタンで置く。全件をクライアントに取得済みなので、絞り込みはAPI再取得なしでその場で計算する(`.agents/api-contract.md`参照)。

絞り込み状態はURLのクエリパラメータ(`useSearchParams`)に反映する。絞り込んだ状態のURLをそのまま共有・ブックマークできるようにするためである。

### スタイリング(Tailwind CSS)

- `@tailwindcss/vite`プラグインを使い、`src/client/index.css`で`@import "tailwindcss";`する(v4系の構成)
- コンポーネント単位のCSSファイルは作らず、utility classで完結させる。繰り返しが目立つ場合は`@apply`ではなくコンポーネント分割で対応する
- モバイルファースト。ブレークポイントは基本Tailwindのデフォルト(`sm`/`md`/`lg`)をそのまま使う
- カラーパレット、フォント等のデザイントークンのカスタマイズは今回は行わず、Tailwindのデフォルトテーマで進める

### 写真アップロード

1. `<input type="file" accept="image/*">`で選択。`capture`属性は付けない。付けるとスマートフォンでカメラが直接起動し、カメラロールから選ぶ選択肢が出ない機種があるため、OS標準のピッカー(カメラ撮影とカメラロールの両方を選べる)に委ねる
2. `HTMLCanvasElement`で長辺1600pxまで縮小し、JPEGへ再符号化してから送信する(`.agents/api-contract.md`の「写真アップロードの流れ」参照)
3. アップロード中はプレビューとプログレス表示を出す。1ゲーム5枚の上限、1枚2MBの上限(縮小後)をクライアント側でも事前チェックする

再符号化にJPEGを使うのはWebPではなくSafari(iOS Safari含む)対策である。`canvas.toBlob()`/`toDataURL()`でのWebPエンコードはSafariが対応しておらず、会場でスマートフォンから開く使い方が主のこのサイトでは無視できない。JPEGなら主要ブラウザすべてでエンコードできる。

写真の追加・削除は登録・編集フォーム(`/games/new`、`/games/:id/edit`)でのみ行い、詳細ページ(`/games/:id`)は写真を含めて閲覧専用とする(拡大表示のみ)。

**写真もフォームの他の項目と同じく「保存」を押した時点で反映する。** 選んだ写真はその場ではアップロードせず、縮小済みのBlobとしてフォームのstateに保持し、既存写真の×は「削除予定」として記録するだけにとどめる。保存時に ゲームの作成/更新 → 写真の削除 → 写真のアップロード をまとめて実行する。
1つのフォームの中に「押した瞬間に保存される項目」と「保存ボタンで保存される項目」が混在すると、タイトルだけ直して保存せず離脱したときに写真の変更だけが残る、といった分かりにくい状態になるため。この方式なら新規登録と編集でUIも保存タイミングも完全に同じになる。

代償として「ゲームは保存できたが写真のアップロードに失敗した」という中途半端な状態が起こりうる。これには次で対処する。
- 削除・アップロードは1件ずつ順に行い、成功した分はその都度stateから取り除く。保存をやり直しても成功済みの分を繰り返さない
- 新規登録でゲームだけ作成できた場合は、作成した`id`を覚えておき、保存をやり直したときにゲームを二重に作らず更新に切り替える

## Discordへの通知

サーバーのチャンネルにIncoming Webhookを作り、そのURLを`wrangler secret put`でシークレットとして登録する。
ゲームが登録されたら、タイトル、所有者、人数、写真、詳細ページへのリンクをEmbedにしてそのWebhook URLへ送る。

通知の送信はWorkerからのfetch呼び出しが1回増えるだけで済み、Botの常駐やトークン管理を要らない。
投稿の失敗がゲーム登録の失敗にならないよう、`ctx.waitUntil`で本流の処理から切り離す。

## タグ

`tags`と`game_tags`(中間テーブル)でゲームに複数のタグを付けられるようにする。
候補リストや承認フローは設けず、メンバーなら誰でもタグを新規作成し、任意のゲームに付与できる自由記述とする。

## 運用

- **バックアップ**：D1は`wrangler d1 export`で定期的にダンプする。R2はゲーム写真のみを保持し、失われても再登録できる範囲として扱う
- **無料枠**：Workersは1日10万リクエスト、D1はストレージ5GB、読み取り500万行/日、書き込み10万行/日、R2はストレージ10GB(取り出し課金なし)。この規模の利用はどれも十分小さい。写真をブラウザ側で縮小する前提が崩れるとR2の消費が急増するため、その点だけ注意する
- **退会者**：Discordサーバーを抜けたメンバーの登録は自動では削除しない。ゲームの情報自体は会にとって有用なので残し、必要に応じて管理者が`status`を`retired`にする

## 明示的な決定事項

- ルーティング、状態管理、フォームは上記の「技術スタックとビルド」節のとおり、追加ライブラリを最小限にする
- パッケージマネージャはnpmで統一する
- デプロイはGitHub Actions(`.github/workflows/deploy.yml`)で自動化する。`CI`ワークフローがmainで成功した後に`workflow_run`でつながり、D1マイグレーション適用と`wrangler deploy`を行う。`wrangler.jsonc`はD1/R2のIDやDiscordのID等の非秘密情報を含むがgit管理はせず、CI実行時に`wrangler.jsonc.example`のプレースホルダーをGitHub Actionsのrepository variablesで置き換えて都度生成する(ローカル開発は`scripts/ensure-wrangler-config.mjs`で各自生成する運用のまま)。真に秘密な`DISCORD_CLIENT_SECRET`・`ADMIN_API_TOKEN`は引き続き`wrangler secret put`で個別に投入する
- 登録フォームの必須項目はタイトルと最小人数のみとし、他は任意とする。最大人数は未入力可で、その場合は「上限なし」を表す(実在するボードゲームでも上限のない/決まっていないものがあるため)
- 所有者(実際の持ち主)と登録者(入力した人)を分けて持つ。会場では持ってきた本人以外がまとめて入力することが実際に起きるため。登録フォームで所有者をメンバーから選べるようにし(既定は自分)、編集・削除は所有者・登録者・adminの三者に許す。所有者に指定できるのはログイン済みのメンバーだけとする(`users`への外部キーを保てるため。未ログインの人の持ち物は、その人が一度ログインすれば選べるようになる)
- 写真は1ゲームあたり5枚まで、1枚あたり2MBまでとする
- 表示名はDiscordの名前をそのまま使う。サイト内で個別に変更する機能は持たず、ログインのたびにDiscord側の最新の名前で上書きする
- 公開ドメインは `oykdn.com` のサブドメイン `game.oykdn.com` を使う。`wrangler.jsonc`の`routes`に`custom_domain: true`で設定し、`wrangler deploy`時にCloudflare側のCustom Domainとして自動アタッチされる

## 実装の順序

以下の順で進める。3までで「一覧できる」という目的の骨格が立つため、一度触ってみてから4以降に進める。

1. **土台**：Wrangler、D1マイグレーション、Hono、Viteのビルドを通し、Workerが静的アセットと`/api/health`を返すところまで
2. **認証**：Discord OAuth2、サーバー参加確認、セッション、`GET /api/me`。ログイン画面とログアウト
3. **ゲームのCRUD**：登録フォーム、一覧、詳細、編集、削除(写真はまだ扱わない)
4. **写真**：ブラウザ側の縮小、アップロード、R2配信、サムネイル表示
5. **絞り込みとタグ**：人数、キーワード、所有者、タグでの絞り込み。タグの登録と表示
6. **仕上げ**：スマートフォン表示の調整、空状態の文言、エラー表示、初期データの投入
7. **通知**：ゲーム登録時のDiscord Webhook通知
