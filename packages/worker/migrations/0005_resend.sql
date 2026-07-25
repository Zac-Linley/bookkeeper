-- Migration 0005: Add resend_api_key config
INSERT OR IGNORE INTO system_config (key, value) VALUES ('resend_api_key', '');
