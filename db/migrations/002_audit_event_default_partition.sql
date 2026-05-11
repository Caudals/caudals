-- Keep audit writes durable outside pre-created calendar partitions.

CREATE TABLE IF NOT EXISTS audit_event_default
  PARTITION OF audit_event
  DEFAULT;
