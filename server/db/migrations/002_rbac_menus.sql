PRAGMA foreign_keys = ON;

ALTER TABLE permissions ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE permissions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'disabled'));
ALTER TABLE permissions ADD COLUMN is_system INTEGER NOT NULL DEFAULT 1
  CHECK (is_system IN (0, 1));
ALTER TABLE permissions ADD COLUMN created_at TEXT;
ALTER TABLE permissions ADD COLUMN updated_at TEXT;

UPDATE permissions SET created_at = COALESCE(created_at, datetime('now')), updated_at = COALESCE(updated_at, datetime('now'));

ALTER TABLE sessions ADD COLUMN active_role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL;
UPDATE sessions
SET active_role_id = (SELECT role_id FROM users WHERE users.id = sessions.user_id)
WHERE active_role_id IS NULL;

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at)
SELECT id, role_id, datetime('now') FROM users;

CREATE TABLE menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('module', 'group', 'item')),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  path TEXT,
  icon TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_menus_parent ON menus(parent_id, sort_order);
CREATE INDEX idx_menus_status ON menus(status);

CREATE TABLE menu_permissions (
  menu_id INTEGER NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (menu_id, permission_id)
);
CREATE INDEX idx_menu_permissions_permission ON menu_permissions(permission_id);
