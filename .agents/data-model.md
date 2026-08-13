# データモデル

D1(SQLite互換)のテーブル定義。
時刻はUNIXエポック秒のINTEGERで統一する。

マイグレーションは`wrangler d1 migrations create DB <name>`で作成し、`migrations/NNNN_<name>.sql`に置く。
以下は`0001_init.sql`から`0003_add_bga_slug.sql`までの全マイグレーション適用後の最終スキーマである。
`registered_by_id`は`0002`、`bga_slug`は`0003`で追加した列であり、`0001_init.sql`自体にはこの2列は無い。

```sql
-- ユーザー。id は Discord のユーザー ID
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,          -- Discord のユーザー名
  display_name  TEXT NOT NULL,          -- Discordの表示名(global_name)。ログインのたびに最新の値で上書きする
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'member',  -- 'member' | 'admin'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

-- セッション
CREATE TABLE sessions (
  id_hash    TEXT PRIMARY KEY,          -- セッション ID の SHA-256
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ゲーム
CREATE TABLE games (
  id            TEXT PRIMARY KEY,       -- UUID v4
  owner_id      TEXT NOT NULL REFERENCES users(id),  -- 実際の持ち主
  registered_by_id TEXT REFERENCES users(id),        -- 入力した人。代理登録でなければ owner_id と同じ(0002で追加)
  title         TEXT NOT NULL,
  min_players   INTEGER,
  max_players   INTEGER,
  play_time_min INTEGER,                -- 分
  play_time_max INTEGER,
  note          TEXT,                   -- 所有者のコメント。「重ゲー」「拡張入り」など
  bgg_id        INTEGER,                -- 手入力の補助情報。任意
  bga_slug      TEXT,                   -- BGA(ボードゲームアリーナ)のゲームスラッグ。任意(0003で追加)
  status        TEXT NOT NULL DEFAULT 'available',  -- 'available' | 'retired'
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER                 -- 論理削除
);
CREATE INDEX idx_games_owner   ON games(owner_id);
CREATE INDEX idx_games_players ON games(min_players, max_players);
CREATE INDEX idx_games_active  ON games(deleted_at, created_at DESC);

-- 写真
CREATE TABLE game_photos (
  id           TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  r2_key       TEXT NOT NULL UNIQUE,    -- 例: games/{game_id}/{uuid}.jpg
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  sort_order   INTEGER NOT NULL DEFAULT 0,  -- 0 番目をサムネイルに使う
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_photos_game ON game_photos(game_id, sort_order);

-- タグ
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,       -- UUID v4
  name       TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- ゲームとタグの中間テーブル
CREATE TABLE game_tags (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, tag_id)
);
CREATE INDEX idx_game_tags_tag ON game_tags(tag_id);
```

## 設計判断

**人数の絞り込み**：「N人で遊べる」は`min_players <= N AND (max_players IS NULL OR max_players >= N)`で判定する。
`max_players`が`NULL`は「上限なし(最小人数以上なら何人でも可)」を表す。
`min_players`は登録フォームで必須入力にするが、`max_players`は任意とする(`.agents/client.md`参照)。

**削除**：`games`は`deleted_at`を立てる論理削除にする。
誤操作からの復旧を管理者がSQLで行えるようにするためである。
R2の実体は、論理削除から一定期間後にまとめて手動で消す運用でよい(自動化はしない)。

**所有者の重複**：同じタイトルを複数人が持つ状況は普通に起きる。
`games`は「誰の持ち物か」を単位とする表なので、タイトルの重複を制約で禁止しない。
一覧では同一タイトルをまとめず、所有者名を添えて並べる。

**所有者と登録者**：会場では「持ってきた本人ではない誰かがまとめて入力する」ことが実際に起きるため、`owner_id`(実際の持ち主)と`registered_by_id`(入力した人)を分けて持つ。
`registered_by_id`は`0002`で後から追加した列であり、既存行は`owner_id`と同じ値で埋めてある(この列の追加前は両者が常に一致していた)。
NOT NULL制約は付けていないが、アプリからの登録では必ず設定する。
編集や削除の権限は、所有者・登録者・adminの三者に与える。
代理登録した人が自分の入力ミスを直すのにadminを待たなくてよいようにするためである。

**セッション**：`sessions.id_hash`にはCookieに入れる値そのものではなく、そのSHA-256ハッシュを保存する。
DBが読まれてもセッションを復元できないようにするためである。
詳細は`.agents/auth.md`。

**タグ**：`tags`は候補リストを持たず、メンバーが自由に作成する。
`name`をUNIQUEにして表記の重複だけは防ぐが、表記揺れ(「重ゲー」「重量級」など)の統一は運用に委ねる。

**写真の保存**：アップロードはJPEGのみ受け付け、`Content-Type`ヘッダとファイル先頭のマジックバイト(`FF D8 FF`)の両方を確認する(どちらか一方の詐称に備えた二重チェック)。
`r2_key`は`games/{game_id}/{uuid}.jpg`の形式である。
`sort_order`は追加のたびに既存最大値+1を採番し、`0`番目をサムネイルに使う。
`width`と`height`はクライアント側で縮小済みの画像をそのまま保存するだけなので、現状は取得も保存もしておらず常に`NULL`。

**タグ名の制約**：30文字以内、trim後に空文字は不可、制御文字(`\x00`-`\x1f`、`\x7f`)は拒否する。
バリデーションは`src/worker/routes/tags.ts`。
