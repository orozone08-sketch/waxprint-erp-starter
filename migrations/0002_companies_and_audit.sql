-- The original D1 database remains the Aditya International company database.
-- Authentication and the company directory stay in this database so one central
-- administrator can manage users and review audit activity across both tenants.
CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

INSERT INTO companies (id, slug, name) VALUES
  (1, 'aditya', 'Aditya International'),
  (2, 'sunmoon', 'Sunmoon Technology');

ALTER TABLE app_users ADD COLUMN company_id INTEGER REFERENCES companies(id);
UPDATE app_users SET role='SUPER_ADMIN', company_id=NULL WHERE role='ADMIN';
UPDATE app_users SET company_id=1 WHERE company_id IS NULL AND role<>'SUPER_ADMIN';
CREATE INDEX ix_app_users_company ON app_users(company_id);

ALTER TABLE audit_logs ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id);
ALTER TABLE audit_logs ADD COLUMN actor_user_id INTEGER REFERENCES app_users(id);
CREATE INDEX ix_audit_logs_company_created ON audit_logs(company_id, created_at DESC, id DESC);
