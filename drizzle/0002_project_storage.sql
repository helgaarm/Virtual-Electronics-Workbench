-- Additive accounting only: existing documents and IDs are never rewritten or removed.
CREATE TABLE project_storage_schema (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO project_storage_schema VALUES (1, 1);
--> statement-breakpoint
CREATE TABLE project_storage_usage (
  scope TEXT PRIMARY KEY NOT NULL,
  project_count INTEGER NOT NULL CHECK (project_count >= 0),
  document_bytes INTEGER NOT NULL CHECK (document_bytes >= 0)
);
--> statement-breakpoint
INSERT INTO project_storage_usage SELECT '', count(*), coalesce(sum(length(CAST(document AS BLOB))), 0) FROM projects;
--> statement-breakpoint
INSERT INTO project_storage_usage SELECT owner_email, count(*), sum(length(CAST(document AS BLOB))) FROM account_projects GROUP BY owner_email;
--> statement-breakpoint
CREATE TRIGGER projects_usage_insert AFTER INSERT ON projects BEGIN
  UPDATE project_storage_usage SET project_count = project_count + 1,
    document_bytes = document_bytes + length(CAST(NEW.document AS BLOB)) WHERE scope = '';
END;
--> statement-breakpoint
CREATE TRIGGER projects_usage_update AFTER UPDATE OF document ON projects BEGIN
  UPDATE project_storage_usage SET document_bytes = document_bytes + length(CAST(NEW.document AS BLOB)) - length(CAST(OLD.document AS BLOB)) WHERE scope = '';
END;
--> statement-breakpoint
CREATE TRIGGER projects_usage_delete AFTER DELETE ON projects BEGIN
  UPDATE project_storage_usage SET project_count = project_count - 1,
    document_bytes = document_bytes - length(CAST(OLD.document AS BLOB)) WHERE scope = '';
END;
--> statement-breakpoint
CREATE TRIGGER account_projects_usage_insert AFTER INSERT ON account_projects BEGIN
  INSERT INTO project_storage_usage VALUES (NEW.owner_email, 1, length(CAST(NEW.document AS BLOB)))
    ON CONFLICT(scope) DO UPDATE SET project_count = project_count + 1, document_bytes = document_bytes + excluded.document_bytes;
END;
--> statement-breakpoint
CREATE TRIGGER account_projects_usage_update AFTER UPDATE OF document ON account_projects BEGIN
  UPDATE project_storage_usage SET document_bytes = document_bytes + length(CAST(NEW.document AS BLOB)) - length(CAST(OLD.document AS BLOB)) WHERE scope = NEW.owner_email;
END;
--> statement-breakpoint
CREATE TRIGGER account_projects_usage_delete AFTER DELETE ON account_projects BEGIN
  UPDATE project_storage_usage SET project_count = project_count - 1,
    document_bytes = document_bytes - length(CAST(OLD.document AS BLOB)) WHERE scope = OLD.owner_email;
END;
