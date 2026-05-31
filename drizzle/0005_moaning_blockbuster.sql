CREATE TABLE `session_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`best_frame_id` integer,
	`entry_source` text NOT NULL,
	`card_name` text NOT NULL,
	`set_code` text NOT NULL,
	`passcode` text NOT NULL,
	`rarity` text NOT NULL,
	`edition` text NOT NULL,
	`language` text NOT NULL,
	`condition` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `pricing_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`best_frame_id`) REFERENCES `best_frames`(`id`) ON UPDATE no action ON DELETE set null
);
