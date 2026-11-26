CREATE TABLE IF NOT EXISTS gvcn_revision_cache (
  year TEXT NOT NULL, class_id TEXT NOT NULL, revision INTEGER NOT NULL,
  observed_at INTEGER NOT NULL,
  PRIMARY KEY (year,class_id)
);
