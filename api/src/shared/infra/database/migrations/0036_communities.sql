-- Comunidades ("Orkut") — espaços temáticos de interesse dos gamers
-- Cobre: CRUD de comunidade, membros, tópicos (via posts), moderação, polls,
-- convites, audit-log, notificações e report targets novos.

-- ── Notification types para ciclo de vida das comunidades ───────────────
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_join_requested';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_join_approved';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_join_rejected';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_invited';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_promoted_to_mod';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_demoted';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_banned';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_unbanned';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_new_topic';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_transfer_requested';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_transfer_accepted';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'community_transfer_rejected';
--> statement-breakpoint

-- ── Report target types novos ────────────────────────────────────────────
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'community_topic';
--> statement-breakpoint
ALTER TYPE "report_target_type" ADD VALUE IF NOT EXISTS 'community_comment';
--> statement-breakpoint

-- ── Enums de comunidade ──────────────────────────────────────────────────
CREATE TYPE "community_visibility" AS ENUM ('public', 'private', 'restricted');
--> statement-breakpoint
CREATE TYPE "community_member_role" AS ENUM ('owner', 'moderator', 'member');
--> statement-breakpoint
CREATE TYPE "community_member_status" AS ENUM ('pending', 'active', 'banned');
--> statement-breakpoint
CREATE TYPE "community_category" AS ENUM (
  'boardgames', 'tcg', 'rpg-mesa', 'rpg-digital', 'mmo',
  'souls', 'fps', 'survival', 'indie', 'retro',
  'mobile', 'simulation', 'strategy', 'mods', 'community-events'
);
--> statement-breakpoint
CREATE TYPE "community_join_request_status" AS ENUM ('pending', 'approved', 'rejected');
--> statement-breakpoint
CREATE TYPE "community_invite_status" AS ENUM ('pending', 'accepted', 'rejected', 'expired');
--> statement-breakpoint
CREATE TYPE "community_transfer_status" AS ENUM ('pending', 'accepted', 'rejected', 'cancelled');
--> statement-breakpoint
CREATE TYPE "community_poll_mode" AS ENUM ('single', 'multiple');
--> statement-breakpoint
CREATE TYPE "community_audit_action" AS ENUM (
  'community_create', 'community_update', 'community_delete',
  'member_promote', 'member_demote', 'member_ban', 'member_unban',
  'member_join_approved', 'member_join_rejected',
  'topic_pin', 'topic_unpin', 'topic_lock', 'topic_unlock',
  'topic_move', 'topic_delete', 'comment_delete',
  'transfer_initiated', 'transfer_accepted', 'transfer_rejected', 'transfer_cancelled'
);
--> statement-breakpoint

-- ── Tabela principal de comunidades ─────────────────────────────────────
CREATE TABLE "communities" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  slug             VARCHAR(120) UNIQUE NOT NULL,
  name             VARCHAR(80) NOT NULL,
  description      TEXT NOT NULL,
  category         community_category NOT NULL,
  icon_url         VARCHAR NOT NULL,
  cover_url        VARCHAR NOT NULL,
  visibility       community_visibility NOT NULL DEFAULT 'public',
  rules            TEXT,
  welcome_message  TEXT,
  member_count     INTEGER NOT NULL DEFAULT 0,
  topic_count      INTEGER NOT NULL DEFAULT 0,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "communities_category_visibility_idx" ON "communities"(category, visibility);
--> statement-breakpoint
CREATE INDEX "communities_owner_idx" ON "communities"(owner_id);
--> statement-breakpoint
CREATE INDEX "communities_deleted_at_idx" ON "communities"(deleted_at);
--> statement-breakpoint

-- ── Membros ──────────────────────────────────────────────────────────────
CREATE TABLE "community_members" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          community_member_role NOT NULL DEFAULT 'member',
  status        community_member_status NOT NULL DEFAULT 'active',
  ban_reason    TEXT,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at   TIMESTAMPTZ
);
--> statement-breakpoint

CREATE UNIQUE INDEX "community_members_community_user_uniq" ON "community_members"(community_id, user_id);
--> statement-breakpoint
CREATE INDEX "community_members_community_status_idx" ON "community_members"(community_id, status);
--> statement-breakpoint
CREATE INDEX "community_members_user_status_idx" ON "community_members"(user_id, status);
--> statement-breakpoint

-- ── Pedidos de entrada ───────────────────────────────────────────────────
CREATE TABLE "community_join_requests" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        community_join_request_status NOT NULL DEFAULT 'pending',
  decided_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "community_join_requests_pending_uniq"
  ON "community_join_requests"(community_id, user_id)
  WHERE status = 'pending';
--> statement-breakpoint

-- ── Meta de tópicos (postId é PK e FK para posts) ────────────────────────
CREATE TABLE "community_topic_meta" (
  post_id                  UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  community_id             UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  pinned                   BOOLEAN NOT NULL DEFAULT false,
  locked                   BOOLEAN NOT NULL DEFAULT false,
  pinned_at                TIMESTAMPTZ,
  locked_at                TIMESTAMPTZ,
  moved_from_community_id  UUID REFERENCES communities(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "community_topic_meta_community_pinned_created_at_idx"
  ON "community_topic_meta"(community_id, pinned, created_at);
--> statement-breakpoint

-- ── Transferências de propriedade ────────────────────────────────────────
CREATE TABLE "community_transfers" (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        community_transfer_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ
);
--> statement-breakpoint

CREATE UNIQUE INDEX "community_transfers_pending_uniq"
  ON "community_transfers"(community_id)
  WHERE status = 'pending';
--> statement-breakpoint

-- ── Audit log ────────────────────────────────────────────────────────────
CREATE TABLE "community_audit_log" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id     UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action           community_audit_action NOT NULL,
  target_user_id   UUID,
  target_topic_id  UUID,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX "community_audit_log_community_created_at_idx"
  ON "community_audit_log"(community_id, created_at);
--> statement-breakpoint

-- ── Convites (P3) ────────────────────────────────────────────────────────
CREATE TABLE "community_invites" (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id     UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  invited_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           community_invite_status NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ
);
--> statement-breakpoint

CREATE UNIQUE INDEX "community_invites_pending_uniq"
  ON "community_invites"(community_id, invited_user_id)
  WHERE status = 'pending';
--> statement-breakpoint

-- ── Enquetes (P3) ────────────────────────────────────────────────────────
CREATE TABLE "community_polls" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
  question    VARCHAR(200) NOT NULL,
  mode        community_poll_mode NOT NULL,
  closes_at   TIMESTAMPTZ,
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "community_poll_options" (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id        UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  text           VARCHAR(100) NOT NULL,
  display_order  INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE "community_poll_votes" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES community_poll_options(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "community_poll_votes_poll_user_option_uniq"
  ON "community_poll_votes"(poll_id, user_id, option_id);
--> statement-breakpoint

-- ── Preferências de notificação (P3) ─────────────────────────────────────
CREATE TABLE "community_notification_prefs" (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  muted         BOOLEAN NOT NULL DEFAULT false
);
--> statement-breakpoint

CREATE UNIQUE INDEX "community_notification_prefs_pk"
  ON "community_notification_prefs"(user_id, community_id);
--> statement-breakpoint

-- ── Badges (P4 — catálogo fora de escopo nesta entrega; tabelas criadas vazias) ─
CREATE TABLE "community_badges" (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  key          VARCHAR(100) NOT NULL,
  name         VARCHAR(100) NOT NULL,
  description  TEXT NOT NULL,
  icon_url     VARCHAR NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE "community_badge_grants" (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id    UUID NOT NULL REFERENCES community_badges(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX "community_badge_grants_badge_user_uniq"
  ON "community_badge_grants"(badge_id, user_id);
--> statement-breakpoint

-- ── Extensão da tabela posts (T010) ──────────────────────────────────────
-- community_id: referência opcional à comunidade dona do tópico
-- deleted_at: soft-delete de tópicos (usado APENAS quando community_id IS NOT NULL)
ALTER TABLE "posts"
  ADD COLUMN "community_id" UUID REFERENCES communities(id) ON DELETE CASCADE,
  ADD COLUMN "deleted_at" TIMESTAMPTZ;
--> statement-breakpoint

CREATE INDEX "posts_community_created_at_idx"
  ON "posts"(community_id, created_at DESC)
  WHERE community_id IS NOT NULL;
