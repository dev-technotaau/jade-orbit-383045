-- Data fix: cancel same-category entitlements that stacked before the
-- purchase-time supersede rule shipped (June 2026). The runtime rule now
-- cancels these at grant time; this migration applies the same rule once
-- to rows created before the fix. Remaining units on the cancelled rows
-- are forfeited (no retroactive carry-forward) — all affected rows are
-- test-phase purchases.

-- Step 1: FREE plan entitlements (basePricePaise = 0) are superseded by
-- ANY still-valid ACTIVE paid entitlement in the same category.
UPDATE "Entitlement" AS e
SET "status" = 'CANCELLED',
    "cancelledAt" = NOW(),
    "updatedAt" = NOW()
FROM "Plan" AS p
WHERE p."id" = e."planId"
  AND e."status" = 'ACTIVE'
  AND p."basePricePaise" = 0
  AND EXISTS (
    SELECT 1
    FROM "Entitlement" e2
    JOIN "Plan" p2 ON p2."id" = e2."planId"
    WHERE e2."userId" = e."userId"
      AND e2."id" <> e."id"
      AND e2."status" = 'ACTIVE'
      AND e2."validUntil" > NOW()
      AND p2."category" = p."category"
      AND p2."basePricePaise" > 0
  );

-- Step 2: PAID entitlements are superseded by a later-starting ACTIVE
-- entitlement of a DIFFERENT plan in the same category at the same or
-- higher tier (mirror of the runtime rule: buying cheaper never cancels
-- pricier; same-plan repurchase stacks as a top-up and is untouched).
UPDATE "Entitlement" AS e
SET "status" = 'CANCELLED',
    "cancelledAt" = NOW(),
    "updatedAt" = NOW()
FROM "Plan" AS p
WHERE p."id" = e."planId"
  AND e."status" = 'ACTIVE'
  AND p."basePricePaise" > 0
  AND EXISTS (
    SELECT 1
    FROM "Entitlement" e2
    JOIN "Plan" p2 ON p2."id" = e2."planId"
    WHERE e2."userId" = e."userId"
      AND e2."planId" <> e."planId"
      AND e2."status" = 'ACTIVE'
      AND e2."validUntil" > NOW()
      AND p2."category" = p."category"
      AND p2."basePricePaise" >= p."basePricePaise"
      AND (
        e2."validFrom" > e."validFrom"
        OR (e2."validFrom" = e."validFrom" AND e2."id" > e."id")
      )
  );
