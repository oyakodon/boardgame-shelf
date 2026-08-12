-- BGA(ボードゲームアリーナ)のゲームページへのリンクを任意で登録できるようにする。
-- bgg_idと同じ方針で、スラッグだけ持ちURLは表示時に組み立てる。
ALTER TABLE games ADD COLUMN bga_slug TEXT;
