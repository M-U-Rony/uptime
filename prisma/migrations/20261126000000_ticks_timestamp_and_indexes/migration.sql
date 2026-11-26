-- Add tick timestamp, optional HTTP status code, cascading website deletion,
-- duplicate URL prevention per user, and indexes for fast dashboard queries.

ALTER TABLE "Website" ALTER COLUMN "timeAdded" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "WebsiteTicks"
  ADD COLUMN IF NOT EXISTS "statusCode" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Update foreign keys to cascade deletes cleanly
ALTER TABLE "Website" DROP CONSTRAINT IF EXISTS "Website_userid_fkey";
ALTER TABLE "Website"
  ADD CONSTRAINT "Website_userid_fkey"
  FOREIGN KEY ("userid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebsiteTicks" DROP CONSTRAINT IF EXISTS "WebsiteTicks_website_id_fkey";
ALTER TABLE "WebsiteTicks"
  ADD CONSTRAINT "WebsiteTicks_website_id_fkey"
  FOREIGN KEY ("website_id") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes & uniqueness
CREATE INDEX IF NOT EXISTS "Website_userid_idx" ON "Website"("userid");
CREATE UNIQUE INDEX IF NOT EXISTS "Website_userid_url_key" ON "Website"("userid", "url");
CREATE INDEX IF NOT EXISTS "WebsiteTicks_website_id_createdAt_idx" ON "WebsiteTicks"("website_id", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "WebsiteTicks_website_id_region_id_createdAt_idx" ON "WebsiteTicks"("website_id", "region_id", "createdAt" DESC);
