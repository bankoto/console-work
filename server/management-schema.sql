BEGIN;
ALTER TABLE console_members ADD COLUMN IF NOT EXISTS manager_id text REFERENCES console_members(user_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS console_members_manager ON console_members(manager_id);

CREATE OR REPLACE FUNCTION console_validate_reporting_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE manager_record console_members%ROWTYPE;
BEGIN
  -- Serialize reporting-line edits so simultaneous changes cannot create cycles.
  PERFORM pg_advisory_xact_lock(4815,207);
  IF NEW.manager_id IS NOT NULL THEN
    IF NEW.manager_id=NEW.user_id THEN
      RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='console_manager_hierarchy',MESSAGE='A team member cannot be their own manager.';
    END IF;
    SELECT * INTO manager_record FROM console_members WHERE user_id=NEW.manager_id;
    IF NOT FOUND OR manager_record.kind<>'employee' THEN
      RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='console_manager_hierarchy',MESSAGE='Choose an employee as the manager.';
    END IF;
    IF NOT manager_record.active AND (TG_OP='INSERT' OR NEW.manager_id IS DISTINCT FROM OLD.manager_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='console_manager_hierarchy',MESSAGE='Choose an active employee as the manager.';
    END IF;
    IF EXISTS(WITH RECURSIVE chain AS (
      SELECT user_id,manager_id FROM console_members WHERE user_id=NEW.manager_id
      UNION SELECT m.user_id,m.manager_id FROM console_members m JOIN chain c ON m.user_id=c.manager_id
    ) SELECT 1 FROM chain WHERE user_id=NEW.user_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='console_manager_hierarchy',MESSAGE='This manager would create a circular reporting line. Choose another employee.';
    END IF;
  END IF;
  IF NEW.kind<>'employee' AND EXISTS(SELECT 1 FROM console_members WHERE manager_id=NEW.user_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='console_manager_hierarchy',MESSAGE='Reassign this person’s team before changing them from an employee to a consultant.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS console_reporting_line ON console_members;
CREATE TRIGGER console_reporting_line BEFORE INSERT OR UPDATE OF manager_id,kind ON console_members FOR EACH ROW EXECUTE FUNCTION console_validate_reporting_line();
COMMIT;
