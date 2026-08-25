PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_team_documents` (
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
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_team_documents`("id", "organization_id", "team_id", "title", "category", "file_url", "file_type", "file_size", "description", "scope", "created_by_id", "created_at") SELECT "id", "organization_id", "team_id", "title", "category", "file_url", "file_type", "file_size", "description", "scope", "created_by_id", "created_at" FROM `team_documents`;--> statement-breakpoint
DROP TABLE `team_documents`;--> statement-breakpoint
ALTER TABLE `__new_team_documents` RENAME TO `team_documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_team_docs_org_id` ON `team_documents` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_team_docs_team_id` ON `team_documents` (`team_id`);--> statement-breakpoint
CREATE TABLE `__new_team_faqs` (
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
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_team_faqs`("id", "organization_id", "team_id", "question", "answer", "category", "scope", "created_by_id", "created_at") SELECT "id", "organization_id", "team_id", "question", "answer", "category", "scope", "created_by_id", "created_at" FROM `team_faqs`;--> statement-breakpoint
DROP TABLE `team_faqs`;--> statement-breakpoint
ALTER TABLE `__new_team_faqs` RENAME TO `team_faqs`;--> statement-breakpoint
CREATE INDEX `idx_team_faqs_org_id` ON `team_faqs` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_team_faqs_team_id` ON `team_faqs` (`team_id`);