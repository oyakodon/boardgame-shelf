# Discordスラッシュコマンド

## `/shelf`

「今日は5人だけど何ができる?」にDiscord上で即答するためのコマンド。
条件に合うゲームから1件だけランダムに選んで返信する(候補の選び直しUIは持たない)。

オプションはどちらも任意。

- `players`(整数)：プレイ人数。指定時は`min_players <= players AND (max_players IS NULL OR max_players >= players)`で絞り込む(`.agents/data-model.md`の判定式と同じ)
- `mode`(`online` | `real`)：`online`は`bga_slug`が設定されているゲームに絞る(BGAで遊べる)。`real`は絞り込みを行わない(全ゲームが対象)。専用のonline/realカラムは持たない

どちらも未指定なら、そのオプションでの絞り込みを行わない(結果としてランダム性が増す)。
対象は`status = 'available'`かつ`deleted_at IS NULL`のゲームのみ。該当0件なら「🔍 条件に合うゲームが見つかりませんでした。」と返す。

返信はDiscord Embedのカード形式とする。ゲーム名を詳細ページへのリンクにし、人数を説明欄、`👤 所有者`とBGAが設定されている場合の`🎮 BGA`をフィールドに表示する。BGAリンクの表示文字は「プレイ」とする。写真があればサムネイルを付けるが、footerと検索条件(`players`/`mode`)は表示しない。該当なしの場合はEmbedを使わず、`🔍 条件に合うゲームが見つかりませんでした。`を`content`で返す。

## Interactions Endpoint

DiscordはコマンドをHTTPコールバック(`POST /discord/interactions`)で配信する。Botのゲートウェイ接続は持たない(常時起動プロセスが不要な設計に合わせる)。

- `src/worker/discord/verify.ts`：`X-Signature-Ed25519` / `X-Signature-Timestamp`をWeb Crypto(`crypto.subtle.verify("Ed25519", ...)`)で検証する。セッションCookieやADMIN_API_TOKENとは別の認証経路
- `src/worker/discord/interactions.ts`：署名検証 → PING(type 1)にはtype 1で即応答 → 設定済み`DISCORD_GUILD_ID`からのAPPLICATION_COMMAND(type 2)だけを受け付け、`recommend.ts`の結果をtype 4(即時応答)で返す。3秒以内に返す必要があるため、deferred応答(type 5)は使わない。対象外ギルドや`guild_id`欠落は403で拒否する
- `src/worker/discord/recommend.ts`：DB非依存の純粋関数(`filterRecommendableGames` / `pickRandomGame`)。フィルタ条件の単体テストはここに書く

`wrangler.jsonc`の`assets.run_worker_first`に`/discord/*`を含める。これが無いと`/api/*`等と同様、静的アセット探索が先に走りSPAへフォールバックしてしまう(`.agents/operations.md`参照)。

## 環境変数とセットアップ

- `DISCORD_PUBLIC_KEY`(`vars`。非秘密。Discord Developer Portalの「General Information」に表示される値)
- Botの追加とコマンド登録は、既存のOAuth2ログインで使っているDiscordアプリケーションに対して行う(新規アプリケーションは作らない)
  1. Discord Developer Portalでそのアプリケーションに Bot を追加する
  2. `applications.commands`スコープで対象サーバーへインストールする
  3. `scripts/register-discord-commands.mjs`を一度実行してギルドコマンドとして登録する(グローバルコマンドにはしない)
     ```bash
     DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... DISCORD_GUILD_ID=... node scripts/register-discord-commands.mjs
     ```
     `DISCORD_BOT_TOKEN`と`DISCORD_APPLICATION_ID`はこのスクリプト専用で、Workerの`wrangler secret`には登録しない(Worker本体はコマンド登録を行わないため)
  4. Discord Developer PortalのInteractions Endpoint URLに公開ドメイン(`.agents/architecture.md`参照)の`/discord/interactions`を設定する(ここでDiscordがPINGを送り、署名検証込みで疎通確認する)
- コマンド定義(`players`/`mode`)を変更したら`register-discord-commands.mjs`を再実行する
