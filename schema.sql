
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  package_id TEXT NOT NULL,
  robux INTEGER NOT NULL,
  price INTEGER NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'unverified',
  order_status TEXT NOT NULL DEFAULT 'waiting_payment',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
ON orders(created_at);

CREATE INDEX IF NOT EXISTS idx_orders_status
ON orders(order_status);
