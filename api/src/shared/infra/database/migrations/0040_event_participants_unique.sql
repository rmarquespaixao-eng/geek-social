ALTER TABLE event_participants
  ADD CONSTRAINT event_participants_event_id_user_id_key
  UNIQUE (event_id, user_id);
