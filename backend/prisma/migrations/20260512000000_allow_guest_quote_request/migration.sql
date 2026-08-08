-- Migration: Allow Guest Quote Requests
--
-- Lets guests submit "Contact Sales" enterprise quote requests from the
-- public pricing page without first creating an account. Authenticated
-- submissions continue to attach the userId so /billing/quote/me works.
--
-- Changes:
--   1. QuoteRequest.userId becomes NULLABLE.
--   2. Foreign key action flips Cascade → SetNull, so a user deletion
--      preserves the historical quote (with userId set to NULL) rather
--      than removing it. Idempotent for already-null rows.

-- 1. Make userId nullable
ALTER TABLE "QuoteRequest" ALTER COLUMN "userId" DROP NOT NULL;

-- 2. Replace FK constraint to flip onDelete behaviour
ALTER TABLE "QuoteRequest" DROP CONSTRAINT "QuoteRequest_userId_fkey";
ALTER TABLE "QuoteRequest"
  ADD CONSTRAINT "QuoteRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
