# API仕様

型定義の正は`src/shared/types.ts`とする。
ここでは概要のみ記す。

API(`/api`配下)はJSONでやり取りする。
認証系(`/auth`配下)は主にリダイレクトで、エラー時のみJSONを返す場合がある。
画像配信(`/img/*`)は画像バイナリを直接返す。

## エンドポイント一覧

| メソッドとパス | 用途 | 認証 | 成功時レスポンス |
| --- | --- | --- | --- |
| `GET /auth/login` | Discord認可画面へリダイレクト | 不要 | `302` リダイレクト |
| `GET /auth/callback` | OAuth2コールバック。セッション発行後トップへリダイレクト | 不要 | `302` `/`へリダイレクト |
| `POST /auth/logout` | セッション破棄 | 要 | `204` ボディ無し |
| `GET /api/health` | 死活監視用 | 不要 | `200 text/plain "ok"`固定 |
| `GET /api/me` | ログイン中のユーザー情報。未ログインなら401 | 要 | `200` + `User` |
| `GET /api/users` | メンバー一覧(`id`と`displayName`のみ)。所有者の選択と絞り込みに使う | 要 | `200` + `Member[]` |
| `GET /api/games` | ゲーム一覧 | 要 | `200` + `Game[]` |
| `POST /api/games` | ゲーム登録。`ownerId`未指定なら登録者自身が所有者になる | 要 | `201` + `Game` |
| `GET /api/games/:id` | ゲーム詳細。写真とタグの一覧を含む | 要 | `200` + `GameDetail` |
| `PATCH /api/games/:id` | ゲーム更新。所有者、登録者、adminのみ。`ownerId`で所有者を付け替えられる | 要 | `200` + `Game` |
| `DELETE /api/games/:id` | ゲーム削除(論理削除)。所有者、登録者、adminのみ | 要 | `204` ボディ無し |
| `POST /api/games/:id/photos` | 写真の追加 | 要 | `201` + `GamePhoto` |
| `DELETE /api/photos/:id` | 写真の削除 | 要 | `204` ボディ無し |
| `GET /api/tags` | タグ一覧 | 要 | `200` + `Tag[]` |
| `POST /api/games/:id/tags` | ゲームへのタグ付与。未登録のタグ名なら新規作成する | 要 | `200` + そのゲームの`Tag[]` |
| `DELETE /api/games/:id/tags/:tagId` | ゲームからタグを外す | 要 | `204` ボディ無し |

`GET /auth/callback`は失敗時、state不一致なら`400 {"error": "invalid oauth state"}`、対象サーバー未参加なら`403 {"error": "not a guild member"}`を返す。
それ以外のDiscord API障害(トークン交換やユーザー取得の失敗)なら、`302`で`/?error=login_failed`へリダイレクトする。
ブラウザのフルページ遷移で、この応答がそのままユーザーに見える。

`GET /api/games`は`Game[]`を、`GET /api/games/:id`は`GameDetail`(`Game`に`photos`と`tags`を加えた型)を返す。
一覧が返す`Game`にも、フィルタ計算に使う`tagNames`とサムネイル1枚分のURLは含む。
最大でも1000件程度なので、ページングを入れず全件を返し、キーワード・人数・所有者・タグの絞り込みはすべてクライアント側で行う。
往復が減って体感が速くなり、実装も減る。
件数が増えて重くなったら、`(created_at, id)`を鍵とするカーソルページングに切り替える。

表示名はDiscordの名前をそのまま使うため、表示名変更用のエンドポイントは持たない。
「そのメンバーの棚」も専用エンドポイントを設けず、`GET /api/games`の結果をクライアント側で所有者絞り込みして表す。

`GET /api/users`は、登録フォームで所有者を選ぶために必要なので置く(まだ1件も登録していないメンバーは`GET /api/games`の結果に現れないため、そこからは導けない)。
返すのは`id`と`displayName`だけで、`role`等の内部情報は含めない。
`users`テーブルを絞り込まずそのまま返すため、Discordサーバーを既に脱退したメンバーの行も含む(退会者の登録は残す方針のため。`.agents/architecture.md`参照)。

`POST /api/games`と`PATCH /api/games/:id`は`ownerId`を受け取れる。
他人の持ち物を代理で登録や修正するためのもので、指定できるのは`users`に存在するIDのみである(存在しなければ400)。
登録者(`registeredById`)は常にリクエストしたユーザー自身が入り、所有者を付け替えても変わらない。

タグの付与と削除は、ゲーム本体の更新(`PATCH /api/games/:id`)と異なり所有者、登録者、adminに限らない。
ログイン済みのメンバーなら誰でも、任意のゲームにタグを付けたり外したりできる。

`bggId`と`bgaSlug`は、クライアント側で数値IDまたはスラッグへ変換してから送信する(`src/client/bgg.ts`/`bga.ts`)。
BGGは数値文字列、またはURL(`boardgamegeek.com`配下の`/boardgame(|expansion|accessory)/{数値}/...`)から数値部分を抽出する。
BGAは`^[a-z0-9_-]{1,64}$`に一致するスラッグ、またはURL(`boardgamearena.com`配下)の`game`クエリパラメータから抽出する。
サーバー側ではURLの再パースはせず、抽出後の値をそのまま検証する(`bgaSlug`は同じ正規表現で再検証し、`bggId`は正の整数かどうかのみ確認する)。

## 写真アップロードの流れ

1. ブラウザ側でCanvasを使い、長辺1600pxまで縮小してJPEGへ再符号化する
2. `POST /api/games/:id/photos`へ送る。枚数とサイズの上限は`src/shared/constants.ts`が正(現在値は`.agents/architecture.md`の決定事項を参照)
3. Workerが先頭バイトを見て画像形式を確認し、R2へ`put`する
4. `game_photos`に行を追加する

配信は`GET /img/{r2_key}`をWorkerが受け、R2から読んで返す。
キーにはUUIDが入っていて内容が変わらないため、`Cache-Control: public, max-age=31536000, immutable`を付ける。
R2バケットは直接公開せず、Worker経由に限定する。

`/img/*`は他の全ルートと異なり、`requireAuth`を通さない意図的な認証不要のcapability URLである。
R2キー(`games/{game_id}/{uuid}.jpg`)は推測困難なため、実害は「URLを知っていれば誰でも見られる」範囲に留まる。

## エラー規約

- 認証必須のエンドポイントでセッションが無効：`401 {"error": "..."}`
- 所有者/登録者/admin以外による更新や削除：`403 {"error": "..."}`
- 存在しないリソース：`404 {"error": "..."}`
- 入力値の検証エラー(必須項目欠落、文字数超過、写真の枚数/サイズ超過など)：`400 {"error": "..."}`
- その他(D1/R2起因の想定外エラー)：`500 {"error": "..."}`(個別のtry/catchで握りつぶさずそのまま返す方針)

エラーレスポンスの形は`{ error: string }`に統一する。
