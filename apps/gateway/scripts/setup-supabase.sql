-- wall402 Supabase schema
-- Run this in the Supabase SQL editor: https://irhvxhyjlvbogkxchehz.supabase.co

-- Settlements / payment receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  endpoint_label TEXT NOT NULL,
  product_kind TEXT,
  tx_hash TEXT NOT NULL,
  payer TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount TEXT NOT NULL,
  token TEXT NOT NULL DEFAULT 'USDG',
  network TEXT NOT NULL DEFAULT 'mainnet',
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_summary TEXT,
  upstream_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_receipts_payer ON receipts(payer);
CREATE INDEX IF NOT EXISTS idx_receipts_settled ON receipts(settled_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_endpoint ON receipts(endpoint_id);

-- Enable RLS but allow public reads (it's an audit log)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read receipts" ON receipts
  FOR SELECT USING (true);

CREATE POLICY "Server can insert receipts" ON receipts
  FOR INSERT WITH CHECK (true);

-- Stats view for fast dashboard queries
CREATE OR REPLACE VIEW receipt_stats AS
SELECT
  COUNT(*) as total_calls,
  COALESCE(SUM(CAST(amount AS BIGINT)), 0) as total_volume_raw,
  COUNT(DISTINCT payer) as unique_payers,
  COUNT(DISTINCT endpoint_id) as products_used
FROM receipts;
