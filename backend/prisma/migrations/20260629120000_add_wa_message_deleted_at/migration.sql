-- "Delete for me": soft-delete marker that hides a WhatsApp message from the
-- admin inbox view (the Cloud API has no revoke endpoint, so this is our-side
-- only). NULL = visible; non-NULL = hidden.
ALTER TABLE "WaMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
