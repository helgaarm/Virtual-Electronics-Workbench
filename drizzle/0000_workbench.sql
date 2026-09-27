CREATE TABLE `workbench_schema` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `version` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `workbench_schema` (`id`, `version`) VALUES (1, 1);
--> statement-breakpoint
CREATE TABLE `projects` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `document` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_updated_at_idx` ON `projects` (`updated_at` DESC, `id`);
