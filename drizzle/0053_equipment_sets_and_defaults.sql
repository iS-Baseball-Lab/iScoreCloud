-- Equipment Sets & Default Vehicle/Custodian Bindings
ALTER TABLE `teams` ADD COLUMN `equipment_sets_json` text;
--> statement-breakpoint
ALTER TABLE `team_equipments` ADD COLUMN `default_car_id` text;
--> statement-breakpoint
ALTER TABLE `team_equipments` ADD COLUMN `default_member_id` text;
