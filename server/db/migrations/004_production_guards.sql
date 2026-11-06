ALTER TABLE loans ADD COLUMN fine_rate_cents INTEGER CHECK (fine_rate_cents >= 0);
UPDATE loans SET fine_rate_cents = COALESCE(
  (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'fine_per_day_cents'), 50
);

ALTER TABLE books ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE auth_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX idx_auth_limits_window ON auth_limits(window_start);
CREATE INDEX idx_loans_borrowed_at ON loans(borrowed_at);
CREATE INDEX idx_loans_returned_at ON loans(returned_at) WHERE returned_at IS NOT NULL;

INSERT OR IGNORE INTO menu_permissions (menu_id, permission_id)
SELECT m.id, p.id FROM menus m CROSS JOIN permissions p
WHERE m.code = 'permission-menus' AND m.path = '/system/access' AND p.code = 'menu.manage';
