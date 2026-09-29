-- Listening consent belongs to a person in a campaign (The System AI, "The Companion App": recording
-- the table requires every player's explicit consent). Null is no consent; a withdrawal clears it.

alter table memberships add column listening_consent_at timestamptz;
