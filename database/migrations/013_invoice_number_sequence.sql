BEGIN;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1;

DO $$
DECLARE
  max_numeric BIGINT;
BEGIN
  SELECT MAX(invoice_number::BIGINT)
    INTO max_numeric
  FROM sales
  WHERE invoice_number ~ '^[0-9]+$';

  IF max_numeric IS NULL OR max_numeric < 1 THEN
    PERFORM setval('invoice_number_seq', 1, false);
  ELSE
    PERFORM setval('invoice_number_seq', max_numeric, true);
  END IF;
END $$;

COMMIT;
