PRAGMA foreign_keys = ON;

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  built_in INTEGER NOT NULL DEFAULT 0 CHECK (built_in IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE reader_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reader_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  id_card TEXT UNIQUE,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  max_borrow_override INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  translator TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  publish_date TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  keywords TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '中文',
  edition TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'off_shelf')),
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_books_title ON books(title);
CREATE INDEX idx_books_category ON books(category_id);
CREATE INDEX idx_books_status ON books(status);

CREATE TABLE book_authors (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, author_id)
);
CREATE INDEX idx_book_authors_author ON book_authors(author_id);

CREATE TABLE copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL COLLATE NOCASE UNIQUE,
  location TEXT NOT NULL,
  shelf TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'borrowed', 'reserved', 'repair', 'lost', 'off_shelf')),
  condition_note TEXT NOT NULL DEFAULT '',
  last_inventory_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_copies_book ON copies(book_id);
CREATE INDEX idx_copies_status ON copies(status);
CREATE INDEX idx_copies_location ON copies(location);

CREATE TABLE copy_status_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_id INTEGER NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  operator_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_copy_logs_copy ON copy_status_logs(copy_id, created_at);

CREATE TABLE loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_id INTEGER NOT NULL REFERENCES copies(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  reader_id INTEGER NOT NULL REFERENCES reader_profiles(id),
  borrowed_by INTEGER NOT NULL REFERENCES users(id),
  borrowed_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  returned_at TEXT,
  renewals INTEGER NOT NULL DEFAULT 0 CHECK (renewals >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
  return_condition TEXT NOT NULL DEFAULT '',
  returned_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_loans_active_copy ON loans(copy_id) WHERE returned_at IS NULL;
CREATE UNIQUE INDEX ux_loans_active_reader_book ON loans(reader_id, book_id) WHERE returned_at IS NULL;
CREATE INDEX idx_loans_reader ON loans(reader_id, borrowed_at);
CREATE INDEX idx_loans_due ON loans(due_at);
CREATE INDEX idx_loans_status ON loans(status);

CREATE TABLE reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  reader_id INTEGER NOT NULL REFERENCES reader_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'ready', 'fulfilled', 'cancelled', 'expired')),
  copy_id INTEGER REFERENCES copies(id),
  created_at TEXT NOT NULL,
  ready_at TEXT,
  pickup_expires_at TEXT,
  closed_at TEXT,
  note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX ux_reservations_active_reader
  ON reservations(reader_id, book_id) WHERE status IN ('waiting', 'ready');
CREATE INDEX idx_reservations_book_status ON reservations(book_id, status, created_at);
CREATE INDEX idx_reservations_reader ON reservations(reader_id, created_at);

CREATE TABLE fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_id INTEGER NOT NULL REFERENCES reader_profiles(id) ON DELETE CASCADE,
  loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('overdue', 'lost', 'damage', 'manual')),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled', 'waived')),
  note TEXT NOT NULL DEFAULT '',
  handled_by INTEGER REFERENCES users(id),
  handled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_fees_loan_type ON fees(loan_id, type) WHERE loan_id IS NOT NULL;
CREATE INDEX idx_fees_reader_status ON fees(reader_id, status);
CREATE INDEX idx_fees_created ON fees(created_at);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  related_type TEXT,
  related_id INTEGER,
  dedupe_key TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read_at);

CREATE TABLE announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'withdrawn')),
  published_at TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_announcements_status ON announcements(status, published_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'string' CHECK (type IN ('string', 'integer', 'boolean')),
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  details TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at);
CREATE INDEX idx_audit_object ON audit_logs(object_type, object_id);
