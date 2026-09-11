-- Bidirectional preserve merge script
-- Strategy: keep target as priority, insert source rows with INSERT IGNORE.
-- For same PK:
--   - same row data => naturally skipped
--   - different row data => skipped (target keeps existing row)
--
-- Source DB: `u857194726_count168`
-- Target DB: `c168_org`

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO';
SET AUTOCOMMIT=0;
START TRANSACTION;
SAVEPOINT merge_begin;

USE `c168_org`;

CREATE TABLE IF NOT EXISTS `merge_conflict_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `table_name` VARCHAR(128) NOT NULL,
  `pk_json` JSON NOT NULL,
  `logged_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table `account`
SAVEPOINT before_account
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account` s
JOIN `c168_org`.`account` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id` <=> s.`account_id` AND t.`name` <=> s.`name` AND t.`status` <=> s.`status` AND t.`created_source` <=> s.`created_source` AND t.`last_login` <=> s.`last_login` AND t.`role` <=> s.`role` AND t.`password` <=> s.`password` AND t.`payment_alert` <=> s.`payment_alert` AND t.`alert_day` <=> s.`alert_day` AND t.`alert_specific_date` <=> s.`alert_specific_date` AND t.`alert_amount` <=> s.`alert_amount` AND t.`remark` <=> s.`remark`);

INSERT IGNORE INTO `c168_org`.`account` (`id`, `account_id`, `name`, `status`, `created_source`, `last_login`, `role`, `password`, `payment_alert`, `alert_day`, `alert_specific_date`, `alert_amount`, `remark`)
SELECT s.`id`, s.`account_id`, s.`name`, s.`status`, s.`created_source`, s.`last_login`, s.`role`, s.`password`, s.`payment_alert`, s.`alert_day`, s.`alert_specific_date`, s.`alert_amount`, s.`remark`
FROM `u857194726_count168`.`account` s;

-- Table `account_backup`
SAVEPOINT before_account_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account_backup` s
JOIN `c168_org`.`account_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id` <=> s.`account_id` AND t.`name` <=> s.`name` AND t.`status` <=> s.`status` AND t.`created_source` <=> s.`created_source` AND t.`last_login` <=> s.`last_login` AND t.`role` <=> s.`role` AND t.`password` <=> s.`password` AND t.`payment_alert` <=> s.`payment_alert` AND t.`alert_day` <=> s.`alert_day` AND t.`alert_specific_date` <=> s.`alert_specific_date` AND t.`alert_amount` <=> s.`alert_amount` AND t.`remark` <=> s.`remark`);

INSERT IGNORE INTO `c168_org`.`account_backup` (`id`, `account_id`, `name`, `status`, `created_source`, `last_login`, `role`, `password`, `payment_alert`, `alert_day`, `alert_specific_date`, `alert_amount`, `remark`)
SELECT s.`id`, s.`account_id`, s.`name`, s.`status`, s.`created_source`, s.`last_login`, s.`role`, s.`password`, s.`payment_alert`, s.`alert_day`, s.`alert_specific_date`, s.`alert_amount`, s.`remark`
FROM `u857194726_count168`.`account_backup` s;

-- Table `account_company`
SAVEPOINT before_account_company
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account_company' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account_company` s
JOIN `c168_org`.`account_company` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id` <=> s.`account_id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`account_company` (`id`, `account_id`, `company_id`, `scope_type`, `scope_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_company` s;

-- Table `account_company_backup`
SAVEPOINT before_account_company_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account_company_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account_company_backup` s
JOIN `c168_org`.`account_company_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id` <=> s.`account_id` AND t.`account_name` <=> s.`account_name` AND t.`company_id` <=> s.`company_id` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`account_company_backup` (`id`, `account_id`, `account_name`, `company_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`account_name`, s.`company_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_company_backup` s;

-- Table `account_currency`
SAVEPOINT before_account_currency
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account_currency' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account_currency` s
JOIN `c168_org`.`account_currency` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id` <=> s.`account_id` AND t.`currency_id` <=> s.`currency_id` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`account_currency` (`id`, `account_id`, `currency_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`currency_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_currency` s;

-- Table `account_currency_backup`
SAVEPOINT before_account_currency_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account_currency_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account_currency_backup` s
JOIN `c168_org`.`account_currency_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id` <=> s.`account_id` AND t.`account_name` <=> s.`account_name` AND t.`currency_id` <=> s.`currency_id` AND t.`currency_name` <=> s.`currency_name` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`account_currency_backup` (`id`, `account_id`, `account_name`, `currency_id`, `currency_name`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`account_name`, s.`currency_id`, s.`currency_name`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_currency_backup` s;

-- Table `account_currency_display_order`
SAVEPOINT before_account_currency_display_order
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account_currency_display_order' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account_currency_display_order` s
JOIN `c168_org`.`account_currency_display_order` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id` <=> s.`account_id` AND t.`currency_order` <=> s.`currency_order` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`account_currency_display_order` (`id`, `account_id`, `currency_order`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`currency_order`, s.`updated_at`
FROM `u857194726_count168`.`account_currency_display_order` s;

-- Table `account_link`
SAVEPOINT before_account_link
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'account_link' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`account_link` s
JOIN `c168_org`.`account_link` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`account_id_1` <=> s.`account_id_1` AND t.`account_id_2` <=> s.`account_id_2` AND t.`company_id` <=> s.`company_id` AND t.`link_type` <=> s.`link_type` AND t.`source_account_id` <=> s.`source_account_id` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`account_link` (`id`, `account_id_1`, `account_id_2`, `company_id`, `link_type`, `source_account_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id_1`, s.`account_id_2`, s.`company_id`, s.`link_type`, s.`source_account_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_link` s;

-- Table `announcements`
SAVEPOINT before_announcements
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'announcements' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`announcements` s
JOIN `c168_org`.`announcements` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`title` <=> s.`title` AND t.`content` <=> s.`content` AND t.`company_code` <=> s.`company_code` AND t.`status` <=> s.`status` AND t.`created_by` <=> s.`created_by` AND t.`user_type` <=> s.`user_type` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`announcements` (`id`, `title`, `content`, `company_code`, `status`, `created_by`, `user_type`, `created_at`, `updated_at`)
SELECT s.`id`, s.`title`, s.`content`, s.`company_code`, s.`status`, s.`created_by`, s.`user_type`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`announcements` s;

-- Table `auto_login_credentials`
SAVEPOINT before_auto_login_credentials
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'auto_login_credentials' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`auto_login_credentials` s
JOIN `c168_org`.`auto_login_credentials` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`name` <=> s.`name` AND t.`website_url` <=> s.`website_url` AND t.`username` <=> s.`username` AND t.`encrypted_password` <=> s.`encrypted_password` AND t.`encryption_key` <=> s.`encryption_key` AND t.`has_2fa` <=> s.`has_2fa` AND t.`encrypted_2fa_code` <=> s.`encrypted_2fa_code` AND t.`two_fa_type` <=> s.`two_fa_type` AND t.`two_fa_instructions` <=> s.`two_fa_instructions` AND t.`auto_import_enabled` <=> s.`auto_import_enabled` AND t.`report_page_url` <=> s.`report_page_url` AND t.`import_process_id` <=> s.`import_process_id` AND t.`import_capture_date` <=> s.`import_capture_date` AND t.`import_currency_id` <=> s.`import_currency_id` AND t.`import_field_mapping` <=> s.`import_field_mapping` AND t.`status` <=> s.`status` AND t.`remark` <=> s.`remark` AND t.`last_executed` <=> s.`last_executed` AND t.`last_result` <=> s.`last_result` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at` AND t.`created_by` <=> s.`created_by`);

INSERT IGNORE INTO `c168_org`.`auto_login_credentials` (`id`, `company_id`, `name`, `website_url`, `username`, `encrypted_password`, `encryption_key`, `has_2fa`, `encrypted_2fa_code`, `two_fa_type`, `two_fa_instructions`, `auto_import_enabled`, `report_page_url`, `import_process_id`, `import_capture_date`, `import_currency_id`, `import_field_mapping`, `status`, `remark`, `last_executed`, `last_result`, `created_at`, `updated_at`, `created_by`)
SELECT s.`id`, s.`company_id`, s.`name`, s.`website_url`, s.`username`, s.`encrypted_password`, s.`encryption_key`, s.`has_2fa`, s.`encrypted_2fa_code`, s.`two_fa_type`, s.`two_fa_instructions`, s.`auto_import_enabled`, s.`report_page_url`, s.`import_process_id`, s.`import_capture_date`, s.`import_currency_id`, s.`import_field_mapping`, s.`status`, s.`remark`, s.`last_executed`, s.`last_result`, s.`created_at`, s.`updated_at`, s.`created_by`
FROM `u857194726_count168`.`auto_login_credentials` s;

-- Table `bank_process`
SAVEPOINT before_bank_process
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'bank_process' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`bank_process` s
JOIN `c168_org`.`bank_process` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`bank` <=> s.`bank` AND t.`type` <=> s.`type` AND t.`name` <=> s.`name` AND t.`card_merchant_id` <=> s.`card_merchant_id` AND t.`customer_id` <=> s.`customer_id` AND t.`profit_account_id` <=> s.`profit_account_id` AND t.`contract` <=> s.`contract` AND t.`insurance` <=> s.`insurance` AND t.`sop` <=> s.`sop` AND t.`remark` <=> s.`remark` AND t.`cost` <=> s.`cost` AND t.`price` <=> s.`price` AND t.`profit` <=> s.`profit` AND t.`profit_sharing` <=> s.`profit_sharing` AND t.`day_start` <=> s.`day_start` AND t.`day_start_frequency` <=> s.`day_start_frequency` AND t.`day_end` <=> s.`day_end` AND t.`day_end_monthly_cap_enabled` <=> s.`day_end_monthly_cap_enabled` AND t.`status` <=> s.`status` AND t.`issue_flag` <=> s.`issue_flag` AND t.`dts_modified` <=> s.`dts_modified` AND t.`modified_by` <=> s.`modified_by` AND t.`modified_by_type` <=> s.`modified_by_type` AND t.`modified_by_owner_id` <=> s.`modified_by_owner_id` AND t.`dts_created` <=> s.`dts_created` AND t.`created_by` <=> s.`created_by` AND t.`created_by_type` <=> s.`created_by_type` AND t.`created_by_owner_id` <=> s.`created_by_owner_id` AND t.`accounting_resend_relax_created_floor` <=> s.`accounting_resend_relax_created_floor` AND t.`accounting_resend_schedule_day_start` <=> s.`accounting_resend_schedule_day_start` AND t.`accounting_resend_schedule_day_end` <=> s.`accounting_resend_schedule_day_end` AND t.`accounting_resend_schedule_frequency` <=> s.`accounting_resend_schedule_frequency`);

INSERT IGNORE INTO `c168_org`.`bank_process` (`id`, `company_id`, `country`, `bank`, `type`, `name`, `card_merchant_id`, `customer_id`, `profit_account_id`, `contract`, `insurance`, `sop`, `remark`, `cost`, `price`, `profit`, `profit_sharing`, `day_start`, `day_start_frequency`, `day_end`, `day_end_monthly_cap_enabled`, `status`, `issue_flag`, `dts_modified`, `modified_by`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_type`, `created_by_owner_id`, `accounting_resend_relax_created_floor`, `accounting_resend_schedule_day_start`, `accounting_resend_schedule_day_end`, `accounting_resend_schedule_frequency`)
SELECT s.`id`, s.`company_id`, s.`country`, s.`bank`, s.`type`, s.`name`, s.`card_merchant_id`, s.`customer_id`, s.`profit_account_id`, s.`contract`, s.`insurance`, s.`sop`, s.`remark`, s.`cost`, s.`price`, s.`profit`, s.`profit_sharing`, s.`day_start`, s.`day_start_frequency`, s.`day_end`, s.`day_end_monthly_cap_enabled`, s.`status`, s.`issue_flag`, s.`dts_modified`, s.`modified_by`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_type`, s.`created_by_owner_id`, s.`accounting_resend_relax_created_floor`, s.`accounting_resend_schedule_day_start`, s.`accounting_resend_schedule_day_end`, s.`accounting_resend_schedule_frequency`
FROM `u857194726_count168`.`bank_process` s;

-- Table `bank_process_accounting_resend_daily_guard`
SAVEPOINT before_bank_process_accounting_resend_daily_guard
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'bank_process_accounting_resend_daily_guard' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard` s
JOIN `c168_org`.`bank_process_accounting_resend_daily_guard` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`bank_process_id` <=> s.`bank_process_id` AND t.`resend_day_start` <=> s.`resend_day_start` AND t.`guard_date` <=> s.`guard_date` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`bank_process_accounting_resend_daily_guard` (`id`, `company_id`, `bank_process_id`, `resend_day_start`, `guard_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`bank_process_id`, s.`resend_day_start`, s.`guard_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard` s;

-- Table `bank_process_accounting_resend_daily_guard_backup`
SAVEPOINT before_bank_process_accounting_resend_daily_guard_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'bank_process_accounting_resend_daily_guard_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard_backup` s
JOIN `c168_org`.`bank_process_accounting_resend_daily_guard_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`bank_process_id` <=> s.`bank_process_id` AND t.`bank_process_name` <=> s.`bank_process_name` AND t.`resend_day_start` <=> s.`resend_day_start` AND t.`guard_date` <=> s.`guard_date` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`bank_process_accounting_resend_daily_guard_backup` (`id`, `company_id`, `company_name`, `bank_process_id`, `bank_process_name`, `resend_day_start`, `guard_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`bank_process_id`, s.`bank_process_name`, s.`resend_day_start`, s.`guard_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard_backup` s;

-- Table `bank_process_backup`
SAVEPOINT before_bank_process_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'bank_process_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`bank_process_backup` s
JOIN `c168_org`.`bank_process_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`country` <=> s.`country` AND t.`bank` <=> s.`bank` AND t.`type` <=> s.`type` AND t.`name` <=> s.`name` AND t.`card_merchant_id` <=> s.`card_merchant_id` AND t.`card_merchant_name` <=> s.`card_merchant_name` AND t.`customer_id` <=> s.`customer_id` AND t.`customer_name` <=> s.`customer_name` AND t.`profit_account_id` <=> s.`profit_account_id` AND t.`profit_account_name` <=> s.`profit_account_name` AND t.`contract` <=> s.`contract` AND t.`insurance` <=> s.`insurance` AND t.`sop` <=> s.`sop` AND t.`remark` <=> s.`remark` AND t.`cost` <=> s.`cost` AND t.`price` <=> s.`price` AND t.`profit` <=> s.`profit` AND t.`profit_sharing` <=> s.`profit_sharing` AND t.`day_start` <=> s.`day_start` AND t.`day_start_frequency` <=> s.`day_start_frequency` AND t.`day_end` <=> s.`day_end` AND t.`status` <=> s.`status` AND t.`issue_flag` <=> s.`issue_flag` AND t.`dts_modified` <=> s.`dts_modified` AND t.`modified_by` <=> s.`modified_by` AND t.`modified_by_name` <=> s.`modified_by_name` AND t.`modified_by_type` <=> s.`modified_by_type` AND t.`modified_by_owner_id` <=> s.`modified_by_owner_id` AND t.`dts_created` <=> s.`dts_created` AND t.`created_by` <=> s.`created_by` AND t.`created_by_name` <=> s.`created_by_name` AND t.`created_by_type` <=> s.`created_by_type` AND t.`created_by_owner_id` <=> s.`created_by_owner_id` AND t.`accounting_resend_relax_created_floor` <=> s.`accounting_resend_relax_created_floor` AND t.`accounting_resend_schedule_day_start` <=> s.`accounting_resend_schedule_day_start` AND t.`accounting_resend_schedule_day_end` <=> s.`accounting_resend_schedule_day_end` AND t.`accounting_resend_schedule_frequency` <=> s.`accounting_resend_schedule_frequency`);

INSERT IGNORE INTO `c168_org`.`bank_process_backup` (`id`, `company_id`, `company_name`, `country`, `bank`, `type`, `name`, `card_merchant_id`, `card_merchant_name`, `customer_id`, `customer_name`, `profit_account_id`, `profit_account_name`, `contract`, `insurance`, `sop`, `remark`, `cost`, `price`, `profit`, `profit_sharing`, `day_start`, `day_start_frequency`, `day_end`, `status`, `issue_flag`, `dts_modified`, `modified_by`, `modified_by_name`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_name`, `created_by_type`, `created_by_owner_id`, `accounting_resend_relax_created_floor`, `accounting_resend_schedule_day_start`, `accounting_resend_schedule_day_end`, `accounting_resend_schedule_frequency`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`country`, s.`bank`, s.`type`, s.`name`, s.`card_merchant_id`, s.`card_merchant_name`, s.`customer_id`, s.`customer_name`, s.`profit_account_id`, s.`profit_account_name`, s.`contract`, s.`insurance`, s.`sop`, s.`remark`, s.`cost`, s.`price`, s.`profit`, s.`profit_sharing`, s.`day_start`, s.`day_start_frequency`, s.`day_end`, s.`status`, s.`issue_flag`, s.`dts_modified`, s.`modified_by`, s.`modified_by_name`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_name`, s.`created_by_type`, s.`created_by_owner_id`, s.`accounting_resend_relax_created_floor`, s.`accounting_resend_schedule_day_start`, s.`accounting_resend_schedule_day_end`, s.`accounting_resend_schedule_frequency`
FROM `u857194726_count168`.`bank_process_backup` s;

-- Table `bank_process_maintenance_resend_pending`
SAVEPOINT before_bank_process_maintenance_resend_pending
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'bank_process_maintenance_resend_pending' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`bank_process_maintenance_resend_pending` s
JOIN `c168_org`.`bank_process_maintenance_resend_pending` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`bank_process_id` <=> s.`bank_process_id` AND t.`process_accounting_posted_id` <=> s.`process_accounting_posted_id` AND t.`period_type` <=> s.`period_type` AND t.`transaction_date` <=> s.`transaction_date` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`bank_process_maintenance_resend_pending` (`id`, `company_id`, `bank_process_id`, `process_accounting_posted_id`, `period_type`, `transaction_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`bank_process_id`, s.`process_accounting_posted_id`, s.`period_type`, s.`transaction_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_maintenance_resend_pending` s;

-- Table `bank_process_maintenance_resend_pending_backup`
SAVEPOINT before_bank_process_maintenance_resend_pending_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'bank_process_maintenance_resend_pending_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`bank_process_maintenance_resend_pending_backup` s
JOIN `c168_org`.`bank_process_maintenance_resend_pending_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`bank_process_id` <=> s.`bank_process_id` AND t.`bank_process_name` <=> s.`bank_process_name` AND t.`process_accounting_posted_id` <=> s.`process_accounting_posted_id` AND t.`period_type` <=> s.`period_type` AND t.`transaction_date` <=> s.`transaction_date` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`bank_process_maintenance_resend_pending_backup` (`id`, `company_id`, `company_name`, `bank_process_id`, `bank_process_name`, `process_accounting_posted_id`, `period_type`, `transaction_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`bank_process_id`, s.`bank_process_name`, s.`process_accounting_posted_id`, s.`period_type`, s.`transaction_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_maintenance_resend_pending_backup` s;

-- Table `company`
SAVEPOINT before_company
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company` s
JOIN `c168_org`.`company` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`owner_id` <=> s.`owner_id` AND t.`created_by` <=> s.`created_by` AND t.`created_at` <=> s.`created_at` AND t.`expiration_date` <=> s.`expiration_date` AND t.`domain_billing_period` <=> s.`domain_billing_period` AND t.`permissions` <=> s.`permissions` AND t.`fee_share_allocations` <=> s.`fee_share_allocations` AND t.`group_id` <=> s.`group_id` AND t.`auto_renew_enabled` <=> s.`auto_renew_enabled` AND t.`auto_renew_period` <=> s.`auto_renew_period` AND t.`payment_customer_id` <=> s.`payment_customer_id` AND t.`payment_subscription_id` <=> s.`payment_subscription_id` AND t.`auto_renew_updated_at` <=> s.`auto_renew_updated_at` AND t.`auto_renew_updated_by` <=> s.`auto_renew_updated_by`);

INSERT IGNORE INTO `c168_org`.`company` (`id`, `company_id`, `owner_id`, `created_by`, `created_at`, `expiration_date`, `domain_billing_period`, `permissions`, `fee_share_allocations`, `group_id`, `auto_renew_enabled`, `auto_renew_period`, `payment_customer_id`, `payment_subscription_id`, `auto_renew_updated_at`, `auto_renew_updated_by`)
SELECT s.`id`, s.`company_id`, s.`owner_id`, s.`created_by`, s.`created_at`, s.`expiration_date`, s.`domain_billing_period`, s.`permissions`, s.`fee_share_allocations`, s.`group_id`, s.`auto_renew_enabled`, s.`auto_renew_period`, s.`payment_customer_id`, s.`payment_subscription_id`, s.`auto_renew_updated_at`, s.`auto_renew_updated_by`
FROM `u857194726_count168`.`company` s;

-- Table `company_backup`
SAVEPOINT before_company_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company_backup` s
JOIN `c168_org`.`company_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`owner_id` <=> s.`owner_id` AND t.`owner_name` <=> s.`owner_name` AND t.`created_by` <=> s.`created_by` AND t.`created_at` <=> s.`created_at` AND t.`expiration_date` <=> s.`expiration_date` AND t.`permissions` <=> s.`permissions` AND t.`fee_share_allocations` <=> s.`fee_share_allocations` AND t.`group_id` <=> s.`group_id`);

INSERT IGNORE INTO `c168_org`.`company_backup` (`id`, `company_id`, `owner_id`, `owner_name`, `created_by`, `created_at`, `expiration_date`, `permissions`, `fee_share_allocations`, `group_id`)
SELECT s.`id`, s.`company_id`, s.`owner_id`, s.`owner_name`, s.`created_by`, s.`created_at`, s.`expiration_date`, s.`permissions`, s.`fee_share_allocations`, s.`group_id`
FROM `u857194726_count168`.`company_backup` s;

-- Table `company_countries`
SAVEPOINT before_company_countries
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_countries' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company_countries` s
JOIN `c168_org`.`company_countries` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`company_countries` (`id`, `company_id`, `country`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`country`, s.`created_at`
FROM `u857194726_count168`.`company_countries` s;

-- Table `company_countries_backup`
SAVEPOINT before_company_countries_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_countries_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company_countries_backup` s
JOIN `c168_org`.`company_countries_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`country` <=> s.`country` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`company_countries_backup` (`id`, `company_id`, `company_name`, `country`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`country`, s.`created_at`
FROM `u857194726_count168`.`company_countries_backup` s;

-- Table `company_deletion_archive`
SAVEPOINT before_company_deletion_archive
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_deletion_archive' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company_deletion_archive` s
JOIN `c168_org`.`company_deletion_archive` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_db_id` <=> s.`company_db_id` AND t.`company_code` <=> s.`company_code` AND t.`owner_id` <=> s.`owner_id` AND t.`owner_code` <=> s.`owner_code` AND t.`owner_name` <=> s.`owner_name` AND t.`group_id` <=> s.`group_id` AND t.`deleted_by_user_id` <=> s.`deleted_by_user_id` AND t.`deleted_by_owner_id` <=> s.`deleted_by_owner_id` AND t.`deleted_by_login` <=> s.`deleted_by_login` AND t.`deleted_at` <=> s.`deleted_at` AND t.`restored_at` <=> s.`restored_at` AND t.`restored_by_login` <=> s.`restored_by_login` AND t.`status` <=> s.`status` AND t.`row_counts` <=> s.`row_counts` AND t.`payload` <=> s.`payload`);

INSERT IGNORE INTO `c168_org`.`company_deletion_archive` (`id`, `company_db_id`, `company_code`, `owner_id`, `owner_code`, `owner_name`, `group_id`, `deleted_by_user_id`, `deleted_by_owner_id`, `deleted_by_login`, `deleted_at`, `restored_at`, `restored_by_login`, `status`, `row_counts`, `payload`)
SELECT s.`id`, s.`company_db_id`, s.`company_code`, s.`owner_id`, s.`owner_code`, s.`owner_name`, s.`group_id`, s.`deleted_by_user_id`, s.`deleted_by_owner_id`, s.`deleted_by_login`, s.`deleted_at`, s.`restored_at`, s.`restored_by_login`, s.`status`, s.`row_counts`, s.`payload`
FROM `u857194726_count168`.`company_deletion_archive` s;

-- Table `company_ownership`
SAVEPOINT before_company_ownership
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_ownership' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company_ownership` s
JOIN `c168_org`.`company_ownership` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`entity_type` <=> s.`entity_type` AND t.`account_id` <=> s.`account_id` AND t.`group_id` <=> s.`group_id` AND t.`owner_type` <=> s.`owner_type` AND t.`percentage` <=> s.`percentage` AND t.`created_at` <=> s.`created_at` AND t.`include_group` <=> s.`include_group` AND t.`partner_group_id` <=> s.`partner_group_id` AND t.`read_only` <=> s.`read_only`);

INSERT IGNORE INTO `c168_org`.`company_ownership` (`id`, `company_id`, `entity_type`, `account_id`, `group_id`, `owner_type`, `percentage`, `created_at`, `include_group`, `partner_group_id`, `read_only`)
SELECT s.`id`, s.`company_id`, s.`entity_type`, s.`account_id`, s.`group_id`, s.`owner_type`, s.`percentage`, s.`created_at`, s.`include_group`, s.`partner_group_id`, s.`read_only`
FROM `u857194726_count168`.`company_ownership` s;

-- Table `company_ownership_backup`
SAVEPOINT before_company_ownership_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_ownership_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company_ownership_backup` s
JOIN `c168_org`.`company_ownership_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`entity_type` <=> s.`entity_type` AND t.`account_id` <=> s.`account_id` AND t.`account_name` <=> s.`account_name` AND t.`group_id` <=> s.`group_id` AND t.`include_group` <=> s.`include_group` AND t.`partner_group` <=> s.`partner_group` AND t.`owner_type` <=> s.`owner_type` AND t.`percentage` <=> s.`percentage` AND t.`read_only` <=> s.`read_only` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`company_ownership_backup` (`id`, `company_id`, `company_name`, `entity_type`, `account_id`, `account_name`, `group_id`, `include_group`, `partner_group`, `owner_type`, `percentage`, `read_only`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`entity_type`, s.`account_id`, s.`account_name`, s.`group_id`, s.`include_group`, s.`partner_group`, s.`owner_type`, s.`percentage`, s.`read_only`, s.`created_at`
FROM `u857194726_count168`.`company_ownership_backup` s;

-- Table `company_ownership_history`
SAVEPOINT before_company_ownership_history
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_ownership_history' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`company_ownership_history` s
JOIN `c168_org`.`company_ownership_history` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`effective_month` <=> s.`effective_month` AND t.`account_id` <=> s.`account_id` AND t.`owner_type` <=> s.`owner_type` AND t.`percentage` <=> s.`percentage` AND t.`partner_group_id` <=> s.`partner_group_id` AND t.`read_only` <=> s.`read_only` AND t.`saved_by` <=> s.`saved_by` AND t.`saved_at` <=> s.`saved_at`);

INSERT IGNORE INTO `c168_org`.`company_ownership_history` (`id`, `company_id`, `effective_month`, `account_id`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `saved_by`, `saved_at`)
SELECT s.`id`, s.`company_id`, s.`effective_month`, s.`account_id`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`saved_by`, s.`saved_at`
FROM `u857194726_count168`.`company_ownership_history` s;

-- Table `company_selected_banks`
SAVEPOINT before_company_selected_banks
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_selected_banks' AS table_name,
  JSON_OBJECT('company_id', s.`company_id`, 'country', s.`country`, 'bank', s.`bank`) AS pk_json
FROM `u857194726_count168`.`company_selected_banks` s
JOIN `c168_org`.`company_selected_banks` t ON t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`bank` <=> s.`bank`
WHERE NOT (t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`bank` <=> s.`bank` AND t.`sort_order` <=> s.`sort_order`);

INSERT IGNORE INTO `c168_org`.`company_selected_banks` (`company_id`, `country`, `bank`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`bank`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_banks` s;

-- Table `company_selected_bank_backup`
SAVEPOINT before_company_selected_bank_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_selected_bank_backup' AS table_name,
  JSON_OBJECT('company_id', s.`company_id`, 'country', s.`country`, 'bank', s.`bank`) AS pk_json
FROM `u857194726_count168`.`company_selected_bank_backup` s
JOIN `c168_org`.`company_selected_bank_backup` t ON t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`bank` <=> s.`bank`
WHERE NOT (t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`bank` <=> s.`bank` AND t.`sort_order` <=> s.`sort_order`);

INSERT IGNORE INTO `c168_org`.`company_selected_bank_backup` (`company_id`, `country`, `bank`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`bank`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_bank_backup` s;

-- Table `company_selected_countries`
SAVEPOINT before_company_selected_countries
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_selected_countries' AS table_name,
  JSON_OBJECT('company_id', s.`company_id`, 'country', s.`country`) AS pk_json
FROM `u857194726_count168`.`company_selected_countries` s
JOIN `c168_org`.`company_selected_countries` t ON t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country`
WHERE NOT (t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`sort_order` <=> s.`sort_order`);

INSERT IGNORE INTO `c168_org`.`company_selected_countries` (`company_id`, `country`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_countries` s;

-- Table `company_selected_countries_backup`
SAVEPOINT before_company_selected_countries_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'company_selected_countries_backup' AS table_name,
  JSON_OBJECT('company_id', s.`company_id`, 'country', s.`country`) AS pk_json
FROM `u857194726_count168`.`company_selected_countries_backup` s
JOIN `c168_org`.`company_selected_countries_backup` t ON t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country`
WHERE NOT (t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`sort_order` <=> s.`sort_order`);

INSERT IGNORE INTO `c168_org`.`company_selected_countries_backup` (`company_id`, `country`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_countries_backup` s;

-- Table `country_bank`
SAVEPOINT before_country_bank
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'country_bank' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`country_bank` s
JOIN `c168_org`.`country_bank` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`country` <=> s.`country` AND t.`bank` <=> s.`bank` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`country_bank` (`id`, `company_id`, `country`, `bank`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`country`, s.`bank`, s.`created_at`
FROM `u857194726_count168`.`country_bank` s;

-- Table `currency`
SAVEPOINT before_currency
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'currency' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`currency` s
JOIN `c168_org`.`currency` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`code` <=> s.`code` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`sync_source` <=> s.`sync_source`);

INSERT IGNORE INTO `c168_org`.`currency` (`id`, `code`, `company_id`, `scope_type`, `scope_id`, `sync_source`)
SELECT s.`id`, s.`code`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`sync_source`
FROM `u857194726_count168`.`currency` s;

-- Table `currency_backup`
SAVEPOINT before_currency_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'currency_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`currency_backup` s
JOIN `c168_org`.`currency_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`code` <=> s.`code` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name`);

INSERT IGNORE INTO `c168_org`.`currency_backup` (`id`, `code`, `company_id`, `company_name`)
SELECT s.`id`, s.`code`, s.`company_id`, s.`company_name`
FROM `u857194726_count168`.`currency_backup` s;

-- Table `data_captures`
SAVEPOINT before_data_captures
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_captures' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_captures` s
JOIN `c168_org`.`data_captures` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`capture_date` <=> s.`capture_date` AND t.`process_id` <=> s.`process_id` AND t.`currency_id` <=> s.`currency_id` AND t.`created_at` <=> s.`created_at` AND t.`created_by` <=> s.`created_by` AND t.`user_type` <=> s.`user_type` AND t.`remark` <=> s.`remark`);

INSERT IGNORE INTO `c168_org`.`data_captures` (`id`, `company_id`, `scope_type`, `scope_id`, `capture_date`, `process_id`, `currency_id`, `created_at`, `created_by`, `user_type`, `remark`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`capture_date`, s.`process_id`, s.`currency_id`, s.`created_at`, s.`created_by`, s.`user_type`, s.`remark`
FROM `u857194726_count168`.`data_captures` s;

-- Table `data_captures_backup`
SAVEPOINT before_data_captures_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_captures_backup' AS table_name,
  JSON_OBJECT('backup_id', s.`backup_id`) AS pk_json
FROM `u857194726_count168`.`data_captures_backup` s
JOIN `c168_org`.`data_captures_backup` t ON t.`backup_id` <=> s.`backup_id`
WHERE NOT (t.`backup_id` <=> s.`backup_id` AND t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`capture_date` <=> s.`capture_date` AND t.`process_id` <=> s.`process_id` AND t.`currency_id` <=> s.`currency_id` AND t.`created_at` <=> s.`created_at` AND t.`created_by` <=> s.`created_by` AND t.`user_type` <=> s.`user_type` AND t.`remark` <=> s.`remark` AND t.`backup_created_at` <=> s.`backup_created_at`);

INSERT IGNORE INTO `c168_org`.`data_captures_backup` (`backup_id`, `id`, `company_id`, `capture_date`, `process_id`, `currency_id`, `created_at`, `created_by`, `user_type`, `remark`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`capture_date`, s.`process_id`, s.`currency_id`, s.`created_at`, s.`created_by`, s.`user_type`, s.`remark`, s.`backup_created_at`
FROM `u857194726_count168`.`data_captures_backup` s;

-- Table `data_captures_deleted`
SAVEPOINT before_data_captures_deleted
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_captures_deleted' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_captures_deleted` s
JOIN `c168_org`.`data_captures_deleted` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`capture_id` <=> s.`capture_id` AND t.`company_id` <=> s.`company_id` AND t.`process_id` <=> s.`process_id` AND t.`currency_id` <=> s.`currency_id` AND t.`capture_date` <=> s.`capture_date` AND t.`created_at` <=> s.`created_at` AND t.`created_by` <=> s.`created_by` AND t.`user_type` <=> s.`user_type` AND t.`remark` <=> s.`remark` AND t.`deleted_by_user_id` <=> s.`deleted_by_user_id` AND t.`deleted_by_owner_id` <=> s.`deleted_by_owner_id` AND t.`deleted_at` <=> s.`deleted_at`);

INSERT IGNORE INTO `c168_org`.`data_captures_deleted` (`id`, `capture_id`, `company_id`, `process_id`, `currency_id`, `capture_date`, `created_at`, `created_by`, `user_type`, `remark`, `deleted_by_user_id`, `deleted_by_owner_id`, `deleted_at`)
SELECT s.`id`, s.`capture_id`, s.`company_id`, s.`process_id`, s.`currency_id`, s.`capture_date`, s.`created_at`, s.`created_by`, s.`user_type`, s.`remark`, s.`deleted_by_user_id`, s.`deleted_by_owner_id`, s.`deleted_at`
FROM `u857194726_count168`.`data_captures_deleted` s;

-- Table `data_capture_details`
SAVEPOINT before_data_capture_details
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_details' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_capture_details` s
JOIN `c168_org`.`data_capture_details` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`capture_id` <=> s.`capture_id` AND t.`id_product_main` <=> s.`id_product_main` AND t.`description_main` <=> s.`description_main` AND t.`id_product_sub` <=> s.`id_product_sub` AND t.`columns_value` <=> s.`columns_value` AND t.`description_sub` <=> s.`description_sub` AND t.`product_type` <=> s.`product_type` AND t.`formula_variant` <=> s.`formula_variant` AND t.`id_product` <=> s.`id_product` AND t.`account_id` <=> s.`account_id` AND t.`currency_id` <=> s.`currency_id` AND t.`source_value` <=> s.`source_value` AND t.`source_percent` <=> s.`source_percent` AND t.`enable_source_percent` <=> s.`enable_source_percent` AND t.`formula` <=> s.`formula` AND t.`processed_amount` <=> s.`processed_amount` AND t.`rate` <=> s.`rate` AND t.`display_order` <=> s.`display_order` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_details` (`id`, `company_id`, `scope_type`, `scope_id`, `capture_id`, `id_product_main`, `description_main`, `id_product_sub`, `columns_value`, `description_sub`, `product_type`, `formula_variant`, `id_product`, `account_id`, `currency_id`, `source_value`, `source_percent`, `enable_source_percent`, `formula`, `processed_amount`, `rate`, `display_order`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`capture_id`, s.`id_product_main`, s.`description_main`, s.`id_product_sub`, s.`columns_value`, s.`description_sub`, s.`product_type`, s.`formula_variant`, s.`id_product`, s.`account_id`, s.`currency_id`, s.`source_value`, s.`source_percent`, s.`enable_source_percent`, s.`formula`, s.`processed_amount`, s.`rate`, s.`display_order`, s.`created_at`
FROM `u857194726_count168`.`data_capture_details` s;

-- Table `data_capture_details_backup`
SAVEPOINT before_data_capture_details_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_details_backup' AS table_name,
  JSON_OBJECT('backup_id', s.`backup_id`) AS pk_json
FROM `u857194726_count168`.`data_capture_details_backup` s
JOIN `c168_org`.`data_capture_details_backup` t ON t.`backup_id` <=> s.`backup_id`
WHERE NOT (t.`backup_id` <=> s.`backup_id` AND t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`capture_id` <=> s.`capture_id` AND t.`id_product_main` <=> s.`id_product_main` AND t.`description_main` <=> s.`description_main` AND t.`id_product_sub` <=> s.`id_product_sub` AND t.`columns_value` <=> s.`columns_value` AND t.`description_sub` <=> s.`description_sub` AND t.`product_type` <=> s.`product_type` AND t.`formula_variant` <=> s.`formula_variant` AND t.`id_product` <=> s.`id_product` AND t.`account_id` <=> s.`account_id` AND t.`currency_id` <=> s.`currency_id` AND t.`source_value` <=> s.`source_value` AND t.`source_percent` <=> s.`source_percent` AND t.`enable_source_percent` <=> s.`enable_source_percent` AND t.`formula` <=> s.`formula` AND t.`processed_amount` <=> s.`processed_amount` AND t.`rate` <=> s.`rate` AND t.`display_order` <=> s.`display_order` AND t.`created_at` <=> s.`created_at` AND t.`backup_created_at` <=> s.`backup_created_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_details_backup` (`backup_id`, `id`, `company_id`, `capture_id`, `id_product_main`, `description_main`, `id_product_sub`, `columns_value`, `description_sub`, `product_type`, `formula_variant`, `id_product`, `account_id`, `currency_id`, `source_value`, `source_percent`, `enable_source_percent`, `formula`, `processed_amount`, `rate`, `display_order`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`capture_id`, s.`id_product_main`, s.`description_main`, s.`id_product_sub`, s.`columns_value`, s.`description_sub`, s.`product_type`, s.`formula_variant`, s.`id_product`, s.`account_id`, s.`currency_id`, s.`source_value`, s.`source_percent`, s.`enable_source_percent`, s.`formula`, s.`processed_amount`, s.`rate`, s.`display_order`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`data_capture_details_backup` s;

-- Table `data_capture_draft`
SAVEPOINT before_data_capture_draft
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_draft' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_capture_draft` s
JOIN `c168_org`.`data_capture_draft` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`scope_type` <=> s.`scope_type` AND t.`group_id` <=> s.`group_id` AND t.`company_id` <=> s.`company_id` AND t.`process_key` <=> s.`process_key` AND t.`currency_id` <=> s.`currency_id` AND t.`draft_json` <=> s.`draft_json` AND t.`updated_by` <=> s.`updated_by` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_draft` (`id`, `scope_type`, `group_id`, `company_id`, `process_key`, `currency_id`, `draft_json`, `updated_by`, `updated_at`)
SELECT s.`id`, s.`scope_type`, s.`group_id`, s.`company_id`, s.`process_key`, s.`currency_id`, s.`draft_json`, s.`updated_by`, s.`updated_at`
FROM `u857194726_count168`.`data_capture_draft` s;

-- Table `data_capture_submit_queue`
SAVEPOINT before_data_capture_submit_queue
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_submit_queue' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_capture_submit_queue` s
JOIN `c168_org`.`data_capture_submit_queue` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`user_id` <=> s.`user_id` AND t.`status` <=> s.`status` AND t.`request_json` <=> s.`request_json` AND t.`capture_id` <=> s.`capture_id` AND t.`rows_count` <=> s.`rows_count` AND t.`error_message` <=> s.`error_message` AND t.`created_at` <=> s.`created_at` AND t.`finished_at` <=> s.`finished_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_submit_queue` (`id`, `company_id`, `user_id`, `status`, `request_json`, `capture_id`, `rows_count`, `error_message`, `created_at`, `finished_at`)
SELECT s.`id`, s.`company_id`, s.`user_id`, s.`status`, s.`request_json`, s.`capture_id`, s.`rows_count`, s.`error_message`, s.`created_at`, s.`finished_at`
FROM `u857194726_count168`.`data_capture_submit_queue` s;

-- Table `data_capture_submit_queue_backup`
SAVEPOINT before_data_capture_submit_queue_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_submit_queue_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_capture_submit_queue_backup` s
JOIN `c168_org`.`data_capture_submit_queue_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`user_id` <=> s.`user_id` AND t.`status` <=> s.`status` AND t.`request_json` <=> s.`request_json` AND t.`capture_id` <=> s.`capture_id` AND t.`capture_name` <=> s.`capture_name` AND t.`rows_count` <=> s.`rows_count` AND t.`error_message` <=> s.`error_message` AND t.`created_at` <=> s.`created_at` AND t.`finished_at` <=> s.`finished_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_submit_queue_backup` (`id`, `company_id`, `company_name`, `user_id`, `status`, `request_json`, `capture_id`, `capture_name`, `rows_count`, `error_message`, `created_at`, `finished_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`user_id`, s.`status`, s.`request_json`, s.`capture_id`, s.`capture_name`, s.`rows_count`, s.`error_message`, s.`created_at`, s.`finished_at`
FROM `u857194726_count168`.`data_capture_submit_queue_backup` s;

-- Table `data_capture_summary_state`
SAVEPOINT before_data_capture_summary_state
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_summary_state' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_capture_summary_state` s
JOIN `c168_org`.`data_capture_summary_state` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`process_key` <=> s.`process_key` AND t.`state_json` <=> s.`state_json` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_summary_state` (`id`, `company_id`, `process_key`, `state_json`, `updated_at`)
SELECT s.`id`, s.`company_id`, s.`process_key`, s.`state_json`, s.`updated_at`
FROM `u857194726_count168`.`data_capture_summary_state` s;

-- Table `data_capture_summary_state_backup`
SAVEPOINT before_data_capture_summary_state_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_summary_state_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_capture_summary_state_backup` s
JOIN `c168_org`.`data_capture_summary_state_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`process_key` <=> s.`process_key` AND t.`state_json` <=> s.`state_json` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_summary_state_backup` (`id`, `company_id`, `company_name`, `process_key`, `state_json`, `updated_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`process_key`, s.`state_json`, s.`updated_at`
FROM `u857194726_count168`.`data_capture_summary_state_backup` s;

-- Table `data_capture_templates`
SAVEPOINT before_data_capture_templates
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_templates' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`data_capture_templates` s
JOIN `c168_org`.`data_capture_templates` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`process_id` <=> s.`process_id` AND t.`source_columns` <=> s.`source_columns` AND t.`batch_selection` <=> s.`batch_selection` AND t.`columns_display` <=> s.`columns_display` AND t.`data_capture_id` <=> s.`data_capture_id` AND t.`row_index` <=> s.`row_index` AND t.`sub_order` <=> s.`sub_order` AND t.`id_product` <=> s.`id_product` AND t.`product_type` <=> s.`product_type` AND t.`formula_variant` <=> s.`formula_variant` AND t.`parent_id_product` <=> s.`parent_id_product` AND t.`template_key` <=> s.`template_key` AND t.`description` <=> s.`description` AND t.`account_id` <=> s.`account_id` AND t.`account_display` <=> s.`account_display` AND t.`currency_id` <=> s.`currency_id` AND t.`currency_display` <=> s.`currency_display` AND t.`formula_operators` <=> s.`formula_operators` AND t.`input_method` <=> s.`input_method` AND t.`formula_display` <=> s.`formula_display` AND t.`last_source_value` <=> s.`last_source_value` AND t.`last_processed_amount` <=> s.`last_processed_amount` AND t.`source_percent` <=> s.`source_percent` AND t.`enable_source_percent` <=> s.`enable_source_percent` AND t.`enable_input_method` <=> s.`enable_input_method` AND t.`updated_at` <=> s.`updated_at` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_templates` (`id`, `company_id`, `scope_type`, `scope_id`, `process_id`, `source_columns`, `batch_selection`, `columns_display`, `data_capture_id`, `row_index`, `sub_order`, `id_product`, `product_type`, `formula_variant`, `parent_id_product`, `template_key`, `description`, `account_id`, `account_display`, `currency_id`, `currency_display`, `formula_operators`, `input_method`, `formula_display`, `last_source_value`, `last_processed_amount`, `source_percent`, `enable_source_percent`, `enable_input_method`, `updated_at`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`process_id`, s.`source_columns`, s.`batch_selection`, s.`columns_display`, s.`data_capture_id`, s.`row_index`, s.`sub_order`, s.`id_product`, s.`product_type`, s.`formula_variant`, s.`parent_id_product`, s.`template_key`, s.`description`, s.`account_id`, s.`account_display`, s.`currency_id`, s.`currency_display`, s.`formula_operators`, s.`input_method`, s.`formula_display`, s.`last_source_value`, s.`last_processed_amount`, s.`source_percent`, s.`enable_source_percent`, s.`enable_input_method`, s.`updated_at`, s.`created_at`
FROM `u857194726_count168`.`data_capture_templates` s;

-- Table `data_capture_templates_backup`
SAVEPOINT before_data_capture_templates_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'data_capture_templates_backup' AS table_name,
  JSON_OBJECT('backup_id', s.`backup_id`) AS pk_json
FROM `u857194726_count168`.`data_capture_templates_backup` s
JOIN `c168_org`.`data_capture_templates_backup` t ON t.`backup_id` <=> s.`backup_id`
WHERE NOT (t.`backup_id` <=> s.`backup_id` AND t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`process_id` <=> s.`process_id` AND t.`source_columns` <=> s.`source_columns` AND t.`batch_selection` <=> s.`batch_selection` AND t.`columns_display` <=> s.`columns_display` AND t.`data_capture_id` <=> s.`data_capture_id` AND t.`row_index` <=> s.`row_index` AND t.`sub_order` <=> s.`sub_order` AND t.`id_product` <=> s.`id_product` AND t.`product_type` <=> s.`product_type` AND t.`formula_variant` <=> s.`formula_variant` AND t.`parent_id_product` <=> s.`parent_id_product` AND t.`template_key` <=> s.`template_key` AND t.`description` <=> s.`description` AND t.`account_id` <=> s.`account_id` AND t.`account_display` <=> s.`account_display` AND t.`currency_id` <=> s.`currency_id` AND t.`currency_display` <=> s.`currency_display` AND t.`formula_operators` <=> s.`formula_operators` AND t.`input_method` <=> s.`input_method` AND t.`formula_display` <=> s.`formula_display` AND t.`last_source_value` <=> s.`last_source_value` AND t.`last_processed_amount` <=> s.`last_processed_amount` AND t.`source_percent` <=> s.`source_percent` AND t.`enable_source_percent` <=> s.`enable_source_percent` AND t.`enable_input_method` <=> s.`enable_input_method` AND t.`updated_at` <=> s.`updated_at` AND t.`created_at` <=> s.`created_at` AND t.`backup_created_at` <=> s.`backup_created_at`);

INSERT IGNORE INTO `c168_org`.`data_capture_templates_backup` (`backup_id`, `id`, `company_id`, `process_id`, `source_columns`, `batch_selection`, `columns_display`, `data_capture_id`, `row_index`, `sub_order`, `id_product`, `product_type`, `formula_variant`, `parent_id_product`, `template_key`, `description`, `account_id`, `account_display`, `currency_id`, `currency_display`, `formula_operators`, `input_method`, `formula_display`, `last_source_value`, `last_processed_amount`, `source_percent`, `enable_source_percent`, `enable_input_method`, `updated_at`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`process_id`, s.`source_columns`, s.`batch_selection`, s.`columns_display`, s.`data_capture_id`, s.`row_index`, s.`sub_order`, s.`id_product`, s.`product_type`, s.`formula_variant`, s.`parent_id_product`, s.`template_key`, s.`description`, s.`account_id`, s.`account_display`, s.`currency_id`, s.`currency_display`, s.`formula_operators`, s.`input_method`, s.`formula_display`, s.`last_source_value`, s.`last_processed_amount`, s.`source_percent`, s.`enable_source_percent`, s.`enable_input_method`, s.`updated_at`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`data_capture_templates_backup` s;

-- Table `day`
SAVEPOINT before_day
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'day' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`day` s
JOIN `c168_org`.`day` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`day_name` <=> s.`day_name`);

INSERT IGNORE INTO `c168_org`.`day` (`id`, `day_name`)
SELECT s.`id`, s.`day_name`
FROM `u857194726_count168`.`day` s;

-- Table `deleted_logs`
SAVEPOINT before_deleted_logs
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'deleted_logs' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`deleted_logs` s
JOIN `c168_org`.`deleted_logs` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`user` <=> s.`user` AND t.`company_id` <=> s.`company_id` AND t.`page` <=> s.`page` AND t.`table_name` <=> s.`table_name` AND t.`record_id` <=> s.`record_id` AND t.`action_type` <=> s.`action_type` AND t.`ip_address` <=> s.`ip_address` AND t.`deleted_data` <=> s.`deleted_data` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`deleted_logs` (`id`, `user`, `company_id`, `page`, `table_name`, `record_id`, `action_type`, `ip_address`, `deleted_data`, `created_at`)
SELECT s.`id`, s.`user`, s.`company_id`, s.`page`, s.`table_name`, s.`record_id`, s.`action_type`, s.`ip_address`, s.`deleted_data`, s.`created_at`
FROM `u857194726_count168`.`deleted_logs` s;

-- Table `description`
SAVEPOINT before_description
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'description' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`description` s
JOIN `c168_org`.`description` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`name` <=> s.`name` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id`);

INSERT IGNORE INTO `c168_org`.`description` (`id`, `name`, `company_id`, `scope_type`, `scope_id`)
SELECT s.`id`, s.`name`, s.`company_id`, s.`scope_type`, s.`scope_id`
FROM `u857194726_count168`.`description` s;

-- Table `description_backup`
SAVEPOINT before_description_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'description_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`description_backup` s
JOIN `c168_org`.`description_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`name` <=> s.`name` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name`);

INSERT IGNORE INTO `c168_org`.`description_backup` (`id`, `name`, `company_id`, `company_name`)
SELECT s.`id`, s.`name`, s.`company_id`, s.`company_name`
FROM `u857194726_count168`.`description_backup` s;

-- Table `groups`
SAVEPOINT before_groups
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'groups' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`groups` s
JOIN `c168_org`.`groups` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`group_code` <=> s.`group_code` AND t.`group_name` <=> s.`group_name` AND t.`status` <=> s.`status` AND t.`owner_id` <=> s.`owner_id` AND t.`expiration_date` <=> s.`expiration_date` AND t.`permissions` <=> s.`permissions` AND t.`fee_share_allocations` <=> s.`fee_share_allocations` AND t.`created_by` <=> s.`created_by` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`groups` (`id`, `group_code`, `group_name`, `status`, `owner_id`, `expiration_date`, `permissions`, `fee_share_allocations`, `created_by`, `created_at`, `updated_at`)
SELECT s.`id`, s.`group_code`, s.`group_name`, s.`status`, s.`owner_id`, s.`expiration_date`, s.`permissions`, s.`fee_share_allocations`, s.`created_by`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`groups` s;

-- Table `group_company_map`
SAVEPOINT before_group_company_map
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'group_company_map' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`group_company_map` s
JOIN `c168_org`.`group_company_map` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`group_id` <=> s.`group_id` AND t.`company_id` <=> s.`company_id` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`group_company_map` (`id`, `group_id`, `company_id`, `created_at`)
SELECT s.`id`, s.`group_id`, s.`company_id`, s.`created_at`
FROM `u857194726_count168`.`group_company_map` s;

-- Table `group_ownership`
SAVEPOINT before_group_ownership
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'group_ownership' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`group_ownership` s
JOIN `c168_org`.`group_ownership` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`group_id` <=> s.`group_id` AND t.`owner_id` <=> s.`owner_id` AND t.`account_id` <=> s.`account_id` AND t.`owner_type` <=> s.`owner_type` AND t.`percentage` <=> s.`percentage` AND t.`partner_group_id` <=> s.`partner_group_id` AND t.`read_only` <=> s.`read_only` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`group_ownership` (`id`, `group_id`, `owner_id`, `account_id`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `created_at`, `updated_at`)
SELECT s.`id`, s.`group_id`, s.`owner_id`, s.`account_id`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`group_ownership` s;

-- Table `group_ownership_backup`
SAVEPOINT before_group_ownership_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'group_ownership_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`group_ownership_backup` s
JOIN `c168_org`.`group_ownership_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`group_id` <=> s.`group_id` AND t.`owner_id` <=> s.`owner_id` AND t.`owner_name` <=> s.`owner_name` AND t.`account_id` <=> s.`account_id` AND t.`account_name` <=> s.`account_name` AND t.`owner_type` <=> s.`owner_type` AND t.`percentage` <=> s.`percentage` AND t.`partner_group_id` <=> s.`partner_group_id` AND t.`read_only` <=> s.`read_only` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`group_ownership_backup` (`id`, `group_id`, `owner_id`, `owner_name`, `account_id`, `account_name`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `created_at`, `updated_at`)
SELECT s.`id`, s.`group_id`, s.`owner_id`, s.`owner_name`, s.`account_id`, s.`account_name`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`group_ownership_backup` s;

-- Table `group_ownership_history`
SAVEPOINT before_group_ownership_history
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'group_ownership_history' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`group_ownership_history` s
JOIN `c168_org`.`group_ownership_history` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`group_id` <=> s.`group_id` AND t.`owner_id` <=> s.`owner_id` AND t.`effective_month` <=> s.`effective_month` AND t.`account_id` <=> s.`account_id` AND t.`owner_type` <=> s.`owner_type` AND t.`percentage` <=> s.`percentage` AND t.`partner_group_id` <=> s.`partner_group_id` AND t.`read_only` <=> s.`read_only` AND t.`saved_by` <=> s.`saved_by` AND t.`saved_at` <=> s.`saved_at`);

INSERT IGNORE INTO `c168_org`.`group_ownership_history` (`id`, `group_id`, `owner_id`, `effective_month`, `account_id`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `saved_by`, `saved_at`)
SELECT s.`id`, s.`group_id`, s.`owner_id`, s.`effective_month`, s.`account_id`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`saved_by`, s.`saved_at`
FROM `u857194726_count168`.`group_ownership_history` s;

-- Table `maintenance_marquee`
SAVEPOINT before_maintenance_marquee
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'maintenance_marquee' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`maintenance_marquee` s
JOIN `c168_org`.`maintenance_marquee` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`content` <=> s.`content` AND t.`label_type` <=> s.`label_type` AND t.`company_code` <=> s.`company_code` AND t.`status` <=> s.`status` AND t.`created_by` <=> s.`created_by` AND t.`user_type` <=> s.`user_type` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`maintenance_marquee` (`id`, `content`, `label_type`, `company_code`, `status`, `created_by`, `user_type`, `created_at`, `updated_at`)
SELECT s.`id`, s.`content`, s.`label_type`, s.`company_code`, s.`status`, s.`created_by`, s.`user_type`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`maintenance_marquee` s;

-- Table `owner`
SAVEPOINT before_owner
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'owner' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`owner` s
JOIN `c168_org`.`owner` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`owner_code` <=> s.`owner_code` AND t.`name` <=> s.`name` AND t.`email` <=> s.`email` AND t.`password` <=> s.`password` AND t.`secondary_password` <=> s.`secondary_password` AND t.`status` <=> s.`status` AND t.`created_by` <=> s.`created_by` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`owner` (`id`, `owner_code`, `name`, `email`, `password`, `secondary_password`, `status`, `created_by`, `created_at`)
SELECT s.`id`, s.`owner_code`, s.`name`, s.`email`, s.`password`, s.`secondary_password`, s.`status`, s.`created_by`, s.`created_at`
FROM `u857194726_count168`.`owner` s;

-- Table `owner_backup`
SAVEPOINT before_owner_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'owner_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`owner_backup` s
JOIN `c168_org`.`owner_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`owner_code` <=> s.`owner_code` AND t.`name` <=> s.`name` AND t.`email` <=> s.`email` AND t.`password` <=> s.`password` AND t.`secondary_password` <=> s.`secondary_password` AND t.`status` <=> s.`status` AND t.`created_by` <=> s.`created_by` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`owner_backup` (`id`, `owner_code`, `name`, `email`, `password`, `secondary_password`, `status`, `created_by`, `created_at`)
SELECT s.`id`, s.`owner_code`, s.`name`, s.`email`, s.`password`, s.`secondary_password`, s.`status`, s.`created_by`, s.`created_at`
FROM `u857194726_count168`.`owner_backup` s;

-- Table `password_reset_tac`
SAVEPOINT before_password_reset_tac
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'password_reset_tac' AS table_name,
  JSON_OBJECT('email', s.`email`, 'company_id', s.`company_id`) AS pk_json
FROM `u857194726_count168`.`password_reset_tac` s
JOIN `c168_org`.`password_reset_tac` t ON t.`email` <=> s.`email` AND t.`company_id` <=> s.`company_id`
WHERE NOT (t.`email` <=> s.`email` AND t.`company_id` <=> s.`company_id` AND t.`code` <=> s.`code` AND t.`expires_at` <=> s.`expires_at` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`password_reset_tac` (`email`, `company_id`, `code`, `expires_at`, `created_at`)
SELECT s.`email`, s.`company_id`, s.`code`, s.`expires_at`, s.`created_at`
FROM `u857194726_count168`.`password_reset_tac` s;

-- Table `password_reset_tac_owner`
SAVEPOINT before_password_reset_tac_owner
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'password_reset_tac_owner' AS table_name,
  JSON_OBJECT('email', s.`email`, 'owner_id', s.`owner_id`) AS pk_json
FROM `u857194726_count168`.`password_reset_tac_owner` s
JOIN `c168_org`.`password_reset_tac_owner` t ON t.`email` <=> s.`email` AND t.`owner_id` <=> s.`owner_id`
WHERE NOT (t.`email` <=> s.`email` AND t.`owner_id` <=> s.`owner_id` AND t.`code` <=> s.`code` AND t.`expires_at` <=> s.`expires_at` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`password_reset_tac_owner` (`email`, `owner_id`, `code`, `expires_at`, `created_at`)
SELECT s.`email`, s.`owner_id`, s.`code`, s.`expires_at`, s.`created_at`
FROM `u857194726_count168`.`password_reset_tac_owner` s;

-- Table `process`
SAVEPOINT before_process
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'process' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`process` s
JOIN `c168_org`.`process` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`process_id` <=> s.`process_id` AND t.`description_id` <=> s.`description_id` AND t.`currency_id` <=> s.`currency_id` AND t.`remove_word` <=> s.`remove_word` AND t.`replace_word_from` <=> s.`replace_word_from` AND t.`replace_word_to` <=> s.`replace_word_to` AND t.`remark` <=> s.`remark` AND t.`status` <=> s.`status` AND t.`dts_modified` <=> s.`dts_modified` AND t.`modified_by` <=> s.`modified_by` AND t.`modified_by_type` <=> s.`modified_by_type` AND t.`modified_by_owner_id` <=> s.`modified_by_owner_id` AND t.`dts_created` <=> s.`dts_created` AND t.`created_by` <=> s.`created_by` AND t.`created_by_type` <=> s.`created_by_type` AND t.`created_by_owner_id` <=> s.`created_by_owner_id` AND t.`company_id` <=> s.`company_id` AND t.`sync_source_process_id` <=> s.`sync_source_process_id`);

INSERT IGNORE INTO `c168_org`.`process` (`id`, `process_id`, `description_id`, `currency_id`, `remove_word`, `replace_word_from`, `replace_word_to`, `remark`, `status`, `dts_modified`, `modified_by`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_type`, `created_by_owner_id`, `company_id`, `sync_source_process_id`)
SELECT s.`id`, s.`process_id`, s.`description_id`, s.`currency_id`, s.`remove_word`, s.`replace_word_from`, s.`replace_word_to`, s.`remark`, s.`status`, s.`dts_modified`, s.`modified_by`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_type`, s.`created_by_owner_id`, s.`company_id`, s.`sync_source_process_id`
FROM `u857194726_count168`.`process` s;

-- Table `process_accounting_due_dismissed`
SAVEPOINT before_process_accounting_due_dismissed
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'process_accounting_due_dismissed' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`process_accounting_due_dismissed` s
JOIN `c168_org`.`process_accounting_due_dismissed` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`process_id` <=> s.`process_id` AND t.`period_type` <=> s.`period_type` AND t.`anchor_date` <=> s.`anchor_date` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`process_accounting_due_dismissed` (`id`, `company_id`, `process_id`, `period_type`, `anchor_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`process_id`, s.`period_type`, s.`anchor_date`, s.`created_at`
FROM `u857194726_count168`.`process_accounting_due_dismissed` s;

-- Table `process_accounting_posted`
SAVEPOINT before_process_accounting_posted
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'process_accounting_posted' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`process_accounting_posted` s
JOIN `c168_org`.`process_accounting_posted` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`process_id` <=> s.`process_id` AND t.`posted_date` <=> s.`posted_date` AND t.`period_type` <=> s.`period_type` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`process_accounting_posted` (`id`, `company_id`, `process_id`, `posted_date`, `period_type`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`process_id`, s.`posted_date`, s.`period_type`, s.`created_at`
FROM `u857194726_count168`.`process_accounting_posted` s;

-- Table `process_backup`
SAVEPOINT before_process_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'process_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`process_backup` s
JOIN `c168_org`.`process_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`process_id` <=> s.`process_id` AND t.`description_id` <=> s.`description_id` AND t.`description_name` <=> s.`description_name` AND t.`currency_id` <=> s.`currency_id` AND t.`currency_name` <=> s.`currency_name` AND t.`remove_word` <=> s.`remove_word` AND t.`replace_word_from` <=> s.`replace_word_from` AND t.`replace_word_to` <=> s.`replace_word_to` AND t.`remark` <=> s.`remark` AND t.`status` <=> s.`status` AND t.`dts_modified` <=> s.`dts_modified` AND t.`modified_by` <=> s.`modified_by` AND t.`modified_name` <=> s.`modified_name` AND t.`modified_by_type` <=> s.`modified_by_type` AND t.`modified_by_owner_id` <=> s.`modified_by_owner_id` AND t.`dts_created` <=> s.`dts_created` AND t.`created_by` <=> s.`created_by` AND t.`created_by_type` <=> s.`created_by_type` AND t.`created_by_owner_id` <=> s.`created_by_owner_id` AND t.`created_name` <=> s.`created_name` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`sync_source_process_id` <=> s.`sync_source_process_id`);

INSERT IGNORE INTO `c168_org`.`process_backup` (`id`, `process_id`, `description_id`, `description_name`, `currency_id`, `currency_name`, `remove_word`, `replace_word_from`, `replace_word_to`, `remark`, `status`, `dts_modified`, `modified_by`, `modified_name`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_type`, `created_by_owner_id`, `created_name`, `company_id`, `company_name`, `sync_source_process_id`)
SELECT s.`id`, s.`process_id`, s.`description_id`, s.`description_name`, s.`currency_id`, s.`currency_name`, s.`remove_word`, s.`replace_word_from`, s.`replace_word_to`, s.`remark`, s.`status`, s.`dts_modified`, s.`modified_by`, s.`modified_name`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_type`, s.`created_by_owner_id`, s.`created_name`, s.`company_id`, s.`company_name`, s.`sync_source_process_id`
FROM `u857194726_count168`.`process_backup` s;

-- Table `process_day`
SAVEPOINT before_process_day
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'process_day' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`process_day` s
JOIN `c168_org`.`process_day` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`process_id` <=> s.`process_id` AND t.`day_id` <=> s.`day_id`);

INSERT IGNORE INTO `c168_org`.`process_day` (`id`, `process_id`, `day_id`)
SELECT s.`id`, s.`process_id`, s.`day_id`
FROM `u857194726_count168`.`process_day` s;

-- Table `process_day_backup`
SAVEPOINT before_process_day_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'process_day_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`process_day_backup` s
JOIN `c168_org`.`process_day_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`process_id` <=> s.`process_id` AND t.`day_id` <=> s.`day_id` AND t.`process_name` <=> s.`process_name` AND t.`day_name` <=> s.`day_name`);

INSERT IGNORE INTO `c168_org`.`process_day_backup` (`id`, `process_id`, `day_id`, `process_name`, `day_name`)
SELECT s.`id`, s.`process_id`, s.`day_id`, s.`process_name`, s.`day_name`
FROM `u857194726_count168`.`process_day_backup` s;

-- Table `role`
SAVEPOINT before_role
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'role' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`role` s
JOIN `c168_org`.`role` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`code` <=> s.`code`);

INSERT IGNORE INTO `c168_org`.`role` (`id`, `code`)
SELECT s.`id`, s.`code`
FROM `u857194726_count168`.`role` s;

-- Table `submitted_processes` (supplement: source lacks scope_type/scope_id)
-- Ref: database/migrations/20260605_submitted_processes_scope.sql
SAVEPOINT before_submitted_processes
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'submitted_processes' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`submitted_processes` s
JOIN `c168_org`.`submitted_processes` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> 'company' AND t.`scope_id` <=> s.`company_id` AND t.`user_id` <=> s.`user_id` AND t.`user_type` <=> s.`user_type` AND t.`process_id` <=> s.`process_id` AND t.`date_submitted` <=> s.`date_submitted` AND t.`capture_date` <=> s.`capture_date` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`submitted_processes` (`id`, `company_id`, `scope_type`, `scope_id`, `user_id`, `user_type`, `process_id`, `date_submitted`, `capture_date`, `created_at`)
SELECT s.`id`, s.`company_id`, 'company', s.`company_id`, s.`user_id`, s.`user_type`, s.`process_id`, s.`date_submitted`, s.`capture_date`, s.`created_at`
FROM `u857194726_count168`.`submitted_processes` s;

UPDATE `submitted_processes`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

-- Table `submitted_processes_backup`
SAVEPOINT before_submitted_processes_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'submitted_processes_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`submitted_processes_backup` s
JOIN `c168_org`.`submitted_processes_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`user_id` <=> s.`user_id` AND t.`user_name` <=> s.`user_name` AND t.`user_type` <=> s.`user_type` AND t.`process_id` <=> s.`process_id` AND t.`process_name` <=> s.`process_name` AND t.`date_submitted` <=> s.`date_submitted` AND t.`capture_date` <=> s.`capture_date` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`submitted_processes_backup` (`id`, `company_id`, `company_name`, `user_id`, `user_name`, `user_type`, `process_id`, `process_name`, `date_submitted`, `capture_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`user_id`, s.`user_name`, s.`user_type`, s.`process_id`, s.`process_name`, s.`date_submitted`, s.`capture_date`, s.`created_at`
FROM `u857194726_count168`.`submitted_processes_backup` s;

-- Table `tenant_module_policy`
SAVEPOINT before_tenant_module_policy
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'tenant_module_policy' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`tenant_module_policy` s
JOIN `c168_org`.`tenant_module_policy` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`module_key` <=> s.`module_key` AND t.`is_enabled` <=> s.`is_enabled` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`tenant_module_policy` (`id`, `scope_type`, `scope_id`, `module_key`, `is_enabled`, `created_at`, `updated_at`)
SELECT s.`id`, s.`scope_type`, s.`scope_id`, s.`module_key`, s.`is_enabled`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`tenant_module_policy` s;

-- Table `transactions`
SAVEPOINT before_transactions
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transactions' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`transactions` s
JOIN `c168_org`.`transactions` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`transaction_type` <=> s.`transaction_type` AND t.`account_id` <=> s.`account_id` AND t.`from_account_id` <=> s.`from_account_id` AND t.`currency_id` <=> s.`currency_id` AND t.`amount` <=> s.`amount` AND t.`transaction_date` <=> s.`transaction_date` AND t.`description` <=> s.`description` AND t.`sms` <=> s.`sms` AND t.`created_by` <=> s.`created_by` AND t.`created_by_owner` <=> s.`created_by_owner` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at` AND t.`approval_status` <=> s.`approval_status` AND t.`approved_by` <=> s.`approved_by` AND t.`approved_by_owner` <=> s.`approved_by_owner` AND t.`approved_at` <=> s.`approved_at` AND t.`source_bank_process_id` <=> s.`source_bank_process_id` AND t.`source_bank_process_period_type` <=> s.`source_bank_process_period_type`);

INSERT IGNORE INTO `c168_org`.`transactions` (`id`, `company_id`, `scope_type`, `scope_id`, `transaction_type`, `account_id`, `from_account_id`, `currency_id`, `amount`, `transaction_date`, `description`, `sms`, `created_by`, `created_by_owner`, `created_at`, `updated_at`, `approval_status`, `approved_by`, `approved_by_owner`, `approved_at`, `source_bank_process_id`, `source_bank_process_period_type`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`transaction_type`, s.`account_id`, s.`from_account_id`, s.`currency_id`, s.`amount`, s.`transaction_date`, s.`description`, s.`sms`, s.`created_by`, s.`created_by_owner`, s.`created_at`, s.`updated_at`, s.`approval_status`, s.`approved_by`, s.`approved_by_owner`, s.`approved_at`, s.`source_bank_process_id`, s.`source_bank_process_period_type`
FROM `u857194726_count168`.`transactions` s;

-- Table `transactions_backup`
SAVEPOINT before_transactions_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transactions_backup' AS table_name,
  JSON_OBJECT('backup_id', s.`backup_id`) AS pk_json
FROM `u857194726_count168`.`transactions_backup` s
JOIN `c168_org`.`transactions_backup` t ON t.`backup_id` <=> s.`backup_id`
WHERE NOT (t.`backup_id` <=> s.`backup_id` AND t.`id` <=> s.`id` AND t.`company_id` <=> s.`company_id` AND t.`transaction_type` <=> s.`transaction_type` AND t.`account_id` <=> s.`account_id` AND t.`from_account_id` <=> s.`from_account_id` AND t.`currency_id` <=> s.`currency_id` AND t.`amount` <=> s.`amount` AND t.`transaction_date` <=> s.`transaction_date` AND t.`description` <=> s.`description` AND t.`sms` <=> s.`sms` AND t.`created_by` <=> s.`created_by` AND t.`created_by_owner` <=> s.`created_by_owner` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at` AND t.`backup_created_at` <=> s.`backup_created_at`);

INSERT IGNORE INTO `c168_org`.`transactions_backup` (`backup_id`, `id`, `company_id`, `transaction_type`, `account_id`, `from_account_id`, `currency_id`, `amount`, `transaction_date`, `description`, `sms`, `created_by`, `created_by_owner`, `created_at`, `updated_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`transaction_type`, s.`account_id`, s.`from_account_id`, s.`currency_id`, s.`amount`, s.`transaction_date`, s.`description`, s.`sms`, s.`created_by`, s.`created_by_owner`, s.`created_at`, s.`updated_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transactions_backup` s;

-- Table `transactions_deleted`
SAVEPOINT before_transactions_deleted
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transactions_deleted' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`transactions_deleted` s
JOIN `c168_org`.`transactions_deleted` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`transaction_id` <=> s.`transaction_id` AND t.`company_id` <=> s.`company_id` AND t.`transaction_type` <=> s.`transaction_type` AND t.`account_id` <=> s.`account_id` AND t.`from_account_id` <=> s.`from_account_id` AND t.`amount` <=> s.`amount` AND t.`currency_id` <=> s.`currency_id` AND t.`transaction_date` <=> s.`transaction_date` AND t.`description` <=> s.`description` AND t.`sms` <=> s.`sms` AND t.`created_by` <=> s.`created_by` AND t.`created_by_owner` <=> s.`created_by_owner` AND t.`created_at` <=> s.`created_at` AND t.`deleted_by_user_id` <=> s.`deleted_by_user_id` AND t.`deleted_by_owner_id` <=> s.`deleted_by_owner_id` AND t.`deleted_at` <=> s.`deleted_at` AND t.`source_bank_process_id` <=> s.`source_bank_process_id` AND t.`source_bank_process_period_type` <=> s.`source_bank_process_period_type`);

INSERT IGNORE INTO `c168_org`.`transactions_deleted` (`id`, `transaction_id`, `company_id`, `transaction_type`, `account_id`, `from_account_id`, `amount`, `currency_id`, `transaction_date`, `description`, `sms`, `created_by`, `created_by_owner`, `created_at`, `deleted_by_user_id`, `deleted_by_owner_id`, `deleted_at`, `source_bank_process_id`, `source_bank_process_period_type`)
SELECT s.`id`, s.`transaction_id`, s.`company_id`, s.`transaction_type`, s.`account_id`, s.`from_account_id`, s.`amount`, s.`currency_id`, s.`transaction_date`, s.`description`, s.`sms`, s.`created_by`, s.`created_by_owner`, s.`created_at`, s.`deleted_by_user_id`, s.`deleted_by_owner_id`, s.`deleted_at`, s.`source_bank_process_id`, s.`source_bank_process_period_type`
FROM `u857194726_count168`.`transactions_deleted` s;

-- Table `transactions_rate`
SAVEPOINT before_transactions_rate
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transactions_rate' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`transactions_rate` s
JOIN `c168_org`.`transactions_rate` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`transaction_id` <=> s.`transaction_id` AND t.`company_id` <=> s.`company_id` AND t.`rate_group_id` <=> s.`rate_group_id` AND t.`rate_from_account_id` <=> s.`rate_from_account_id` AND t.`rate_to_account_id` <=> s.`rate_to_account_id` AND t.`rate_from_currency_id` <=> s.`rate_from_currency_id` AND t.`rate_from_amount` <=> s.`rate_from_amount` AND t.`rate_to_currency_id` <=> s.`rate_to_currency_id` AND t.`rate_to_amount` <=> s.`rate_to_amount` AND t.`exchange_rate` <=> s.`exchange_rate` AND t.`rate_transfer_from_account_id` <=> s.`rate_transfer_from_account_id` AND t.`rate_transfer_to_account_id` <=> s.`rate_transfer_to_account_id` AND t.`rate_transfer_from_amount` <=> s.`rate_transfer_from_amount` AND t.`rate_transfer_to_amount` <=> s.`rate_transfer_to_amount` AND t.`rate_middleman_account_id` <=> s.`rate_middleman_account_id` AND t.`rate_middleman_rate` <=> s.`rate_middleman_rate` AND t.`rate_middleman_amount` <=> s.`rate_middleman_amount` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`transactions_rate` (`id`, `transaction_id`, `company_id`, `rate_group_id`, `rate_from_account_id`, `rate_to_account_id`, `rate_from_currency_id`, `rate_from_amount`, `rate_to_currency_id`, `rate_to_amount`, `exchange_rate`, `rate_transfer_from_account_id`, `rate_transfer_to_account_id`, `rate_transfer_from_amount`, `rate_transfer_to_amount`, `rate_middleman_account_id`, `rate_middleman_rate`, `rate_middleman_amount`, `created_at`, `updated_at`)
SELECT s.`id`, s.`transaction_id`, s.`company_id`, s.`rate_group_id`, s.`rate_from_account_id`, s.`rate_to_account_id`, s.`rate_from_currency_id`, s.`rate_from_amount`, s.`rate_to_currency_id`, s.`rate_to_amount`, s.`exchange_rate`, s.`rate_transfer_from_account_id`, s.`rate_transfer_to_account_id`, s.`rate_transfer_from_amount`, s.`rate_transfer_to_amount`, s.`rate_middleman_account_id`, s.`rate_middleman_rate`, s.`rate_middleman_amount`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`transactions_rate` s;

-- Table `transactions_rate_backup`
SAVEPOINT before_transactions_rate_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transactions_rate_backup' AS table_name,
  JSON_OBJECT('backup_id', s.`backup_id`) AS pk_json
FROM `u857194726_count168`.`transactions_rate_backup` s
JOIN `c168_org`.`transactions_rate_backup` t ON t.`backup_id` <=> s.`backup_id`
WHERE NOT (t.`backup_id` <=> s.`backup_id` AND t.`id` <=> s.`id` AND t.`transaction_id` <=> s.`transaction_id` AND t.`company_id` <=> s.`company_id` AND t.`rate_group_id` <=> s.`rate_group_id` AND t.`rate_from_account_id` <=> s.`rate_from_account_id` AND t.`rate_to_account_id` <=> s.`rate_to_account_id` AND t.`rate_from_currency_id` <=> s.`rate_from_currency_id` AND t.`rate_from_amount` <=> s.`rate_from_amount` AND t.`rate_to_currency_id` <=> s.`rate_to_currency_id` AND t.`rate_to_amount` <=> s.`rate_to_amount` AND t.`exchange_rate` <=> s.`exchange_rate` AND t.`rate_transfer_from_account_id` <=> s.`rate_transfer_from_account_id` AND t.`rate_transfer_to_account_id` <=> s.`rate_transfer_to_account_id` AND t.`rate_transfer_from_amount` <=> s.`rate_transfer_from_amount` AND t.`rate_transfer_to_amount` <=> s.`rate_transfer_to_amount` AND t.`rate_middleman_account_id` <=> s.`rate_middleman_account_id` AND t.`rate_middleman_rate` <=> s.`rate_middleman_rate` AND t.`rate_middleman_amount` <=> s.`rate_middleman_amount` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at` AND t.`backup_created_at` <=> s.`backup_created_at`);

INSERT IGNORE INTO `c168_org`.`transactions_rate_backup` (`backup_id`, `id`, `transaction_id`, `company_id`, `rate_group_id`, `rate_from_account_id`, `rate_to_account_id`, `rate_from_currency_id`, `rate_from_amount`, `rate_to_currency_id`, `rate_to_amount`, `exchange_rate`, `rate_transfer_from_account_id`, `rate_transfer_to_account_id`, `rate_transfer_from_amount`, `rate_transfer_to_amount`, `rate_middleman_account_id`, `rate_middleman_rate`, `rate_middleman_amount`, `created_at`, `updated_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`transaction_id`, s.`company_id`, s.`rate_group_id`, s.`rate_from_account_id`, s.`rate_to_account_id`, s.`rate_from_currency_id`, s.`rate_from_amount`, s.`rate_to_currency_id`, s.`rate_to_amount`, s.`exchange_rate`, s.`rate_transfer_from_account_id`, s.`rate_transfer_to_account_id`, s.`rate_transfer_from_amount`, s.`rate_transfer_to_amount`, s.`rate_middleman_account_id`, s.`rate_middleman_rate`, s.`rate_middleman_amount`, s.`created_at`, s.`updated_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transactions_rate_backup` s;

-- Table `transactions_rate_details`
SAVEPOINT before_transactions_rate_details
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transactions_rate_details' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`transactions_rate_details` s
JOIN `c168_org`.`transactions_rate_details` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`rate_group_id` <=> s.`rate_group_id` AND t.`transaction_id` <=> s.`transaction_id` AND t.`company_id` <=> s.`company_id` AND t.`record_type` <=> s.`record_type` AND t.`account_id` <=> s.`account_id` AND t.`from_account_id` <=> s.`from_account_id` AND t.`amount` <=> s.`amount` AND t.`currency_id` <=> s.`currency_id` AND t.`description` <=> s.`description` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`transactions_rate_details` (`id`, `rate_group_id`, `transaction_id`, `company_id`, `record_type`, `account_id`, `from_account_id`, `amount`, `currency_id`, `description`, `created_at`)
SELECT s.`id`, s.`rate_group_id`, s.`transaction_id`, s.`company_id`, s.`record_type`, s.`account_id`, s.`from_account_id`, s.`amount`, s.`currency_id`, s.`description`, s.`created_at`
FROM `u857194726_count168`.`transactions_rate_details` s;

-- Table `transactions_rate_details_backup`
SAVEPOINT before_transactions_rate_details_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transactions_rate_details_backup' AS table_name,
  JSON_OBJECT('backup_id', s.`backup_id`) AS pk_json
FROM `u857194726_count168`.`transactions_rate_details_backup` s
JOIN `c168_org`.`transactions_rate_details_backup` t ON t.`backup_id` <=> s.`backup_id`
WHERE NOT (t.`backup_id` <=> s.`backup_id` AND t.`id` <=> s.`id` AND t.`rate_group_id` <=> s.`rate_group_id` AND t.`transaction_id` <=> s.`transaction_id` AND t.`company_id` <=> s.`company_id` AND t.`record_type` <=> s.`record_type` AND t.`account_id` <=> s.`account_id` AND t.`from_account_id` <=> s.`from_account_id` AND t.`amount` <=> s.`amount` AND t.`currency_id` <=> s.`currency_id` AND t.`description` <=> s.`description` AND t.`created_at` <=> s.`created_at` AND t.`backup_created_at` <=> s.`backup_created_at`);

INSERT IGNORE INTO `c168_org`.`transactions_rate_details_backup` (`backup_id`, `id`, `rate_group_id`, `transaction_id`, `company_id`, `record_type`, `account_id`, `from_account_id`, `amount`, `currency_id`, `description`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`rate_group_id`, s.`transaction_id`, s.`company_id`, s.`record_type`, s.`account_id`, s.`from_account_id`, s.`amount`, s.`currency_id`, s.`description`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transactions_rate_details_backup` s;

-- Table `transaction_entry`
SAVEPOINT before_transaction_entry
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transaction_entry' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`transaction_entry` s
JOIN `c168_org`.`transaction_entry` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`header_id` <=> s.`header_id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id` AND t.`account_id` <=> s.`account_id` AND t.`currency_id` <=> s.`currency_id` AND t.`amount` <=> s.`amount` AND t.`entry_type` <=> s.`entry_type` AND t.`description` <=> s.`description` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`transaction_entry` (`id`, `header_id`, `company_id`, `scope_type`, `scope_id`, `account_id`, `currency_id`, `amount`, `entry_type`, `description`, `created_at`)
SELECT s.`id`, s.`header_id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`account_id`, s.`currency_id`, s.`amount`, s.`entry_type`, s.`description`, s.`created_at`
FROM `u857194726_count168`.`transaction_entry` s;

-- Table `transaction_entry_backup`
SAVEPOINT before_transaction_entry_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'transaction_entry_backup' AS table_name,
  JSON_OBJECT('backup_id', s.`backup_id`) AS pk_json
FROM `u857194726_count168`.`transaction_entry_backup` s
JOIN `c168_org`.`transaction_entry_backup` t ON t.`backup_id` <=> s.`backup_id`
WHERE NOT (t.`backup_id` <=> s.`backup_id` AND t.`id` <=> s.`id` AND t.`header_id` <=> s.`header_id` AND t.`company_id` <=> s.`company_id` AND t.`account_id` <=> s.`account_id` AND t.`currency_id` <=> s.`currency_id` AND t.`amount` <=> s.`amount` AND t.`entry_type` <=> s.`entry_type` AND t.`description` <=> s.`description` AND t.`created_at` <=> s.`created_at` AND t.`backup_created_at` <=> s.`backup_created_at`);

INSERT IGNORE INTO `c168_org`.`transaction_entry_backup` (`backup_id`, `id`, `header_id`, `company_id`, `account_id`, `currency_id`, `amount`, `entry_type`, `description`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`header_id`, s.`company_id`, s.`account_id`, s.`currency_id`, s.`amount`, s.`entry_type`, s.`description`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transaction_entry_backup` s;

-- Table `user`
SAVEPOINT before_user
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'user' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`user` s
JOIN `c168_org`.`user` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`login_id` <=> s.`login_id` AND t.`name` <=> s.`name` AND t.`password` <=> s.`password` AND t.`secondary_password` <=> s.`secondary_password` AND t.`email` <=> s.`email` AND t.`role` <=> s.`role` AND t.`permissions` <=> s.`permissions` AND t.`status` <=> s.`status` AND t.`created_by` <=> s.`created_by` AND t.`created_at` <=> s.`created_at` AND t.`last_login` <=> s.`last_login` AND t.`remember_token` <=> s.`remember_token` AND t.`remember_token_expires` <=> s.`remember_token_expires` AND t.`read_only` <=> s.`read_only`);

INSERT IGNORE INTO `c168_org`.`user` (`id`, `login_id`, `name`, `password`, `secondary_password`, `email`, `role`, `permissions`, `status`, `created_by`, `created_at`, `last_login`, `remember_token`, `remember_token_expires`, `read_only`)
SELECT s.`id`, s.`login_id`, s.`name`, s.`password`, s.`secondary_password`, s.`email`, s.`role`, s.`permissions`, s.`status`, s.`created_by`, s.`created_at`, s.`last_login`, s.`remember_token`, s.`remember_token_expires`, s.`read_only`
FROM `u857194726_count168`.`user` s;

-- Table `user_backup`
SAVEPOINT before_user_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'user_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`user_backup` s
JOIN `c168_org`.`user_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`login_id` <=> s.`login_id` AND t.`name` <=> s.`name` AND t.`password` <=> s.`password` AND t.`secondary_password` <=> s.`secondary_password` AND t.`email` <=> s.`email` AND t.`role` <=> s.`role` AND t.`permissions` <=> s.`permissions` AND t.`status` <=> s.`status` AND t.`created_by` <=> s.`created_by` AND t.`created_at` <=> s.`created_at` AND t.`last_login` <=> s.`last_login` AND t.`remember_token` <=> s.`remember_token` AND t.`remember_token_expires` <=> s.`remember_token_expires` AND t.`read_only` <=> s.`read_only`);

INSERT IGNORE INTO `c168_org`.`user_backup` (`id`, `login_id`, `name`, `password`, `secondary_password`, `email`, `role`, `permissions`, `status`, `created_by`, `created_at`, `last_login`, `remember_token`, `remember_token_expires`, `read_only`)
SELECT s.`id`, s.`login_id`, s.`name`, s.`password`, s.`secondary_password`, s.`email`, s.`role`, s.`permissions`, s.`status`, s.`created_by`, s.`created_at`, s.`last_login`, s.`remember_token`, s.`remember_token_expires`, s.`read_only`
FROM `u857194726_count168`.`user_backup` s;

-- Table `user_company_map`
SAVEPOINT before_user_company_map
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'user_company_map' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`user_company_map` s
JOIN `c168_org`.`user_company_map` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`user_id` <=> s.`user_id` AND t.`company_id` <=> s.`company_id` AND t.`scope_type` <=> s.`scope_type` AND t.`scope_id` <=> s.`scope_id`);

INSERT IGNORE INTO `c168_org`.`user_company_map` (`id`, `user_id`, `company_id`, `scope_type`, `scope_id`)
SELECT s.`id`, s.`user_id`, s.`company_id`, s.`scope_type`, s.`scope_id`
FROM `u857194726_count168`.`user_company_map` s;

-- Table `user_company_map_backup`
SAVEPOINT before_user_company_map_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'user_company_map_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`user_company_map_backup` s
JOIN `c168_org`.`user_company_map_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`user_id` <=> s.`user_id` AND t.`user_name` <=> s.`user_name` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name`);

INSERT IGNORE INTO `c168_org`.`user_company_map_backup` (`id`, `user_id`, `user_name`, `company_id`, `company_name`)
SELECT s.`id`, s.`user_id`, s.`user_name`, s.`company_id`, s.`company_name`
FROM `u857194726_count168`.`user_company_map_backup` s;

-- Table `user_company_permissions`
SAVEPOINT before_user_company_permissions
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'user_company_permissions' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`user_company_permissions` s
JOIN `c168_org`.`user_company_permissions` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`user_id` <=> s.`user_id` AND t.`company_id` <=> s.`company_id` AND t.`account_permissions` <=> s.`account_permissions` AND t.`process_permissions` <=> s.`process_permissions` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`user_company_permissions` (`id`, `user_id`, `company_id`, `account_permissions`, `process_permissions`, `created_at`, `updated_at`)
SELECT s.`id`, s.`user_id`, s.`company_id`, s.`account_permissions`, s.`process_permissions`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`user_company_permissions` s;

-- Table `user_company_permission_backup`
SAVEPOINT before_user_company_permission_backup
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'user_company_permission_backup' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`user_company_permission_backup` s
JOIN `c168_org`.`user_company_permission_backup` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`user_id` <=> s.`user_id` AND t.`user_name` <=> s.`user_name` AND t.`company_id` <=> s.`company_id` AND t.`company_name` <=> s.`company_name` AND t.`account_permissions` <=> s.`account_permissions` AND t.`process_permissions` <=> s.`process_permissions` AND t.`created_at` <=> s.`created_at` AND t.`updated_at` <=> s.`updated_at`);

INSERT IGNORE INTO `c168_org`.`user_company_permission_backup` (`id`, `user_id`, `user_name`, `company_id`, `company_name`, `account_permissions`, `process_permissions`, `created_at`, `updated_at`)
SELECT s.`id`, s.`user_id`, s.`user_name`, s.`company_id`, s.`company_name`, s.`account_permissions`, s.`process_permissions`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`user_company_permission_backup` s;

-- Table `user_group_map`
SAVEPOINT before_user_group_map
INSERT INTO `merge_conflict_log` (`table_name`, `pk_json`)
SELECT
  'user_group_map' AS table_name,
  JSON_OBJECT('id', s.`id`) AS pk_json
FROM `u857194726_count168`.`user_group_map` s
JOIN `c168_org`.`user_group_map` t ON t.`id` <=> s.`id`
WHERE NOT (t.`id` <=> s.`id` AND t.`user_id` <=> s.`user_id` AND t.`group_id` <=> s.`group_id` AND t.`created_at` <=> s.`created_at`);

INSERT IGNORE INTO `c168_org`.`user_group_map` (`id`, `user_id`, `group_id`, `created_at`)
SELECT s.`id`, s.`user_id`, s.`group_id`, s.`created_at`
FROM `u857194726_count168`.`user_group_map` s;

-- Optional but recommended for .com -> .org imports:
-- Backfill scope_id on data_capture_templates to avoid Formula Maintenance hidden rows.
CREATE TABLE IF NOT EXISTS `data_capture_templates_scope_backup_merge` AS
SELECT `id`, `company_id`, `scope_type`, `scope_id`, `process_id`
FROM `data_capture_templates`;

UPDATE `data_capture_templates`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

-- Post-backfill quick check (should be 0 rows in most cases):
SELECT `company_id`, COUNT(*) AS cnt
FROM `data_capture_templates`
WHERE `scope_id` IS NULL AND `company_id` IS NOT NULL
GROUP BY `company_id`
ORDER BY cnt DESC;

-- Review conflict rows before COMMIT:
SELECT `table_name`, COUNT(*) AS conflict_count
FROM `merge_conflict_log`
GROUP BY `table_name`
ORDER BY conflict_count DESC;

-- If conflict_count is acceptable:
COMMIT;
-- If not acceptable, rollback instead:
-- ROLLBACK TO SAVEPOINT merge_begin;
-- ROLLBACK;

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;

-- Metadata:
-- Merged tables: 83 (includes submitted_processes supplement)
-- Skipped tables: 7
--   skip: account_currency_display_order_backup (no primary key)
--   skip: account_link_backup (no primary key)
--   skip: company_auto_renew_request (column set differs)
--   skip: domain_list_fee_settings (column set differs)
--   skip: system_it_allowlist (missing in target)
--   skip: system_runtime_flags (missing in target)
--   skip: transaction_full_details_with_rate (missing in target)
