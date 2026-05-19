ALTER TABLE `matches` ADD `balls` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `strikes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `outs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `runners` text DEFAULT '{"base1":null,"base2":null,"base3":null}';--> statement-breakpoint
ALTER TABLE `matches` ADD `my_hits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `opponent_hits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `my_errors` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `opponent_errors` integer DEFAULT 0 NOT NULL;