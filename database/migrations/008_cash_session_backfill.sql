-- Backfill existing cash movements into the cash session in which they occurred.
-- Movements that predate every known session remain unassigned historical data.
UPDATE cash_movements cm
SET session_id = s.id
FROM cash_sessions s
WHERE cm.session_id IS NULL
  AND cm.created_at >= s.opened_at
  AND cm.created_at < COALESCE(s.closed_at, 'infinity'::timestamptz);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session_created
  ON cash_movements(session_id, created_at DESC);
