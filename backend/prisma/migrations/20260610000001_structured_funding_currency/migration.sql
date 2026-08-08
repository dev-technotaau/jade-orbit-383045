-- Migration: Structured funding amount + currency on CompanyProfile
--
-- `totalFundingRaised` was free text ("$50M", "₹200 Crore") — useless
-- for queries/sorting and inconsistent across rows. The new currency
-- selector (CurrencyAmountInput) writes structured fields:
--   - totalFundingRaisedAmount: raw amount (Decimal 18,2)
--   - fundingCurrency: ISO-4217 code, default INR
-- while continuing to dual-write the formatted display string into
-- totalFundingRaised so every existing read site (company page, profile
-- preview, super-admin, onboarding review) keeps working unchanged and
-- legacy rows stay displayable.

ALTER TABLE "CompanyProfile"
  ADD COLUMN "totalFundingRaisedAmount" DECIMAL(18,2),
  ADD COLUMN "fundingCurrency" TEXT DEFAULT 'INR';
