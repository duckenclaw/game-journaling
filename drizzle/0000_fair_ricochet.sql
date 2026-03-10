CREATE TABLE `designers` (
	`slug` text PRIMARY KEY NOT NULL,
	`overview_text` text,
	`source_file` text NOT NULL,
	`last_synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_developers` (
	`game_slug` text NOT NULL,
	`studio_slug` text NOT NULL,
	PRIMARY KEY(`game_slug`, `studio_slug`)
);
--> statement-breakpoint
CREATE TABLE `game_publishers` (
	`game_slug` text NOT NULL,
	`publisher_slug` text NOT NULL,
	PRIMARY KEY(`game_slug`, `publisher_slug`)
);
--> statement-breakpoint
CREATE TABLE `games` (
	`slug` text PRIMARY KEY NOT NULL,
	`status` text,
	`platform` text,
	`engine` text,
	`release` text,
	`director` text,
	`game_genre` text,
	`game_modes` text,
	`game_genre_tags` text,
	`player_perspective` text,
	`gameplay_text` text,
	`synopsis_text` text,
	`review_text` text,
	`notes_text` text,
	`source_file` text NOT NULL,
	`last_synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `games_status_idx` ON `games` (`status`);--> statement-breakpoint
CREATE INDEX `games_platform_idx` ON `games` (`platform`);--> statement-breakpoint
CREATE INDEX `games_release_idx` ON `games` (`release`);--> statement-breakpoint
CREATE TABLE `publisher_studios` (
	`publisher_slug` text NOT NULL,
	`studio_slug` text NOT NULL,
	PRIMARY KEY(`publisher_slug`, `studio_slug`)
);
--> statement-breakpoint
CREATE TABLE `publishers` (
	`slug` text PRIMARY KEY NOT NULL,
	`overview_text` text,
	`source_file` text NOT NULL,
	`last_synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `related_studios` (
	`studio_slug` text NOT NULL,
	`related_studio_slug` text NOT NULL,
	PRIMARY KEY(`studio_slug`, `related_studio_slug`)
);
--> statement-breakpoint
CREATE TABLE `studios` (
	`slug` text PRIMARY KEY NOT NULL,
	`director` text,
	`overview_text` text,
	`source_file` text NOT NULL,
	`last_synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
