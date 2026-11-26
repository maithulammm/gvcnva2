-- Shared write barrier. Leases never expire automatically: an uncertain write
-- must be investigated rather than silently declared finished.
CREATE TABLE IF NOT EXISTS gvcn_storage_control (
  id INTEGER PRIMARY KEY CHECK(id=1),
  source TEXT NOT NULL DEFAULT 'firebase' CHECK(source IN('firebase','supabase')),
  frozen INTEGER NOT NULL DEFAULT 0 CHECK(frozen IN(0,1)),
  epoch INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO gvcn_storage_control(id) VALUES(1);
CREATE TABLE IF NOT EXISTS gvcn_storage_leases (
  id TEXT PRIMARY KEY, started_at TEXT NOT NULL
);
