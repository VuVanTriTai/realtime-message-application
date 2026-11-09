-- V7: Index on message_outbox(message_id) for instant Fast Path markOutboxDone updates
CREATE INDEX IF NOT EXISTS idx_outbox_message_id ON message_outbox (message_id);

