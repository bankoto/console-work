BEGIN;
ALTER TABLE console_assignments DROP CONSTRAINT IF EXISTS console_assignments_module_id_check;
ALTER TABLE console_assignments ADD CONSTRAINT console_assignments_module_id_check CHECK(module_id IN ('accounting','tax','payroll','legal','formation'));

CREATE TABLE IF NOT EXISTS console_formation_cases (
  id uuid PRIMARY KEY,
  client_id text NOT NULL UNIQUE REFERENCES console_clients(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  status text NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','collecting_documents','name_reservation','preparing_application','submitted','action_required','approved','completed')),
  registration_number text NOT NULL DEFAULT '',
  due_date date,
  latest_note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by text REFERENCES "user"(id) ON DELETE SET NULL,
  updated_by text REFERENCES "user"(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS console_formation_folders (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES console_formation_cases(id) ON DELETE CASCADE,
  name text NOT NULL,
  area text NOT NULL CHECK(area IN ('working','output')),
  system_folder boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id,area,name),
  UNIQUE(id,case_id)
);
CREATE TABLE IF NOT EXISTS console_formation_files (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES console_formation_cases(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL,
  filename text NOT NULL,
  category text NOT NULL,
  content_type text NOT NULL,
  size integer NOT NULL CHECK(size BETWEEN 1 AND 20971520),
  blob_path text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready')),
  uploaded_by text REFERENCES "user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  FOREIGN KEY(folder_id,case_id) REFERENCES console_formation_folders(id,case_id)
);
CREATE INDEX IF NOT EXISTS formation_files_case_state ON console_formation_files(case_id,state);
CREATE TABLE IF NOT EXISTS console_formation_events (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES console_formation_cases(id) ON DELETE CASCADE,
  actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
  message text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS formation_events_case_time ON console_formation_events(case_id,created_at DESC);
COMMIT;
