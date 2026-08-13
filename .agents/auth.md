# 認証と認可

## Discord OAuth2の流れ

要求するスコープは`identify`と`guilds.members.read`の二つ。後者は対象サーバーに参加しているかどうかの確認に使う。

1. `GET /auth/login`: `state`とPKCEの`code_verifier`を生成し、HttpOnly Cookieに保存してDiscordの認可画面へリダイレクトする
2. `GET /auth/callback`: Cookieの`state`とクエリの`state`を突き合わせ、一致しなければ拒否する
3. 認可コードを`code_verifier`とともにトークンエンドポイントへ送り、アクセストークンを得る
4. そのトークンで`GET /users/@me/guilds/{DISCORD_GUILD_ID}/member`を呼ぶ。404が返ればサーバー未参加なので、ログインを拒否する
5. `users`テーブルへupsertする。Discordのユーザー IDが主キー
6. セッションを発行してCookieに載せ、トップページへリダイレクトする

Discordのアクセストークン/リフレッシュトークンは保存しない。参加確認はログイン時に一度行えば足り、保持すると漏洩時の被害が広がるため。

サーバーを抜けたメンバーのセッションは、最長でセッション有効期限まで生き残る。即時に締め出したいときは管理者が`sessions`から該当行を削除する(専用の管理UIは用意しない。D1コンソール/SQLでの操作を想定)。

## セッション

ランダムな32バイトの値をbase64urlで符号化してCookieに入れ、D1にはそのSHA-256ハッシュだけを保存する(`sessions.id_hash`)。

- Cookie名：`session`。本番(https)では`__Host-`プレフィックスが付き実質`__Host-session`になる
- 属性：`HttpOnly; Secure; SameSite=Lax; Path=/`
- 有効期限：30日。アクセスのたびに残り7日を切っていれば延長する

`__Host-`プレフィックスは、Secure属性必須、Domain属性禁止、Path=/必須という制約を伴う。`wrangler dev`のhttp://localhost環境ではこの制約によりCookieが保存されない可能性があるため、dev環境では`Secure`を外した別名Cookieにフォールバックする。

CSRF対策はSameSite=Laxに加えて、更新系リクエスト(POST/PATCH/DELETE)で`Origin`ヘッダが自サイトと一致することを確認する。

## 権限

役割は二つだけ。

- **member**：ログインできる全員。閲覧は全件、作成は自由、更新と削除は自分が所有者または登録者になっているゲームのみ
- **admin**：加えて他人の登録も更新や削除ができる。荒れた投稿の後始末と、退会者の登録の整理に使う

初期の管理者は環境変数`ADMIN_DISCORD_IDS`(カンマ区切り)で指定する。初回ログイン時の`users`行作成時にのみ`role`へ反映され、以後のログインでは上書きしない(`ADMIN_DISCORD_IDS`を後から変更しても既存ユーザーの`role`には影響しない)。
以後の昇格や降格は管理者がD1を直接操作する想定で、管理UIは用意しない。

認可チェックは各APIハンドラでリクエストごとに行う(ミドルウェアがHonoの`c.set("user", ...)`でユーザーを注入し、ルートハンドラ側で`c.get("user")`を使って所有者判定とadmin判定を行う方針)。

## 管理者用の固定トークン認証(curl用)

一般メンバーは上記のDiscord OAuth2 + セッションCookieでログインする(UIあり)。
それとは別に、管理者(自分)がcurlで直接APIを叩けるように、固定トークンによる認証を用意する。

- 管理者は自分一人であることを前提とする(複数管理者への対応は設計しない)。環境変数`ADMIN_API_TOKEN`(`wrangler secret put`で設定。ランダムな十分長い値)は1つだけ発行し、管理者本人だけが持つ
- リクエストに`Authorization: Bearer <ADMIN_API_TOKEN>`が付いていれば、セッションCookieなしでも認証済みとして扱う
- このトークンが認証されたリクエストは、`ADMIN_DISCORD_IDS`の先頭(またはトークンに対応付けた特定の1件)に該当する`users`行の本人として振る舞う。合成のダミーユーザーにはしない。`owner_id`等の外部キーが実在の`users.id`を指すようにするため、対象の管理者は事前に一度Discord OAuth2でログイン済みで`users`行が存在することを前提とする
- ログインUI、セッション発行、OAuth2フローは一切経由しない。認可(member/admin判定)はセッション認証時と同じロジックをそのまま使う(このユーザーは`ADMIN_DISCORD_IDS`経由で`role='admin'`になっている)
- CSRFのOrigin検証は、Cookieを使わないこの認証経路には適用しない(トークン自体が秘密情報であり、Cookie特有の「ブラウザが自動送信してしまう」問題がないため)
- トークンは`ADMIN_API_TOKEN`という名前どおり、漏洩すれば管理者権限で全操作(他人の登録の更新や削除を含む)が可能になる。`.dev.vars`等にコミットしない
