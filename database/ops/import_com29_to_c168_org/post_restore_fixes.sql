-- Post-restore fixes after importing u857194726_count168 (29).sql into c168_org (DBeaver).
-- Run this in SQL Editor AFTER the dump restore completes.
-- Safe to re-run: uses IF NOT EXISTS / INSERT IGNORE / NULL-only updates where possible.

USE `c168_org`;
SET NAMES utf8mb4;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
START TRANSACTION;

-- ---------------------------------------------------------------------------
-- 1) submitted_processes: add scope columns (.com dump lacks them)
--    Ref: database/migrations/20260605_submitted_processes_scope.sql
-- ---------------------------------------------------------------------------
ALTER TABLE `submitted_processes`
  ADD COLUMN IF NOT EXISTS `scope_type` ENUM('company','group') NOT NULL DEFAULT 'company' AFTER `company_id`,
  ADD COLUMN IF NOT EXISTS `scope_id` BIGINT UNSIGNED NULL AFTER `scope_type`,
  ADD KEY `idx_sp_scope_date` (`scope_type`, `scope_id`, `capture_date`);

UPDATE `submitted_processes`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1b) process.status: add 'waiting' for soft-delete (org app expects 3 values)
--     Ref: database/schema/easycount_fresh_install.sql, api/processes/delete_processes_api.php
-- ---------------------------------------------------------------------------
ALTER TABLE `process`
  MODIFY COLUMN `status` ENUM('active','inactive','waiting') NOT NULL DEFAULT 'active'
  COMMENT '状态：active=启用，inactive=停用，waiting=等待中';

ALTER TABLE `process_backup`
  MODIFY COLUMN `status` ENUM('active','inactive','waiting') NOT NULL DEFAULT 'active'
  COMMENT '状态：active=启用, inactive=停用, waiting=等待中';

-- ---------------------------------------------------------------------------
-- 2) domain_list_fee_settings: org price columns
--    Ref: database/migrations/20260607_domain_list_fee_settings.sql
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `domain_list_fee_settings` (`id`, `price`) VALUES (1, NULL);

ALTER TABLE `domain_list_fee_settings`
  MODIFY COLUMN `price` DECIMAL(25,8) NULL DEFAULT NULL
    COMMENT 'Legacy single price (synced from company 6-month)';

ALTER TABLE `domain_list_fee_settings`
  ADD COLUMN IF NOT EXISTS `group_price` DECIMAL(25,8) NULL DEFAULT NULL
    COMMENT 'Default fee for group tenants (6-month fallback)' AFTER `price`,
  ADD COLUMN IF NOT EXISTS `company_price` DECIMAL(25,8) NULL DEFAULT NULL
    COMMENT 'Default fee for company tenants (6-month fallback)' AFTER `group_price`,
  ADD COLUMN IF NOT EXISTS `company_period_prices` LONGTEXT NULL DEFAULT NULL
    COMMENT 'Company per-period prices JSON' AFTER `company_price`,
  ADD COLUMN IF NOT EXISTS `group_period_prices` LONGTEXT NULL DEFAULT NULL
    COMMENT 'Group per-period prices JSON' AFTER `company_period_prices`,
  ADD COLUMN IF NOT EXISTS `period_prices` LONGTEXT NULL DEFAULT NULL
    COMMENT 'Unified JSON {company,group} for legacy readers' AFTER `group_period_prices`;

UPDATE `domain_list_fee_settings`
SET `company_price` = `price`
WHERE `id` = 1
  AND `company_price` IS NULL
  AND `price` IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) Maintenance mode tables + IT allowlist
--    Ref: database/migrations/20260710_maintenance_mode_it_allowlist.sql
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_runtime_flags` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `maintenance_mode_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `maintenance_message_id` INT NULL,
  `updated_by` VARCHAR(50) NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `system_runtime_flags` (
  `id`, `maintenance_mode_enabled`, `maintenance_message_id`, `updated_by`
) VALUES (
  1, 0, NULL, 'system-init'
);

CREATE TABLE IF NOT EXISTS `system_it_allowlist` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `login_id` VARCHAR(50) NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `remark` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_system_it_allowlist_login_id` (`login_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `system_it_allowlist` (`login_id`, `enabled`, `remark`)
VALUES
  ('IT_JK', 1, 'maintenance IT allowlist'),
  ('IT_JS', 1, 'maintenance IT allowlist'),
  ('IT_MS', 1, 'maintenance IT allowlist');

UPDATE `system_it_allowlist` SET `enabled` = 1, `remark` = 'maintenance IT allowlist' WHERE `login_id` = 'IT_JK';
UPDATE `system_it_allowlist` SET `enabled` = 1, `remark` = 'maintenance IT allowlist' WHERE `login_id` = 'IT_JS';
UPDATE `system_it_allowlist` SET `enabled` = 1, `remark` = 'maintenance IT allowlist' WHERE `login_id` = 'IT_MS';

-- ---------------------------------------------------------------------------
-- 4) Seed IT users for maintenance bypass
--    Ref: database/migrations/20260710_seed_it_users_for_maintenance.sql
-- ---------------------------------------------------------------------------
SET @hash_it_jk = '$argon2id$v=19$m=65536,t=4,p=1$Vk0yZXAzUXpwYzJ0THhzcw$N1RvElxOmvMFvG3KONiSkPYvRX0I58kM4Yb2I8wrC0g';
SET @hash_it_js = '$argon2id$v=19$m=65536,t=4,p=1$NHp0QXlzWEhSNGtFN1pyZQ$nQxBA3RjQ72f7Ng+s0IpNu4RT9nJhNEe2oen/foKnyg';
SET @hash_it_ms = '$argon2id$v=19$m=65536,t=4,p=1$Z09RODVKdkd4cVBWN09vdA$B6R/5qdqkClG/3isPzdJ8p6XCo4UETM/PLaap+qbUzw';

INSERT INTO `user` (
  `login_id`, `name`, `password`, `email`, `role`, `permissions`,
  `status`, `created_by`, `created_at`, `read_only`
)
SELECT 'IT_JK', 'IT_JK', @hash_it_jk, 'it_jk@count168.local', 'admin', NULL, 'active', 'system-maintenance', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM `user` WHERE UPPER(TRIM(`login_id`)) = 'IT_JK' LIMIT 1);

INSERT INTO `user` (
  `login_id`, `name`, `password`, `email`, `role`, `permissions`,
  `status`, `created_by`, `created_at`, `read_only`
)
SELECT 'IT_JS', 'IT_JS', @hash_it_js, 'it_js@count168.local', 'admin', NULL, 'active', 'system-maintenance', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM `user` WHERE UPPER(TRIM(`login_id`)) = 'IT_JS' LIMIT 1);

INSERT INTO `user` (
  `login_id`, `name`, `password`, `email`, `role`, `permissions`,
  `status`, `created_by`, `created_at`, `read_only`
)
SELECT 'IT_MS', 'IT_MS', @hash_it_ms, 'it_ms@count168.local', 'admin', NULL, 'active', 'system-maintenance', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM `user` WHERE UPPER(TRIM(`login_id`)) = 'IT_MS' LIMIT 1);

UPDATE `user`
SET `password` = @hash_it_jk, `status` = 'active', `role` = 'admin', `read_only` = 0,
    `remember_token` = NULL, `remember_token_expires` = NULL
WHERE UPPER(TRIM(`login_id`)) = 'IT_JK';

UPDATE `user`
SET `password` = @hash_it_js, `status` = 'active', `role` = 'admin', `read_only` = 0,
    `remember_token` = NULL, `remember_token_expires` = NULL
WHERE UPPER(TRIM(`login_id`)) = 'IT_JS';

UPDATE `user`
SET `password` = @hash_it_ms, `status` = 'active', `role` = 'admin', `read_only` = 0,
    `remember_token` = NULL, `remember_token_expires` = NULL
WHERE UPPER(TRIM(`login_id`)) = 'IT_MS';

INSERT IGNORE INTO `user_company_map` (`user_id`, `company_id`)
SELECT u.id, c.id
FROM `user` u
JOIN `company` c ON 1 = 1
WHERE UPPER(TRIM(u.`login_id`)) IN ('IT_JK', 'IT_JS', 'IT_MS');

INSERT IGNORE INTO `user_company_permissions` (
  `user_id`, `company_id`, `account_permissions`, `process_permissions`, `created_at`, `updated_at`
)
SELECT u.id, c.id, NULL, NULL, NOW(), NOW()
FROM `user` u
JOIN `company` c ON 1 = 1
WHERE UPPER(TRIM(u.`login_id`)) IN ('IT_JK', 'IT_JS', 'IT_MS');

-- ---------------------------------------------------------------------------
-- 5) scope_id backfill (Formula Maintenance / Data Capture visibility)
--    Ref: database/ops/SCOPE_ID_BACKFILL_DATA_CAPTURE_TEMPLATES.md
-- ---------------------------------------------------------------------------
UPDATE `data_capture_templates`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `data_captures`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `data_capture_details`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `account_company`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `currency`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `description`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `transactions`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `transaction_entry`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

UPDATE `user_company_map`
SET `scope_type` = 'company', `scope_id` = `company_id`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

COMMIT;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;

-- ---------------------------------------------------------------------------
-- 6) Verification (read-only)
-- ---------------------------------------------------------------------------
SELECT 'account' AS tbl, COUNT(*) AS rows_cnt FROM `account`
UNION ALL SELECT 'user', COUNT(*) FROM `user`
UNION ALL SELECT 'data_capture_templates', COUNT(*) FROM `data_capture_templates`
UNION ALL SELECT 'submitted_processes', COUNT(*) FROM `submitted_processes`;

SELECT 'data_capture_templates' AS tbl, COUNT(*) AS null_scope_cnt
FROM `data_capture_templates` WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL
UNION ALL
SELECT 'data_captures', COUNT(*) FROM `data_captures` WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL
UNION ALL
SELECT 'submitted_processes', COUNT(*) FROM `submitted_processes` WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL;

-- Optional (may show duplicate-column / duplicate-key errors if already applied):
--   database/migrations/20260611_auto_renew_group_support.sql
