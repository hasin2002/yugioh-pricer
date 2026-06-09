CREATE TABLE `capture_candidate_frames` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_item_id` integer NOT NULL,
	`position` integer NOT NULL,
	`selected_as_best` integer DEFAULT false NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`card_like` integer,
	`brightness` integer,
	`signature` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ocr_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_item_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`raw_text` text,
	`card_name_text` text,
	`card_name_confidence` integer,
	`set_code_text` text,
	`set_code_confidence` integer,
	`edition_text` text,
	`edition_confidence` integer,
	`serial_number_text` text,
	`serial_number_confidence` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`) ON UPDATE no action ON DELETE cascade
);
