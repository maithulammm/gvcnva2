CREATE TABLE IF NOT EXISTS gvcn_api_metrics (
  bucket TEXT NOT NULL, route TEXT NOT NULL, method TEXT NOT NULL, status INTEGER NOT NULL,
  requests INTEGER NOT NULL, total_ms REAL NOT NULL, max_ms REAL NOT NULL, slow_requests INTEGER NOT NULL,
  PRIMARY KEY (bucket,route,method,status)
);
