-- Migration: 0001_init.sql
-- Description: Create initial schema for homes, members, bills, and shares with named integrity constraints.

CREATE TABLE IF NOT EXISTS homes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_members_home FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT ck_members_name_non_empty CHECK (length(trim(name)) > 0)
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_bills_home FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT ck_bills_total_cents_positive CHECK (total_cents > 0)
);

CREATE TABLE IF NOT EXISTS bill_shares (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_shares_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT ck_shares_amount_cents_positive CHECK (amount_cents > 0),
  CONSTRAINT uq_shares_bill_member UNIQUE (bill_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_members_home ON members(home_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bills_home ON bills(home_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shares_bill ON bill_shares(bill_id);
CREATE INDEX IF NOT EXISTS idx_shares_member ON bill_shares(member_id);
