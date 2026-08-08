-- Client-managed UI preferences (sidebar pins / section expansion / collapsed
-- rail, etc.) — an opaque JSON blob owned by the frontend.
ALTER TABLE "User" ADD COLUMN "uiPreferences" JSONB;
