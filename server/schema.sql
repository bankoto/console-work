CREATE TABLE IF NOT EXISTS console_members (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('employee','consultant')),
  specialty text NOT NULL CHECK(specialty IN ('Tax consultant','Accountant','Payroll Expert','Legal Expert')),
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS console_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  industry text NOT NULL DEFAULT '',
  report_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS console_assignments (
  user_id text NOT NULL REFERENCES console_members(user_id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES console_clients(id) ON DELETE CASCADE,
  module_id text NOT NULL CHECK(module_id IN ('accounting','tax','payroll','legal')),
  PRIMARY KEY(user_id, client_id, module_id)
);
CREATE TABLE IF NOT EXISTS console_audit (
  id bigserial PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO console_clients(id,name,industry) VALUES('mtt','MTT Innovations Ltd','Technology & innovation') ON CONFLICT(id) DO NOTHING;
