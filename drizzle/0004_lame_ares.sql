CREATE TABLE `card_metadata_cards` (
	`passcode` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`card_type` text NOT NULL,
	`frame_type` text,
	`description` text,
	`race` text,
	`attribute` text,
	`image_url` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card_metadata_printings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`passcode` text NOT NULL,
	`set_name` text NOT NULL,
	`set_code` text NOT NULL,
	`rarity` text,
	`rarity_code` text,
	`source_set_price` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`passcode`) REFERENCES `card_metadata_cards`(`passcode`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_metadata_printings_set_code_unique` ON `card_metadata_printings` (`set_code`);