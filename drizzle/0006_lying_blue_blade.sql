CREATE TABLE `price_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_item_id` integer NOT NULL,
	`status` text NOT NULL,
	`observed_amount` text,
	`source` text NOT NULL,
	`currency` text,
	`observed_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`) ON UPDATE no action ON DELETE cascade
);
