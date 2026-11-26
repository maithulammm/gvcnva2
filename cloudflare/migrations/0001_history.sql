CREATE TABLE IF NOT EXISTS gvcn_snapshots (
  year TEXT NOT NULL, class_id TEXT NOT NULL, snapshot_key TEXT NOT NULL,
  at TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY (year,class_id,snapshot_key)
);
CREATE INDEX IF NOT EXISTS gvcn_snapshots_recent ON gvcn_snapshots(year,class_id,at DESC);
CREATE TABLE IF NOT EXISTS gvcn_events (
  year TEXT NOT NULL, class_id TEXT NOT NULL, event_key TEXT NOT NULL,
  at TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY (year,class_id,event_key)
);
CREATE INDEX IF NOT EXISTS gvcn_events_recent ON gvcn_events(year,class_id,at DESC);
