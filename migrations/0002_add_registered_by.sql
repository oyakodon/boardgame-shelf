-- 所有者(owner_id)と登録者(registered_by_id)を分離する。
-- 他人の持ち物を代理で登録するケースが実際に発生したため。
-- 既存行は登録者=所有者として埋める(この列の追加前は両者が常に一致していた)。
ALTER TABLE games ADD COLUMN registered_by_id TEXT REFERENCES users(id);

UPDATE games SET registered_by_id = owner_id WHERE registered_by_id IS NULL;
