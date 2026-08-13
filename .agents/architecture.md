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
- 写真登録(上限は`src/shared/constants.ts`参照)
- タグによる分類(登録は任意。誰でも登録できる)

### スコープ外(恒久的に扱わない)

- ゲーム自体の汎用データベース化(BGGの代替を目指さない)
- 複数の会や複数のDiscordサーバーをまたぐマルチテナント化

## ディレクトリ構成

```
migrations/              D1マイグレーション(wrangler d1 migrations)
  0001_init.sql
  0002_add_registered_by.sql
  0003_add_bga_slug.sql
src/
  worker/                 Hono API (Cloudflare Workers)
    index.ts               Workerエントリ。Honoアプリの起動、静的アセットへのフォールバック
    app.ts                  ルーティング定義
    env.ts                  Bindings型
    context.ts              AppContext型(Bindings + Variables)
    authz.ts                canEditGame の再エクスポートと findGameOrNull
    test-helpers.ts         テスト用共通ヘルパー(createUser/authedFetch)
    test-setup.ts           vitest-pool-workers用のD1マイグレーション適用
    auth/
      discord.ts             OAuth2 (login/callback/PKCE)、Discord API呼び出し
      session.ts              セッションとOAuth stateのCookie操作
      middleware.ts            requireAuth(セッション/管理者トークン認証)、requireSameOrigin
      routes.ts                login/callback/logoutハンドラ
    routes/
      games.ts
      photos.ts
      img.ts
      tags.ts
      me.ts
    db/                     D1クエリのラッパー(テーブル単位に分割)
      users.ts / sessions.ts / games.ts / photos.ts / tags.ts
      index.ts               上記の再エクスポート(呼び出し側は "../db" のまま参照する)
  client/                  React + Vite SPA
    main.tsx / App.tsx
    auth-context.tsx        ログイン中ユーザーを共有するReact Context
    api.ts                  fetch ラッパー(型は shared から)
    game-filter.ts           一覧の絞り込みロジック
    game-format.ts           人数・プレイ時間の表示整形
    game-form.ts             登録・編集フォームの状態とバリデーション
    image-resize.ts          写真のクライアント側縮小
    bgg.ts / bga.ts          BGG/BGAのURL⇄ID・スラッグ変換
    routes/                  画面ごとのコンポーネント
    components/
    index.css                Tailwindのエントリ
  shared/
    types.ts                 server/client共通のAPI型
    constants.ts              server/client共通の定数(写真の上限など)
    authz.ts                  server/client共通の認可ロジック(canEditGame)
wrangler.jsonc.example    wrangler.jsonc(git管理外)のテンプレート
package.json
tsconfig.json / tsconfig.worker.json
biome.json
```

`src/shared/` 配下はworker側とclient側の両方から参照する。R2操作専用のラッパーファイルは無く、`routes/photos.ts`と`routes/img.ts`が`c.env.BUCKET`を直接呼ぶ。

## 技術スタックとビルド

| 層 | 採用 |
| --- | --- |
| 配信とAPI | Cloudflare Workers(単一Workerで静的アセット+API) |
| APIフレームワーク | Hono |
| データベース | D1 |
| 画像ストレージ | R2 |
| フロントエンド | React + Vite(SPA) + Tailwind CSS |
| ルーティング(SPA内) | React Router v7、Library Mode(SSRを使わないSPAなので、v7のFramework Modeは採用しない) |
| デプロイ | Wrangler(手動 or GitHub Actions。詳細は`.agents/operations.md`) |
| フォーマッタ/リンタ | Biome v2系(2スペース、行幅120、ダブルクォート) |
| テスト | vitest(4.1以上) + `@cloudflare/vitest-pool-workers`(Workers環境をMiniflareでエミュレートし、D1/R2バインディングに対して実行。詳細は`.agents/testing.md`) |
| パッケージマネージャ | npm |

- クライアントは `vite build` で静的アセットを出力し、`wrangler.jsonc` の `assets` にディレクトリを指定する
- Worker本体(`src/worker/index.ts`)はビルド不要。`wrangler dev`/`wrangler deploy` が内部でesbuildバンドルするため、別途のビルドステップは要らない
- 開発用スクリプトは2つある。`npm run dev`(`vite`のみ)はクライアントのHMRは効くがAPIへのプロキシが無いため`/api/*`等は解決しない。`npm run dev:worker`(`vite build && wrangler dev`)は`wrangler dev`の`assets`機能でビルド済みクライアントとAPIを1プロセスで配信するが、クライアントの変更は`vite build`をやり直すまで反映されない(HMR無し)
- 状態管理はログイン中ユーザー情報のみ軽量なReact Contextで共有し、それ以外は各画面のローカルstateとする。Redux等のグローバル状態管理ライブラリは規模的に不要と判断し導入しない
- フォームはreact-hook-form等を使わず、controlled componentsで素朴に書く。入力項目数が少ないため

## 明示的な決定事項

- ルーティング、状態管理、フォームは上記の「技術スタックとビルド」節のとおり、追加ライブラリを最小限にする
- パッケージマネージャはnpmで統一する
- 登録フォームの必須項目はタイトルと最小人数のみとし、他は任意とする。最大人数は未入力可で、その場合は「上限なし」を表す(実在するボードゲームでも上限のない/決まっていないものがあるため)
- 所有者(実際の持ち主)と登録者(入力した人)を分けて持つ。会場では持ってきた本人以外がまとめて入力することが実際に起きるため。登録フォームで所有者をメンバーから選べるようにし(既定は自分)、編集・削除は所有者・登録者・adminの三者に許す。所有者に指定できるのはログイン済みのメンバーだけとする(`users`への外部キーを保てるため。未ログインの人の持ち物は、その人が一度ログインすれば選べるようになる)
- 写真は1ゲームあたり5枚まで、1枚あたり2MBまでとする(`src/shared/constants.ts`が正。他ドキュメントはこの節を参照する)
- 表示名はDiscordの名前をそのまま使う。サイト内で個別に変更する機能は持たず、ログインのたびにDiscord側の最新の名前で上書きする
- タグ(`tags`と中間テーブル`game_tags`)は候補リストや承認フローを設けず、メンバーなら誰でも新規作成し任意のゲームに付与できる自由記述とする
- 公開ドメインは `oykdn.com` のサブドメイン `game.oykdn.com` を使う。`wrangler.jsonc`の`routes`に`custom_domain: true`で設定し、`wrangler deploy`時にCloudflare側のCustom Domainとして自動アタッチされる
