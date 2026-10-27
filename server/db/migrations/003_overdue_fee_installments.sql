DROP INDEX IF EXISTS ux_fees_loan_type;
CREATE UNIQUE INDEX ux_fees_loan_type_pending
  ON fees(loan_id, type) WHERE loan_id IS NOT NULL AND status = 'pending';
