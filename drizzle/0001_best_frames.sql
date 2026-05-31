CREATE TABLE `best_frames` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`storage_path` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
