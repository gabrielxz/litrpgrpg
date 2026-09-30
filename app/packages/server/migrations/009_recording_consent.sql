-- Consent to test recordings (recordings.ts): a person's own, apart from listening's, since a test
-- recording keeps their audio for the GM to download. Null is no consent; a withdrawal clears it.

alter table memberships add column recording_consent_at timestamptz;
