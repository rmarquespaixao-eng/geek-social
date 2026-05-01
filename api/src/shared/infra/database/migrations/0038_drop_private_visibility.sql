-- Migrate private communities to restricted and remove 'private' from enum.
-- statement-breakpoint
UPDATE communities SET visibility = 'restricted' WHERE visibility = 'private';
--> statement-breakpoint
CREATE TYPE community_visibility_v2 AS ENUM ('public', 'restricted');
--> statement-breakpoint
-- Postgres não consegue auto-castear o DEFAULT da coluna entre tipos enum diferentes.
-- Tira o default antes do ALTER TYPE e recoloca depois.
ALTER TABLE communities ALTER COLUMN visibility DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE communities
  ALTER COLUMN visibility TYPE community_visibility_v2
  USING visibility::text::community_visibility_v2;
--> statement-breakpoint
ALTER TABLE communities ALTER COLUMN visibility SET DEFAULT 'public';
--> statement-breakpoint
DROP TYPE community_visibility;
--> statement-breakpoint
ALTER TYPE community_visibility_v2 RENAME TO community_visibility;
