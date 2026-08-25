CREATE TABLE IF NOT EXISTS customer_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_payment_id UUID NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_payment_id, sale_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_payment_alloc_payment
  ON customer_payment_allocations(customer_payment_id);

CREATE INDEX IF NOT EXISTS idx_customer_payment_alloc_sale
  ON customer_payment_allocations(sale_id);

DO $$
DECLARE
  p RECORD;
  s RECORD;
  alloc NUMERIC(14,2);
  remaining NUMERIC(14,2);
  outstanding NUMERIC(14,2);
BEGIN
  FOR p IN
    SELECT cp.id, cp.customer_id, cp.amount
    FROM customer_payments cp
    ORDER BY cp.customer_id, cp.created_at, cp.id
  LOOP
    remaining := p.amount;

    FOR s IN
      SELECT sa.id,
        GREATEST(
          sa.total-sa.paid-
          COALESCE((SELECT SUM(r.total) FROM returns r WHERE r.sale_id=sa.id),0),
          0
        ) AS base_outstanding
      FROM sales sa
      WHERE sa.customer_id=p.customer_id
        AND sa.status<>'cancelled'
      ORDER BY sa.created_at,sa.id
    LOOP
      EXIT WHEN remaining<=0;

      outstanding:=GREATEST(
        s.base_outstanding-
        COALESCE((
          SELECT SUM(cpa.amount)
          FROM customer_payment_allocations cpa
          WHERE cpa.sale_id=s.id
        ),0),0
      );

      IF outstanding>0 THEN
        alloc:=LEAST(remaining,outstanding);
        INSERT INTO customer_payment_allocations(customer_payment_id,sale_id,amount)
        VALUES(p.id,s.id,alloc)
        ON CONFLICT(customer_payment_id,sale_id)
        DO UPDATE SET amount=EXCLUDED.amount;
        remaining:=remaining-alloc;
      END IF;
    END LOOP;
  END LOOP;
END $$;
