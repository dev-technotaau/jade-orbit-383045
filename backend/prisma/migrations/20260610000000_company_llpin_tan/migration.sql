-- Migration: LLPIN + TAN on CompanyProfile
--
-- Two more Indian legal identity codes on the employer profile,
-- joining gstNumber / cinNumber / panNumber:
--   - llpinNumber: LLP Identification Number (MCA format AAA-9999) —
--     LLPs have an LLPIN instead of a CIN, so the CIN field alone left
--     them with nowhere to put their registration id.
--   - tanNumber: Tax Deduction and Collection Account Number (format
--     AAAA99999A) — relevant to any employer that deducts TDS, both
--     company and individual/proprietor accounts.
--
-- Both NULLable, no backfill needed. Deliberately NOT unique (unlike
-- gst/cin): nullable-unique is safe for NULLs but clients that persist
-- empty strings would trip a unique index; pan set the non-unique
-- precedent. Collected-and-stored only — the public sanitiser strips
-- all legal ids from public payloads.

ALTER TABLE "CompanyProfile"
  ADD COLUMN "llpinNumber" TEXT,
  ADD COLUMN "tanNumber" TEXT;
