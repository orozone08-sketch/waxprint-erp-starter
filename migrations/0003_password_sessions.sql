-- Versioned sessions make password changes revoke every older token immediately.
ALTER TABLE app_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
