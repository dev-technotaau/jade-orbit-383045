-- Migration: Candidate Profile Boost Activation Window
--
-- Adds a per-candidate timestamp tracking when a discretionary profile-boost
-- activation expires. The Candidate Premium plan grants a 7-day BOOST_DAYS
-- pool that the candidate spends ONE day at a time via
-- POST /candidates/me/boost/activate. Each activation:
--
--   1. Consumes 1 BOOST_DAYS resource (atomic, via entitlement service)
--   2. Sets profileBoostActiveUntil to now+24h (or extends it if already in
--      the future, so re-activations stack rather than overlap-waste)
--
-- Search ranking (search.service.ts) now checks BOTH the
-- feature.candidate_profile_boost flag AND profileBoostActiveUntil > now()
-- before applying the boost rank weight (12) — so the 7-day pool maps
-- directly to 7×24h of elevated visibility rather than the full plan
-- duration.
--
-- Changes:
--   1. Add NULLable timestamp column (existing rows default to NULL → no
--      backfill needed; null is treated as "not currently boosted").
--   2. Btree index for the search-time `> NOW()` predicate.

ALTER TABLE "CandidateProfile"
  ADD COLUMN "profileBoostActiveUntil" TIMESTAMP(3);

CREATE INDEX "CandidateProfile_profileBoostActiveUntil_idx"
  ON "CandidateProfile"("profileBoostActiveUntil");
