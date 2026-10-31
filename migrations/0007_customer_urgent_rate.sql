ALTER TABLE customers ADD COLUMN urgent_rate REAL NOT NULL DEFAULT 0;
UPDATE customers SET urgent_rate = default_rate;
