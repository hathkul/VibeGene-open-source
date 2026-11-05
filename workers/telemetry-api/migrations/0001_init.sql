CREATE TABLE installs (
  install_key TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  timezone TEXT NOT NULL,
  heartbeat_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  install_key TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  timezone TEXT NOT NULL
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  email TEXT,
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  status_note TEXT NOT NULL,
  diagnostics TEXT NOT NULL,
  install_key TEXT,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1))
);

CREATE INDEX idx_installs_last_seen ON installs(last_seen DESC);
CREATE INDEX idx_heartbeats_seen_at ON heartbeats(seen_at DESC);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_install_created ON reports(install_key, created_at DESC);
CREATE INDEX idx_reports_resolved_created ON reports(resolved, created_at DESC);
