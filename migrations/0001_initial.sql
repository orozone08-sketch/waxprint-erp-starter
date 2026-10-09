-- Initial schema preserves the legacy ERP tables. Never edit applied migrations.

PRAGMA foreign_keys = ON;

CREATE TABLE "app_users" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "username" TEXT NOT NULL UNIQUE,
  "display_name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'STAFF',
  "password_hash" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_app_users_username" ON "app_users"("username");

CREATE INDEX "ix_app_users_role" ON "app_users"("role");

CREATE TABLE "customers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "whatsapp" TEXT,
  "gst_number" TEXT,
  "default_rate" REAL NOT NULL DEFAULT 0,
  "credit_days" INTEGER NOT NULL DEFAULT 0,
  "active" INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_customers_code" ON "customers"("code");

CREATE INDEX "ix_customers_name" ON "customers"("name");

CREATE TABLE "suppliers" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "gst_number" TEXT,
  "contact" TEXT
);

CREATE INDEX "ix_suppliers_name" ON "suppliers"("name");

CREATE TABLE "employees" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "department" TEXT NOT NULL DEFAULT 'Production',
  "role" TEXT NOT NULL DEFAULT 'Operator',
  "monthly_salary" REAL NOT NULL DEFAULT 0,
  "active" INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX "ix_employees_name" ON "employees"("name");

CREATE TABLE "machines" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "model" TEXT,
  "serial_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE'
);

CREATE INDEX "ix_machines_code" ON "machines"("code");

CREATE TABLE "inbox_messages" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "source" TEXT NOT NULL,
  "external_message_id" TEXT UNIQUE,
  "sender" TEXT,
  "subject" TEXT,
  "body" TEXT,
  "received_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  "archived" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "customer_id" INTEGER REFERENCES "customers"("id"),
  "job_id" INTEGER REFERENCES "jobs"("id")
);

CREATE INDEX "ix_inbox_messages_source" ON "inbox_messages"("source");

CREATE TABLE "jobs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "number" TEXT NOT NULL UNIQUE,
  "customer_id" INTEGER NOT NULL REFERENCES "customers"("id"),
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'FILES_RECEIVED',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "instructions" TEXT,
  "received_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  "completed_at" TEXT,
  "billable_weight_g" REAL NOT NULL DEFAULT 0,
  "reshoot_weight_g" REAL NOT NULL DEFAULT 0,
  "weight_recorded_at" TEXT
);

CREATE INDEX "ix_jobs_number" ON "jobs"("number");

CREATE INDEX "ix_jobs_customer_id" ON "jobs"("customer_id");

CREATE INDEX "ix_jobs_status" ON "jobs"("status");

CREATE TABLE "job_files" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
  "file_uid" TEXT NOT NULL UNIQUE,
  "original_name" TEXT NOT NULL,
  "original_path" TEXT NOT NULL,
  "processed_path" TEXT,
  "sha256" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "received_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_job_files_job_id" ON "job_files"("job_id");

CREATE INDEX "ix_job_files_file_uid" ON "job_files"("file_uid");

CREATE INDEX "ix_job_files_sha256" ON "job_files"("sha256");

CREATE TABLE "magics_sessions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
  "operator_name" TEXT NOT NULL,
  "workstation" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'STARTED',
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  "completed_at" TEXT,
  "checker_name" TEXT,
  "approved" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX "ix_magics_sessions_job_id" ON "magics_sessions"("job_id");

CREATE TABLE "platforms" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "number" TEXT NOT NULL UNIQUE,
  "software_name" TEXT NOT NULL DEFAULT 'WaxJet',
  "machine_id" INTEGER REFERENCES "machines"("id"),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "is_reshoot_platform" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_platforms_number" ON "platforms"("number");

CREATE TABLE "platform_files" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "platform_id" INTEGER NOT NULL REFERENCES "platforms"("id"),
  "job_file_id" INTEGER NOT NULL REFERENCES "job_files"("id"),
  "quantity" INTEGER NOT NULL DEFAULT 1,
  UNIQUE(platform_id, job_file_id)
);

CREATE INDEX "ix_platform_files_platform_id" ON "platform_files"("platform_id");

CREATE INDEX "ix_platform_files_job_file_id" ON "platform_files"("job_file_id");

CREATE TABLE "print_attempts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "job_file_id" INTEGER NOT NULL REFERENCES "job_files"("id"),
  "platform_id" INTEGER NOT NULL REFERENCES "platforms"("id"),
  "machine_id" INTEGER REFERENCES "machines"("id"),
  "attempt_no" INTEGER NOT NULL DEFAULT 1,
  "is_reshoot" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PRINTING',
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  "completed_at" TEXT,
  "expected_qty" INTEGER NOT NULL DEFAULT 1,
  "good_qty" INTEGER NOT NULL DEFAULT 0,
  "bad_qty" INTEGER NOT NULL DEFAULT 0,
  "qc_reason" TEXT,
  "production_weight_g" REAL NOT NULL DEFAULT 0,
  "estimated_cost" REAL NOT NULL DEFAULT 0
);

CREATE INDEX "ix_print_attempts_job_file_id" ON "print_attempts"("job_file_id");

CREATE INDEX "ix_print_attempts_platform_id" ON "print_attempts"("platform_id");

CREATE TABLE "reshoot_tickets" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "number" TEXT NOT NULL UNIQUE,
  "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
  "job_file_id" INTEGER NOT NULL REFERENCES "job_files"("id"),
  "original_attempt_id" INTEGER REFERENCES "print_attempts"("id"),
  "source" TEXT NOT NULL DEFAULT 'INTERNAL_QC',
  "reason" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "responsibility" TEXT NOT NULL DEFAULT 'OUR_PRODUCTION',
  "chargeable" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  "closed_at" TEXT
);

CREATE INDEX "ix_reshoot_tickets_number" ON "reshoot_tickets"("number");

CREATE INDEX "ix_reshoot_tickets_job_id" ON "reshoot_tickets"("job_id");

CREATE INDEX "ix_reshoot_tickets_job_file_id" ON "reshoot_tickets"("job_file_id");

CREATE TABLE "dispatches" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "number" TEXT NOT NULL UNIQUE,
  "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
  "courier" TEXT,
  "tracking_no" TEXT,
  "packed_by" TEXT,
  "checked_by" TEXT,
  "delivered_by" TEXT,
  "packing_photo_path" TEXT,
  "packing_photo_name" TEXT,
  "dispatched_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  "status" TEXT NOT NULL DEFAULT 'DISPATCHED'
);

CREATE INDEX "ix_dispatches_job_id" ON "dispatches"("job_id");

CREATE TABLE "customer_returns" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "number" TEXT NOT NULL UNIQUE,
  "job_id" INTEGER NOT NULL REFERENCES "jobs"("id"),
  "job_file_id" INTEGER NOT NULL REFERENCES "job_files"("id"),
  "dispatch_id" INTEGER REFERENCES "dispatches"("id"),
  "complaint" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "responsibility" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "chargeable" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_customer_returns_job_id" ON "customer_returns"("job_id");

CREATE INDEX "ix_customer_returns_job_file_id" ON "customer_returns"("job_file_id");

CREATE TABLE "materials" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'kg',
  "minimum_stock" REAL NOT NULL DEFAULT 0
);

CREATE INDEX "ix_materials_name" ON "materials"("name");

CREATE TABLE "purchases" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "supplier_id" INTEGER NOT NULL REFERENCES "suppliers"("id"),
  "material_id" INTEGER NOT NULL REFERENCES "materials"("id"),
  "purchase_date" TEXT NOT NULL DEFAULT (date('now')),
  "quantity" REAL NOT NULL,
  "rate" REAL NOT NULL,
  "tax_amount" REAL NOT NULL DEFAULT 0,
  "paid_amount" REAL NOT NULL DEFAULT 0,
  "invoice_no" TEXT
);

CREATE TABLE "inventory_transactions" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "material_id" INTEGER NOT NULL REFERENCES "materials"("id"),
  "txn_date" TEXT NOT NULL DEFAULT (date('now')),
  "txn_type" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "unit_cost" REAL NOT NULL DEFAULT 0,
  "value" REAL NOT NULL DEFAULT 0,
  "job_id" INTEGER REFERENCES "jobs"("id"),
  "platform_id" INTEGER REFERENCES "platforms"("id"),
  "machine_id" INTEGER REFERENCES "machines"("id"),
  "notes" TEXT
);

CREATE INDEX "ix_inventory_transactions_material_id" ON "inventory_transactions"("material_id");

CREATE TABLE "expenses" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "expense_date" TEXT NOT NULL DEFAULT (date('now')),
  "category" TEXT NOT NULL,
  "subcategory" TEXT,
  "description" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "tax_amount" REAL NOT NULL DEFAULT 0,
  "is_direct_cost" INTEGER NOT NULL DEFAULT 0,
  "related_type" TEXT NOT NULL DEFAULT 'GENERAL',
  "related_id" INTEGER,
  "payment_mode" TEXT NOT NULL DEFAULT 'BANK',
  "approved" INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX "ix_expenses_category" ON "expenses"("category");

CREATE TABLE "payroll" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "employee_id" INTEGER NOT NULL REFERENCES "employees"("id"),
  "period" TEXT NOT NULL,
  "basic" REAL NOT NULL DEFAULT 0,
  "bonus" REAL NOT NULL DEFAULT 0,
  "commission" REAL NOT NULL DEFAULT 0,
  "reimbursement" REAL NOT NULL DEFAULT 0,
  "advance_deduction" REAL NOT NULL DEFAULT 0,
  "other_deduction" REAL NOT NULL DEFAULT 0,
  "net_payable" REAL NOT NULL DEFAULT 0,
  "paid" INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX "ix_payroll_employee_id" ON "payroll"("employee_id");

CREATE INDEX "ix_payroll_period" ON "payroll"("period");

CREATE TABLE "employee_advances" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "employee_id" INTEGER NOT NULL REFERENCES "employees"("id"),
  "job_id" INTEGER REFERENCES "jobs"("id"),
  "advance_date" TEXT NOT NULL DEFAULT (date('now')),
  "amount" REAL NOT NULL DEFAULT 0,
  "purpose" TEXT NOT NULL,
  "period" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_employee_advances_employee_id" ON "employee_advances"("employee_id");

CREATE TABLE "travel_advances" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "employee_id" INTEGER NOT NULL REFERENCES "employees"("id"),
  "job_id" INTEGER REFERENCES "jobs"("id"),
  "trip_date" TEXT NOT NULL DEFAULT (date('now')),
  "destination" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "advance_amount" REAL NOT NULL DEFAULT 0,
  "flight_amount" REAL NOT NULL DEFAULT 0,
  "hotel_amount" REAL NOT NULL DEFAULT 0,
  "taxi_amount" REAL NOT NULL DEFAULT 0,
  "porter_amount" REAL NOT NULL DEFAULT 0,
  "other_amount" REAL NOT NULL DEFAULT 0,
  "settled_amount" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_travel_advances_employee_id" ON "travel_advances"("employee_id");

CREATE TABLE "invoices" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "number" TEXT NOT NULL UNIQUE,
  "customer_id" INTEGER NOT NULL REFERENCES "customers"("id"),
  "invoice_date" TEXT NOT NULL DEFAULT (date('now')),
  "subtotal" REAL NOT NULL DEFAULT 0,
  "tax_amount" REAL NOT NULL DEFAULT 0,
  "total_amount" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT'
);

CREATE INDEX "ix_invoices_number" ON "invoices"("number");

CREATE INDEX "ix_invoices_customer_id" ON "invoices"("customer_id");

CREATE TABLE "invoice_lines" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "invoice_id" INTEGER NOT NULL REFERENCES "invoices"("id"),
  "job_id" INTEGER REFERENCES "jobs"("id"),
  "description" TEXT NOT NULL,
  "weight_g" REAL NOT NULL DEFAULT 0,
  "rate" REAL NOT NULL DEFAULT 0,
  "amount" REAL NOT NULL DEFAULT 0
);

CREATE INDEX "ix_invoice_lines_invoice_id" ON "invoice_lines"("invoice_id");

CREATE TABLE "payments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "invoice_id" INTEGER NOT NULL REFERENCES "invoices"("id"),
  "payment_date" TEXT NOT NULL DEFAULT (date('now')),
  "amount" REAL NOT NULL,
  "payment_mode" TEXT NOT NULL DEFAULT 'BANK',
  "reference" TEXT
);

CREATE INDEX "ix_payments_invoice_id" ON "payments"("invoice_id");

CREATE TABLE "audit_logs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "module" TEXT NOT NULL,
  "record_id" INTEGER,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "user_name" TEXT NOT NULL DEFAULT 'system',
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))
);

CREATE INDEX "ix_audit_logs_module" ON "audit_logs"("module");

CREATE TABLE integration_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL);
