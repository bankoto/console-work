CREATE TABLE IF NOT EXISTS console_report_comments (
  id uuid PRIMARY KEY,
  client_id text NOT NULL REFERENCES console_clients(id) ON DELETE CASCADE,
  author_id text REFERENCES "user"(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_kind text NOT NULL,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
  anchor jsonb NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by text REFERENCES "user"(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS console_report_comments_client_date ON console_report_comments(client_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS console_report_comments_open ON console_report_comments(created_at DESC,id DESC) WHERE NOT resolved;
