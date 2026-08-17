-- =============================================================================
-- Linki — Complete MySQL Schema
-- Generated from lib/db.ts (SQLite initDb + all runMigrations)
-- Run once on a fresh MySQL database before starting the app.
-- MySQL 8.0+ required (for CHECK constraints, JSON functions, etc.)
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -----------------------------------------------------------------------------
-- accounts — LinkedIn integration accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id                        VARCHAR(36)  NOT NULL,
  name                      TEXT         NOT NULL,
  email                     VARCHAR(255) NOT NULL,
  cookies_json              LONGTEXT,
  is_authenticated          TINYINT(1)   NOT NULL DEFAULT 0,
  daily_connection_limit    INT          NOT NULL DEFAULT 20,
  daily_message_limit       INT          NOT NULL DEFAULT 50,
  daily_inmail_limit        INT          NOT NULL DEFAULT 15,
  active_hours_start        INT          NOT NULL DEFAULT 9,
  active_hours_end          INT          NOT NULL DEFAULT 18,
  timezone                  VARCHAR(100) NOT NULL DEFAULT 'UTC',
  working_days              VARCHAR(20)  NOT NULL DEFAULT '1,2,3,4,5',
  inbox_synced_at           DATETIME,
  accepted_sync_at          DATETIME,
  connections_synced_through_ms BIGINT,
  li_connections            INT,
  li_pending                INT,
  li_profile_views          INT,
  li_stats_synced_at        DATETIME,
  ramp_up_enabled           TINYINT(1)   NOT NULL DEFAULT 0,
  ramp_start_date           DATE,
  created_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- companies — CRM company records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id                    VARCHAR(36)  NOT NULL,
  name                  TEXT         NOT NULL,
  domain                VARCHAR(255),
  industry              TEXT,
  location              TEXT,
  linkedin_url          TEXT,
  website               TEXT,
  notes                 TEXT,
  founded_year          INT,
  logo_url              TEXT,
  phone                 VARCHAR(50),
  annual_revenue        VARCHAR(100),
  technology_names      TEXT,
  keywords              TEXT,
  city                  TEXT,
  country               TEXT,
  description           TEXT,
  employee_count        INT,
  parent_company_id     VARCHAR(36),
  email_domain_invalid  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_companies_parent (parent_company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- targets — CRM contact / lead records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS targets (
  id                        VARCHAR(36)  NOT NULL,
  linkedin_url              VARCHAR(500),
  sales_nav_url             TEXT,
  first_name                TEXT,
  last_name                 TEXT,
  full_name                 TEXT,
  title                     TEXT,
  company                   TEXT,
  location                  TEXT,
  profile_image_url         TEXT,
  degree                    INT,
  connection_requested_at   DATETIME,
  connected_at              DATETIME,
  message_sent_at           DATETIME,
  last_replied_at           DATETIME,
  linkedin_member_urn        VARCHAR(255),
  enriched_at               DATETIME,
  headline                  TEXT,
  summary                   TEXT,
  messaging_urn             VARCHAR(255),
  object_urn                VARCHAR(255),
  open_link                 TINYINT(1)   NOT NULL DEFAULT 0,
  company_industry          TEXT,
  company_location          TEXT,
  tenure_months             INT,
  spotlight_badges          TEXT,
  positions_json            LONGTEXT,
  skills_json               LONGTEXT,
  enriched_profile_at       DATETIME,
  email                     VARCHAR(255),
  email_replied_at          DATETIME,
  company_id                VARCHAR(36),
  apollo_id                 VARCHAR(255),
  seniority                 VARCHAR(100),
  apollo_functions          TEXT,
  company_description       TEXT,
  company_size              INT,
  apollo_enriched_at        DATETIME,
  email_status              VARCHAR(100),
  notes                     TEXT,
  city                      TEXT,
  country                   TEXT,
  time_zone                 VARCHAR(100),
  apollo_departments        TEXT,
  reply_kind                VARCHAR(100),
  inmail_sent_at            DATETIME,
  posts_json                LONGTEXT,
  posts_scraped_at          DATETIME,
  score                     INT          NOT NULL DEFAULT 0,
  grade                     VARCHAR(20)  NOT NULL DEFAULT 'cold',
  email_opened_at           DATETIME,
  email_clicked_at          DATETIME,
  unsubscribed_at           DATETIME,
  phone                     VARCHAR(50),
  li_intent                 VARCHAR(50),
  li_intent_at              DATETIME,
  li_intent_action          VARCHAR(255),
  li_last_message_sent      TEXT,
  email_domain_catchall     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_targets_linkedin_url (linkedin_url),
  KEY idx_targets_messaging_urn (messaging_urn),
  KEY idx_targets_company_id (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- lists — contact / prospect lists
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lists (
  id             VARCHAR(36)  NOT NULL,
  name           TEXT         NOT NULL,
  description    TEXT,
  sales_nav_url  TEXT,
  purpose        VARCHAR(20)  CHECK (purpose IN ('linkedin', 'email')),
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- list_targets — many-to-many: lists <-> targets
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS list_targets (
  list_id    VARCHAR(36) NOT NULL,
  target_id  VARCHAR(36) NOT NULL,
  PRIMARY KEY (list_id, target_id),
  CONSTRAINT fk_lt_list   FOREIGN KEY (list_id)   REFERENCES lists(id)   ON DELETE CASCADE,
  CONSTRAINT fk_lt_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- templates — reusable message templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS templates (
  id         VARCHAR(36) NOT NULL,
  name       TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- workflows — outreach campaigns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflows (
  id          VARCHAR(36)  NOT NULL,
  name        TEXT         NOT NULL,
  description TEXT,
  prompt      TEXT,
  is_archived TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- workflow_steps — individual steps within a workflow
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_steps (
  id               VARCHAR(36)  NOT NULL,
  workflow_id      VARCHAR(36),
  step_order       INT          NOT NULL,
  step_type        VARCHAR(30)  NOT NULL CHECK (step_type IN ('visit','connect','message','sales_inmail','delay','email','newsletter')),
  track            VARCHAR(20)  NOT NULL DEFAULT 'linkedin' CHECK (track IN ('linkedin','email')),
  template_id      VARCHAR(36),
  newsletter_id    VARCHAR(36),
  delay_seconds    INT          NOT NULL DEFAULT 0,
  connect_note     TEXT,
  message_body     TEXT,
  email_subject    TEXT,
  email_body       TEXT,
  email_body_html  LONGTEXT,
  email_use_html   TINYINT(1)   NOT NULL DEFAULT 0,
  email_signature  TEXT,
  email_position   INT          NOT NULL DEFAULT 1,
  message_position INT          NOT NULL DEFAULT 1,
  enabled          TINYINT(1)   NOT NULL DEFAULT 1,
  ai_enabled       TINYINT(1)   NOT NULL DEFAULT 0,
  ai_model         VARCHAR(100),
  ai_prompt        TEXT,
  ai_max_words     INT,
  ai_language      VARCHAR(50)  NOT NULL DEFAULT 'English',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_ws_workflow  FOREIGN KEY (workflow_id)   REFERENCES workflows(id)  ON DELETE CASCADE,
  CONSTRAINT fk_ws_template  FOREIGN KEY (template_id)   REFERENCES templates(id),
  CONSTRAINT fk_ws_newsletter FOREIGN KEY (newsletter_id) REFERENCES newsletters(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- workflow_step_templates — many-to-many: steps <-> templates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_step_templates (
  step_id     VARCHAR(36) NOT NULL,
  template_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (step_id, template_id),
  CONSTRAINT fk_wst_step     FOREIGN KEY (step_id)     REFERENCES workflow_steps(id) ON DELETE CASCADE,
  CONSTRAINT fk_wst_template FOREIGN KEY (template_id) REFERENCES templates(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- users — platform auth users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                     VARCHAR(36)  NOT NULL,
  email                  VARCHAR(255) NOT NULL,
  password_hash          TEXT         NOT NULL,
  name                   TEXT,
  role                   VARCHAR(20)  NOT NULL DEFAULT 'user',
  plan                   VARCHAR(20)  NOT NULL DEFAULT 'free',
  org_id                 VARCHAR(36),
  billing_provider       VARCHAR(50),
  billing_customer_id    VARCHAR(255),
  billing_subscription_id VARCHAR(255),
  plan_updated_at        DATETIME,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- organizations — multi-tenant organizations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                      VARCHAR(36)  NOT NULL,
  name                    TEXT         NOT NULL,
  invite_code             VARCHAR(64)  UNIQUE,
  plan                    VARCHAR(20)  NOT NULL DEFAULT 'free' CHECK (plan IN ('free','paid')),
  owner_id                VARCHAR(36)  NOT NULL,
  billing_provider        VARCHAR(50),
  billing_customer_id     VARCHAR(255),
  billing_subscription_id VARCHAR(255),
  plan_updated_at         DATETIME,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_orgs_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- organization_members — org membership / roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_members (
  org_id     VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  role       VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, user_id),
  CONSTRAINT fk_om_org  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_om_user FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add org_id FK on users after organizations table exists
ALTER TABLE users
  ADD CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations(id);

-- -----------------------------------------------------------------------------
-- email_accounts — SMTP/IMAP sending accounts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_accounts (
  id                 VARCHAR(36)  NOT NULL,
  name               TEXT         NOT NULL,
  from_email         VARCHAR(255) NOT NULL,
  from_name          TEXT,
  smtp_host          TEXT         NOT NULL,
  smtp_port          INT          NOT NULL DEFAULT 587,
  smtp_secure        TINYINT(1)   NOT NULL DEFAULT 0,
  imap_host          TEXT,
  imap_port          INT          NOT NULL DEFAULT 993,
  username           TEXT         NOT NULL,
  password           TEXT         NOT NULL,
  imap_username      TEXT,
  imap_password      TEXT,
  daily_email_limit  INT          NOT NULL DEFAULT 50,
  active_hours_start INT          NOT NULL DEFAULT 9,
  active_hours_end   INT          NOT NULL DEFAULT 18,
  timezone           VARCHAR(100) NOT NULL DEFAULT 'UTC',
  working_days       VARCHAR(20)  NOT NULL DEFAULT '1,2,3,4,5',
  is_verified        TINYINT(1)   NOT NULL DEFAULT 0,
  inbox_synced_at    DATETIME,
  signature          TEXT,
  reply_to           VARCHAR(255),
  ramp_up_enabled    TINYINT(1)   NOT NULL DEFAULT 1,
  ramp_start_date    DATE,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- runs — campaign execution runs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
  id               VARCHAR(36) NOT NULL,
  workflow_id      VARCHAR(36),
  list_id          VARCHAR(36),
  account_id       VARCHAR(36),
  email_account_id VARCHAR(36),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','paused','completed','failed')),
  runner_pid       INT,
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at       DATETIME,
  completed_at     DATETIME,
  PRIMARY KEY (id),
  CONSTRAINT fk_runs_workflow      FOREIGN KEY (workflow_id)      REFERENCES workflows(id),
  CONSTRAINT fk_runs_list          FOREIGN KEY (list_id)          REFERENCES lists(id),
  CONSTRAINT fk_runs_account       FOREIGN KEY (account_id)       REFERENCES accounts(id),
  CONSTRAINT fk_runs_email_account FOREIGN KEY (email_account_id) REFERENCES email_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- run_profiles — per-contact state within a run
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS run_profiles (
  id               VARCHAR(36) NOT NULL,
  run_id           VARCHAR(36),
  target_id        VARCHAR(36),
  email_account_id VARCHAR(36),
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_run_profiles (run_id, target_id),
  CONSTRAINT fk_rp_run    FOREIGN KEY (run_id)    REFERENCES runs(id)    ON DELETE CASCADE,
  CONSTRAINT fk_rp_target FOREIGN KEY (target_id) REFERENCES targets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- run_profile_tracks — parallel email+linkedin track state per contact
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS run_profile_tracks (
  id                    VARCHAR(36)  NOT NULL,
  run_profile_id        VARCHAR(36)  NOT NULL,
  track                 VARCHAR(20)  NOT NULL CHECK (track IN ('linkedin','email')),
  state                 VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','in_progress','completed','failed','skipped')),
  current_step          INT          NOT NULL DEFAULT 0,
  last_step_at          DATETIME,
  next_step_at          DATETIME,
  error_message         TEXT,
  last_email_subject    TEXT,
  last_email_body       TEXT,
  last_linkedin_message TEXT,
  pending_reply_context TEXT,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rpt_profile_track (run_profile_id, track),
  CONSTRAINT fk_rpt_run_profile FOREIGN KEY (run_profile_id) REFERENCES run_profiles(id) ON DELETE CASCADE,
  KEY idx_rpt_state_next (state, next_step_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- logs — run event logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs (
  id        VARCHAR(36) NOT NULL,
  run_id    VARCHAR(36),
  target_id VARCHAR(36),
  level     VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message   TEXT        NOT NULL,
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_logs_run    FOREIGN KEY (run_id)    REFERENCES runs(id)    ON DELETE CASCADE,
  CONSTRAINT fk_logs_target FOREIGN KEY (target_id) REFERENCES targets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- integrations — third-party API keys (stored encrypted)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  `key`      VARCHAR(100) NOT NULL,
  api_key    TEXT,
  model      VARCHAR(100),
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- agent_config — singleton AI agent configuration row
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_config (
  id               INT          NOT NULL DEFAULT 1,
  system_prompt    TEXT,
  user_prompt      TEXT,
  email_examples   TEXT,
  linkedin_examples TEXT,
  default_model    VARCHAR(100),
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ensure the singleton row always exists
INSERT IGNORE INTO agent_config (id) VALUES (1);

-- -----------------------------------------------------------------------------
-- agent_sessions — AI token usage log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_sessions (
  id              VARCHAR(36)  NOT NULL,
  run_id          VARCHAR(36),
  target_id       VARCHAR(36),
  step_id         VARCHAR(36),
  model           VARCHAR(100),
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        DOUBLE,
  prompt          TEXT,
  generated_text  TEXT,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- oauth_clients — MCP OAuth 2.1 registered clients
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id    VARCHAR(255) NOT NULL,
  client_name  TEXT,
  redirect_uris TEXT        NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- oauth_auth_codes — single-use OAuth authorization codes (stored as SHA-256)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code_hash       VARCHAR(64) NOT NULL,
  client_id       VARCHAR(255) NOT NULL,
  user_id         VARCHAR(36)  NOT NULL,
  redirect_uri    TEXT         NOT NULL,
  code_challenge  TEXT         NOT NULL,
  scope           TEXT,
  expires_at      DATETIME     NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- oauth_tokens — access & refresh tokens (stored as SHA-256 hashes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id            VARCHAR(36)  NOT NULL,
  access_hash   VARCHAR(64)  NOT NULL,
  refresh_hash  VARCHAR(64),
  client_id     VARCHAR(255) NOT NULL,
  user_id       VARCHAR(36)  NOT NULL,
  scope         TEXT,
  expires_at    DATETIME     NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ot_access_hash  (access_hash),
  UNIQUE KEY uq_ot_refresh_hash (refresh_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- todos — CRM per-contact tasks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS todos (
  id          VARCHAR(36) NOT NULL,
  target_id   VARCHAR(36) NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  due_date    DATE,
  status      VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_todos_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  KEY idx_todos_target (target_id),
  KEY idx_todos_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- activity_logs — CRM per-contact activity history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id         VARCHAR(36) NOT NULL,
  target_id  VARCHAR(36) NOT NULL,
  type       VARCHAR(20) NOT NULL DEFAULT 'note' CHECK (type IN ('call','email','meeting','note','other')),
  body       TEXT        NOT NULL,
  logged_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_al_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  KEY idx_al_target (target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- email_replies — inbound email replies + AI classification
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_replies (
  id                    VARCHAR(36) NOT NULL,
  target_id             VARCHAR(36) NOT NULL,
  run_id                VARCHAR(36),
  from_email            VARCHAR(255) NOT NULL,
  subject               TEXT,
  body_text             TEXT        NOT NULL,
  received_at           DATETIME    NOT NULL,
  classified_at         DATETIME,
  classification_json   TEXT,
  classification_error  TEXT,
  dispatched_at         DATETIME,
  dispatch_result_json  TEXT,
  manually_edited       TINYINT(1)  NOT NULL DEFAULT 0,
  created_at            DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_er_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  CONSTRAINT fk_er_run    FOREIGN KEY (run_id)    REFERENCES runs(id)    ON DELETE SET NULL,
  KEY idx_er_target (target_id),
  KEY idx_er_dispatched (dispatched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- list_imports — background import job tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS list_imports (
  id               VARCHAR(36)  NOT NULL,
  list_id          VARCHAR(36)  NOT NULL,
  account_id       VARCHAR(36),
  status           VARCHAR(20)  NOT NULL DEFAULT 'running',
  phase            VARCHAR(50),
  page             INT          NOT NULL DEFAULT 0,
  total_pages      INT          NOT NULL DEFAULT 0,
  count            INT          NOT NULL DEFAULT 0,
  total            INT          NOT NULL DEFAULT 0,
  imported         INT          NOT NULL DEFAULT 0,
  skipped          INT          NOT NULL DEFAULT 0,
  error            TEXT,
  sales_nav_url    TEXT,
  scheduled_for    DATE,
  start_page       INT          NOT NULL DEFAULT 1,
  cap              INT,
  cancel_requested TINYINT(1)   NOT NULL DEFAULT 0,
  batch_index      INT          NOT NULL DEFAULT 1,
  enrich           TINYINT(1)   NOT NULL DEFAULT 0,
  started_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at      DATETIME,
  PRIMARY KEY (id),
  CONSTRAINT fk_li_list FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  KEY idx_li_scheduled (status, scheduled_for)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- app_settings — simple key/value store for global settings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  `key`      VARCHAR(100) NOT NULL,
  value      TEXT,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- search_filter_cache — Sales Nav typeahead filter cache
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_filter_cache (
  id            VARCHAR(255) NOT NULL,
  filter_type   VARCHAR(100) NOT NULL,
  display_value TEXT         NOT NULL,
  headline      TEXT,
  query         TEXT         NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filter_type, id),
  KEY idx_sfc_type_query   (filter_type(50), query(100)),
  KEY idx_sfc_type_display (filter_type(50), display_value(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- newsletters — newsletter mailing lists
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletters (
  id           VARCHAR(36)  NOT NULL,
  name         TEXT         NOT NULL,
  description  TEXT,
  sender_name  TEXT,
  sender_email VARCHAR(255) NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- newsletter_subscribers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id              VARCHAR(36)  NOT NULL,
  newsletter_id   VARCHAR(36)  NOT NULL,
  email           VARCHAR(255) NOT NULL,
  full_name       TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed','bounced')),
  subscribed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at DATETIME,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ns_newsletter_email (newsletter_id, email),
  CONSTRAINT fk_ns_newsletter FOREIGN KEY (newsletter_id) REFERENCES newsletters(id) ON DELETE CASCADE,
  KEY idx_ns_newsletter (newsletter_id),
  KEY idx_ns_email      (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- newsletter_editions — individual newsletter issues
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_editions (
  id            VARCHAR(36) NOT NULL,
  newsletter_id VARCHAR(36) NOT NULL,
  title         TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  content_html  LONGTEXT    NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent')),
  scheduled_at  DATETIME,
  sent_at       DATETIME,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_ne_newsletter FOREIGN KEY (newsletter_id) REFERENCES newsletters(id) ON DELETE CASCADE,
  KEY idx_ne_newsletter (newsletter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- newsletter_sends — per-subscriber send status
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS newsletter_sends (
  id            VARCHAR(36) NOT NULL,
  edition_id    VARCHAR(36) NOT NULL,
  subscriber_id VARCHAR(36) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at       DATETIME,
  opened_at     DATETIME,
  clicked_at    DATETIME,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_nsends_edition_sub (edition_id, subscriber_id),
  CONSTRAINT fk_nsends_edition    FOREIGN KEY (edition_id)    REFERENCES newsletter_editions(id)    ON DELETE CASCADE,
  CONSTRAINT fk_nsends_subscriber FOREIGN KEY (subscriber_id) REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  KEY idx_nsends_edition (edition_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- linkedin_inbox_messages — inbound LinkedIn messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_inbox_messages (
  id          VARCHAR(36) NOT NULL,
  target_id   VARCHAR(36) NOT NULL,
  sender_urn  VARCHAR(255),
  body        TEXT        NOT NULL,
  received_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_lim_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  KEY idx_lim_target (target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- tracking_events — email open/click tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracking_events (
  id              VARCHAR(36)  NOT NULL,
  tracking_id     VARCHAR(36)  NOT NULL,
  event_type      VARCHAR(10)  NOT NULL CHECK (event_type IN ('open','click')),
  target_id       VARCHAR(36),
  run_id          VARCHAR(36),
  destination_url TEXT,
  opened_at       DATETIME,
  clicked_at      DATETIME,
  open_count      INT          NOT NULL DEFAULT 0,
  click_count     INT          NOT NULL DEFAULT 0,
  user_agent      TEXT,
  ip_hash         VARCHAR(64),
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_te_tracking_id (tracking_id),
  CONSTRAINT fk_te_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE CASCADE,
  CONSTRAINT fk_te_run    FOREIGN KEY (run_id)    REFERENCES runs(id)    ON DELETE SET NULL,
  KEY idx_te_tracking_id (tracking_id),
  KEY idx_te_target_id   (target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- suppressions — email suppression / unsubscribe list
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppressions (
  id         VARCHAR(36)  NOT NULL,
  email      VARCHAR(255) NOT NULL,
  reason     VARCHAR(50)  NOT NULL DEFAULT 'unsubscribed',
  target_id  VARCHAR(36),
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppressions_email (email),
  CONSTRAINT fk_sup_target FOREIGN KEY (target_id) REFERENCES targets(id) ON DELETE SET NULL,
  KEY idx_suppressions_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- projects — CRM projects linked to companies
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          VARCHAR(36) NOT NULL,
  company_id  VARCHAR(36) NOT NULL,
  name        TEXT        NOT NULL,
  description TEXT,
  url         TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_proj_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  KEY idx_projects_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- pipeline_deals — CRM sales pipeline (Kanban)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_deals (
  id          VARCHAR(36)  NOT NULL,
  title       TEXT         NOT NULL,
  target_id   VARCHAR(36),
  company_id  VARCHAR(36),
  value       DOUBLE       NOT NULL DEFAULT 0,
  currency    VARCHAR(10)  NOT NULL DEFAULT 'USD',
  stage       VARCHAR(20)  NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','qualified','proposal','won','lost')),
  notes       TEXT,
  owner_id    VARCHAR(36),
  org_id      VARCHAR(36),
  position    INT          NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_pd_target  FOREIGN KEY (target_id)  REFERENCES targets(id)       ON DELETE SET NULL,
  CONSTRAINT fk_pd_company FOREIGN KEY (company_id) REFERENCES companies(id)     ON DELETE SET NULL,
  CONSTRAINT fk_pd_owner   FOREIGN KEY (owner_id)   REFERENCES users(id)         ON DELETE SET NULL,
  CONSTRAINT fk_pd_org     FOREIGN KEY (org_id)     REFERENCES organizations(id) ON DELETE CASCADE,
  KEY idx_pd_stage (stage),
  KEY idx_pd_org   (org_id),
  KEY idx_pd_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- linkedin_posts — scheduled LinkedIn posts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id                VARCHAR(36)  NOT NULL,
  account_id        VARCHAR(36)  NOT NULL,
  content           TEXT,
  visibility        VARCHAR(20)  NOT NULL DEFAULT 'anyone' CHECK (visibility IN ('anyone','connections')),
  comment_control   VARCHAR(20)  NOT NULL DEFAULT 'anyone',
  brand_partnership TINYINT(1)   NOT NULL DEFAULT 0,
  post_type         VARCHAR(20)  NOT NULL DEFAULT 'text' CHECK (post_type IN ('text','poll','event','hiring','celebrate','document','expert')),
  media_json        TEXT,
  poll_json         TEXT,
  event_json        TEXT,
  document_json     TEXT,
  scheduled_at      DATETIME,
  status            VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','posting','posted','failed','cancelled')),
  linkedin_post_urn VARCHAR(255),
  error_message     TEXT,
  posted_at         DATETIME,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_lp_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  KEY idx_lp_status_scheduled (status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET foreign_key_checks = 1;
