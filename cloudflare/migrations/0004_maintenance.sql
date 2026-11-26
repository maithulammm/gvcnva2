CREATE TABLE IF NOT EXISTS gvcn_maintenance (
  id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
  message TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO gvcn_maintenance(id,enabled,message,revision)
VALUES(1,0,'Hệ thống đang bảo trì. Vui lòng chờ, hệ thống sẽ tự mở lại khi hoàn tất.',0);
