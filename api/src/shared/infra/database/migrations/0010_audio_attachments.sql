ALTER TABLE "message_attachments" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD COLUMN "waveform_peaks" jsonb;
