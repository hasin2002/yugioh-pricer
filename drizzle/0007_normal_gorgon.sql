ALTER TABLE `session_items` ADD `rarity_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `session_items` ADD `printing_identity_trusted` integer DEFAULT false NOT NULL;