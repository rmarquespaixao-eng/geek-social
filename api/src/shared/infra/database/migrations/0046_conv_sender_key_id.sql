-- Add sender_key_id to conversations for SenderKey rotation on member remove/leave.
-- When a member is removed or leaves, the backend rotates this UUID so remaining
-- members generate a new SKDM with the new distributionId, preventing ex-members
-- from decrypting future messages (forward secrecy at group level).

ALTER TABLE "conversations" ADD COLUMN "sender_key_id" UUID NOT NULL DEFAULT gen_random_uuid();
