CREATE TABLE `team_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`team_id` text,
	`title` text NOT NULL,
	`category` text DEFAULT 'other' NOT NULL,
	`file_url` text NOT NULL,
	`file_type` text DEFAULT 'PDF',
	`file_size` text,
	`description` text,
	`scope` text DEFAULT 'team' NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_team_docs_org_id` ON `team_documents` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_team_docs_team_id` ON `team_documents` (`team_id`);--> statement-breakpoint
CREATE TABLE `team_faqs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`team_id` text,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`scope` text DEFAULT 'team' NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_team_faqs_org_id` ON `team_faqs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_team_faqs_team_id` ON `team_faqs` (`team_id`);