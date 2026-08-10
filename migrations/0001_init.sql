-- ユーザー。id は Discord のユーザー ID
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL,          -- Discord のユーザー名
  display_name  TEXT NOT NULL,          -- 会での表示名。初期値は global_name
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
  owner_id      TEXT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  title_reading TEXT,                   -- ひらがな。並べ替えと検索の補助
  min_players   INTEGER,
  max_players   INTEGER,
  play_time_min INTEGER,                -- 分
  play_time_max INTEGER,
  min_age       INTEGER,
  note          TEXT,                   -- 所有者のコメント。「重ゲー」「拡張入り」など
  bgg_id        INTEGER,                -- 手入力の補助情報。任意
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
