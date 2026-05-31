CREATE TABLE `__new_pricing_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`join_code` text NOT NULL,
	`active_capture_client_id` text,
	`active_capture_client_joined_at` integer,
	`archived_at` integer,
	`review_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_pricing_sessions` (
	`id`,
	`name`,
	`join_code`,
	`archived_at`,
	`review_count`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`name`,
	'S' || lower(hex(randomblob(5))),
	`archived_at`,
	`review_count`,
	`created_at`,
	`updated_at`
FROM `pricing_sessions`;
--> statement-breakpoint
DROP TABLE `pricing_sessions`;
--> statement-breakpoint
ALTER TABLE `__new_pricing_sessions` RENAME TO `pricing_sessions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_sessions_join_code_unique` ON `pricing_sessions` (`join_code`);
