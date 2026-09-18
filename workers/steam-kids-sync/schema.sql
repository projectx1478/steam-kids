-- steam-kids-sync D1 スキーマ。docs/design-sync.md 参照。
-- 適用済み（database_id: 6efb84b6-8aff-42cf-b4c5-07c8a1a978b7）。再構築時のみ使用する。

CREATE TABLE devices (secretHash TEXT PRIMARY KEY, learnerId TEXT NOT NULL, createdAt INTEGER NOT NULL);
CREATE INDEX idx_devices_learner ON devices(learnerId);

CREATE TABLE events (
  eventId TEXT PRIMARY KEY, learnerId TEXT NOT NULL, lessonId TEXT,
  stepId TEXT, type TEXT NOT NULL, ts INTEGER NOT NULL, payload TEXT
);
CREATE INDEX idx_events_learner_ts ON events(learnerId, ts);

CREATE TABLE link_codes (code TEXT PRIMARY KEY, learnerId TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, windowStart INTEGER NOT NULL, count INTEGER NOT NULL);
