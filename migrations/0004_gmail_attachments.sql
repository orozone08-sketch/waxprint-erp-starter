ALTER TABLE "inbox_messages" ADD COLUMN "attachments_archived" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "inbox_attachments" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "inbox_message_id" INTEGER NOT NULL REFERENCES "inbox_messages"("id") ON DELETE CASCADE,
  "filename" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
  "size_bytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL UNIQUE,
  "gmail_part_key" TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now')),
  UNIQUE("inbox_message_id", "gmail_part_key")
);

CREATE INDEX "ix_inbox_attachments_message" ON "inbox_attachments"("inbox_message_id");
