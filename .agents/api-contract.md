# API仕様

型定義の正は `src/shared/types.ts` とする。ここでは概要のみ記す。
API(`/api`配下)と認証系(`/auth`配下)はJSONで受け答えする。画像配信(`/img/*`)のみ第三のプレフィックスで、画像バイナリを直接返す。

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
| `PATCH /api/games/:id` | ゲーム更新。所有者・登録者・adminのみ。`ownerId`で所有者を付け替えられる | 要 | `200` + `Game` |
| `DELETE /api/games/:id` | ゲーム削除(論理削除)。所有者・登録者・adminのみ | 要 | `204` ボディ無し |
| `POST /api/games/:id/photos` | 写真の追加 | 要 | `201` + `GamePhoto` |
| `DELETE /api/photos/:id` | 写真の削除 | 要 | `204` ボディ無し |
| `GET /api/tags` | タグ一覧 | 要 | `200` + `Tag[]` |
| `POST /api/games/:id/tags` | ゲームへのタグ付与。未登録のタグ名なら新規作成する | 要 | `200` + そのゲームの`Tag[]` |
| `DELETE /api/games/:id/tags/:tagId` | ゲームからタグを外す | 要 | `204` ボディ無し |

`GET /auth/callback`は失敗時、state不一致なら`400 {"error": "invalid oauth state"}`、対象サーバー未参加なら`403 {"error": "not a guild member"}`、それ以外のDiscord API障害(トークン交換・ユーザー取得の失敗)なら`302`で`/?error=login_failed`へリダイレクトする。ブラウザのフルページ遷移でこの応答がそのままユーザーに見える。

`GET /api/games`と`GET /api/games/:id`は同じ`Game`型を返す(差は詳細だけが持つ`photos`と`tags`)。一覧の`Game`にもフィルタ計算に使う`tagNames`とサムネイル1枚分のURLを含める。最大でも1000件程度なので、ページングを入れず全件を返し、キーワード・人数・所有者・タグの絞り込みはすべてクライアント側で行う。往復が減って体感が速くなり、実装も減る。件数が増えて重くなったら`(created_at, id)`を鍵とするカーソルページングに切り替える。

表示名はDiscordの名前をそのまま使うため、表示名変更用のエンドポイントは持たない。「そのメンバーの棚」も専用エンドポイントを設けず、`GET /api/games`の結果をクライアント側で所有者絞り込みして表す。

`GET /api/users`は、登録フォームで所有者を選ぶために必要なので置く(まだ1件も登録していないメンバーは`GET /api/games`の結果に現れないため、そこからは導けない)。返すのは`id`と`displayName`だけで、`role`等の内部情報は含めない。

`POST /api/games`と`PATCH /api/games/:id`は`ownerId`を受け取れる。他人の持ち物を代理で登録・修正するためで、指定できるのは`users`に存在するIDのみ(存在しなければ400)。登録者(`registeredById`)は常にリクエストしたユーザー自身が入り、所有者を付け替えても変わらない。

タグの付与と削除は、ゲーム本体の更新(`PATCH /api/games/:id`)と異なり所有者・登録者・adminに限らない。ログイン済みのメンバーなら誰でも任意のゲームにタグを付けたり外したりできる。

## 写真アップロードの流れ

1. ブラウザ側でCanvasを使い、長辺1600pxまで縮小してJPEGへ再符号化する
2. `POST /api/games/:id/photos`へ送る。1枚2MBまで、1ゲーム5枚まで
3. Workerが先頭バイトを見て画像形式を確認し、R2へ`put`する
4. `game_photos`に行を追加する

配信は`GET /img/{r2_key}`をWorkerが受け、R2から読んで返す。キーにはUUIDが入っていて内容が変わらないため、`Cache-Control: public, max-age=31536000, immutable`を付ける。R2バケットは直接公開せず、Worker経由に限定する。

`/img/*`は他の全ルートと異なり`requireAuth`を通さない、意図的な認証不要のcapability URLである。R2キー(`games/{game_id}/{uuid}.jpg`)は推測困難なため、実害は「URLを知っていれば誰でも見られる」範囲に留まる。

## エラー規約

- 認証必須のエンドポイントでセッションが無効：`401 {"error": "..."}`
- 所有者/admin以外による更新や削除：`403 {"error": "..."}`
- 存在しないリソース：`404 {"error": "..."}`
- 入力値の検証エラー(必須項目欠落、文字数超過、写真の枚数/サイズ超過など)：`400 {"error": "..."}`
- その他(D1/R2起因の想定外エラー)：`500 {"error": "..."}`(個別のtry/catchで握りつぶさずそのまま返す方針)

エラーレスポンスの形は`{ error: string }`に統一する。
