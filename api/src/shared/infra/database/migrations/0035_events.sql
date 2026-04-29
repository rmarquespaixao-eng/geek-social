-- Sistema de eventos ("Rolê") — encontros entre usuários da rede
-- Cobre: cadastro, presencial vs online, visibilidade híbrida, capacidade
-- com lista de espera, status do participante, convites materializados.

-- ── Notification types pra ciclo de vida dos rolês ──────────────────
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'event_reminder_48h';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'event_reminder_2h';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'event_cancelled';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'event_updated';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'event_conflict_after_edit';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'event_promoted_from_waitlist';
--> statement-breakpoint
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'event_invited';
--> statement-breakpoint

-- ── Enums novos ──────────────────────────────────────────────────────
CREATE TYPE event_type AS ENUM ('presencial', 'online');
CREATE TYPE event_visibility AS ENUM ('public', 'friends', 'invite');
CREATE TYPE event_status AS ENUM ('scheduled', 'cancelled', 'ended');
CREATE TYPE event_participant_status AS ENUM ('subscribed', 'confirmed', 'waitlist', 'left');

-- ── Tabela principal ────────────────────────────────────────────────
CREATE TABLE events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  VARCHAR(200) NOT NULL,
  description           TEXT,
  cover_url             VARCHAR NOT NULL,
  starts_at             TIMESTAMPTZ NOT NULL,
  duration_minutes      INTEGER NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  type                  event_type NOT NULL,
  visibility            event_visibility NOT NULL DEFAULT 'public',
  capacity              INTEGER,                                -- null = sem limite; service valida >= 1 quando setado
  status                event_status NOT NULL DEFAULT 'scheduled',
  cancellation_reason   TEXT,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX events_visibility_starts_at_idx ON events(visibility, starts_at);
CREATE INDEX events_host_starts_at_idx       ON events(host_user_id, starts_at);
CREATE INDEX events_status_ends_at_idx       ON events(status, ends_at);

-- ── 1:1 condicional — endereço (apenas para type='presencial') ──────
CREATE TABLE event_addresses (
  event_id     UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  cep          VARCHAR(9)   NOT NULL,
  logradouro   VARCHAR(200) NOT NULL,
  numero       VARCHAR(20)  NOT NULL,
  complemento  VARCHAR(100),
  bairro       VARCHAR(100) NOT NULL,
  cidade       VARCHAR(100) NOT NULL,
  estado       VARCHAR(2)   NOT NULL
);

CREATE INDEX event_addresses_cidade_idx ON event_addresses(cidade);

-- ── 1:1 condicional — detalhes online (apenas para type='online') ───
CREATE TABLE event_online_details (
  event_id      UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  meeting_url   VARCHAR(500) NOT NULL,
  extra_details TEXT
);

-- ── Participantes (N:N events <-> users com status) ─────────────────
CREATE TABLE event_participants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status              event_participant_status NOT NULL,
  waitlist_position   INTEGER,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at        TIMESTAMPTZ,
  left_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX event_participants_event_user_uniq ON event_participants(event_id, user_id);
CREATE INDEX event_participants_user_status_idx        ON event_participants(user_id, status);
CREATE INDEX event_participants_event_status_idx       ON event_participants(event_id, status);
CREATE INDEX event_participants_waitlist_idx           ON event_participants(event_id, waitlist_position);

-- ── Convites materializados (para visibility='invite') ──────────────
CREATE TABLE event_invites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX event_invites_event_user_uniq ON event_invites(event_id, invited_user_id);
