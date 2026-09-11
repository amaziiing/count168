-- Full replace script: source (.com) overwrites target (.org)
-- Strategy: TRUNCATE target table, INSERT all rows from source.
-- Target-only columns get derived defaults (scope_type/scope_id from company_id).
--
-- Source DB: `u857194726_count168`
-- Target DB: `c168_org`
-- WARNING: This destroys all existing target data in copied tables.

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO';
SET AUTOCOMMIT=0;
START TRANSACTION;
SAVEPOINT replace_begin;

USE `c168_org`;

-- Table `account`
TRUNCATE TABLE `c168_org`.`account`;
INSERT INTO `c168_org`.`account` (`id`, `account_id`, `name`, `status`, `created_source`, `last_login`, `role`, `password`, `payment_alert`, `alert_day`, `alert_specific_date`, `alert_amount`, `remark`)
SELECT s.`id`, s.`account_id`, s.`name`, s.`status`, s.`created_source`, s.`last_login`, s.`role`, s.`password`, s.`payment_alert`, s.`alert_day`, s.`alert_specific_date`, s.`alert_amount`, s.`remark`
FROM `u857194726_count168`.`account` s;

-- Table `account_backup`
TRUNCATE TABLE `c168_org`.`account_backup`;
INSERT INTO `c168_org`.`account_backup` (`id`, `account_id`, `name`, `status`, `created_source`, `last_login`, `role`, `password`, `payment_alert`, `alert_day`, `alert_specific_date`, `alert_amount`, `remark`)
SELECT s.`id`, s.`account_id`, s.`name`, s.`status`, s.`created_source`, s.`last_login`, s.`role`, s.`password`, s.`payment_alert`, s.`alert_day`, s.`alert_specific_date`, s.`alert_amount`, s.`remark`
FROM `u857194726_count168`.`account_backup` s;

-- Table `account_company`
TRUNCATE TABLE `c168_org`.`account_company`;
INSERT INTO `c168_org`.`account_company` (`id`, `account_id`, `company_id`, `scope_type`, `scope_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_company` s;

-- Table `account_company_backup`
TRUNCATE TABLE `c168_org`.`account_company_backup`;
INSERT INTO `c168_org`.`account_company_backup` (`id`, `account_id`, `account_name`, `company_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`account_name`, s.`company_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_company_backup` s;

-- Table `account_currency`
TRUNCATE TABLE `c168_org`.`account_currency`;
INSERT INTO `c168_org`.`account_currency` (`id`, `account_id`, `currency_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`currency_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_currency` s;

-- Table `account_currency_backup`
TRUNCATE TABLE `c168_org`.`account_currency_backup`;
INSERT INTO `c168_org`.`account_currency_backup` (`id`, `account_id`, `account_name`, `currency_id`, `currency_name`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`account_name`, s.`currency_id`, s.`currency_name`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_currency_backup` s;

-- Table `account_currency_display_order`
TRUNCATE TABLE `c168_org`.`account_currency_display_order`;
INSERT INTO `c168_org`.`account_currency_display_order` (`id`, `account_id`, `currency_order`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`currency_order`, s.`updated_at`
FROM `u857194726_count168`.`account_currency_display_order` s;

-- Table `account_currency_display_order_backup`
TRUNCATE TABLE `c168_org`.`account_currency_display_order_backup`;
INSERT INTO `c168_org`.`account_currency_display_order_backup` (`id`, `account_id`, `account_name`, `currency_order`, `updated_at`)
SELECT s.`id`, s.`account_id`, s.`account_name`, s.`currency_order`, s.`updated_at`
FROM `u857194726_count168`.`account_currency_display_order_backup` s;

-- Table `account_link`
TRUNCATE TABLE `c168_org`.`account_link`;
INSERT INTO `c168_org`.`account_link` (`id`, `account_id_1`, `account_id_2`, `company_id`, `link_type`, `source_account_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id_1`, s.`account_id_2`, s.`company_id`, s.`link_type`, s.`source_account_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_link` s;

-- Table `account_link_backup`
TRUNCATE TABLE `c168_org`.`account_link_backup`;
INSERT INTO `c168_org`.`account_link_backup` (`id`, `account_id_1`, `account_name_1`, `account_id_2`, `account_name_2`, `company_id`, `company_name`, `link_type`, `source_account_id`, `created_at`, `updated_at`)
SELECT s.`id`, s.`account_id_1`, s.`account_name_1`, s.`account_id_2`, s.`account_name_2`, s.`company_id`, s.`company_name`, s.`link_type`, s.`source_account_id`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`account_link_backup` s;

-- Table `announcements`
TRUNCATE TABLE `c168_org`.`announcements`;
INSERT INTO `c168_org`.`announcements` (`id`, `title`, `content`, `company_code`, `status`, `created_by`, `user_type`, `created_at`, `updated_at`)
SELECT s.`id`, s.`title`, s.`content`, s.`company_code`, s.`status`, s.`created_by`, s.`user_type`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`announcements` s;

-- Table `auto_login_credentials`
TRUNCATE TABLE `c168_org`.`auto_login_credentials`;
INSERT INTO `c168_org`.`auto_login_credentials` (`id`, `company_id`, `name`, `website_url`, `username`, `encrypted_password`, `encryption_key`, `has_2fa`, `encrypted_2fa_code`, `two_fa_type`, `two_fa_instructions`, `auto_import_enabled`, `report_page_url`, `import_process_id`, `import_capture_date`, `import_currency_id`, `import_field_mapping`, `status`, `remark`, `last_executed`, `last_result`, `created_at`, `updated_at`, `created_by`)
SELECT s.`id`, s.`company_id`, s.`name`, s.`website_url`, s.`username`, s.`encrypted_password`, s.`encryption_key`, s.`has_2fa`, s.`encrypted_2fa_code`, s.`two_fa_type`, s.`two_fa_instructions`, s.`auto_import_enabled`, s.`report_page_url`, s.`import_process_id`, s.`import_capture_date`, s.`import_currency_id`, s.`import_field_mapping`, s.`status`, s.`remark`, s.`last_executed`, s.`last_result`, s.`created_at`, s.`updated_at`, s.`created_by`
FROM `u857194726_count168`.`auto_login_credentials` s;

-- Table `bank_process`
TRUNCATE TABLE `c168_org`.`bank_process`;
INSERT INTO `c168_org`.`bank_process` (`id`, `company_id`, `country`, `bank`, `type`, `name`, `card_merchant_id`, `customer_id`, `profit_account_id`, `contract`, `insurance`, `sop`, `remark`, `cost`, `price`, `profit`, `profit_sharing`, `day_start`, `day_start_frequency`, `day_end`, `day_end_monthly_cap_enabled`, `status`, `issue_flag`, `dts_modified`, `modified_by`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_type`, `created_by_owner_id`, `accounting_resend_relax_created_floor`, `accounting_resend_schedule_day_start`, `accounting_resend_schedule_day_end`, `accounting_resend_schedule_frequency`)
SELECT s.`id`, s.`company_id`, s.`country`, s.`bank`, s.`type`, s.`name`, s.`card_merchant_id`, s.`customer_id`, s.`profit_account_id`, s.`contract`, s.`insurance`, s.`sop`, s.`remark`, s.`cost`, s.`price`, s.`profit`, s.`profit_sharing`, s.`day_start`, s.`day_start_frequency`, s.`day_end`, s.`day_end_monthly_cap_enabled`, s.`status`, s.`issue_flag`, s.`dts_modified`, s.`modified_by`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_type`, s.`created_by_owner_id`, s.`accounting_resend_relax_created_floor`, s.`accounting_resend_schedule_day_start`, s.`accounting_resend_schedule_day_end`, s.`accounting_resend_schedule_frequency`
FROM `u857194726_count168`.`bank_process` s;

-- Table `bank_process_accounting_resend_daily_guard`
TRUNCATE TABLE `c168_org`.`bank_process_accounting_resend_daily_guard`;
INSERT INTO `c168_org`.`bank_process_accounting_resend_daily_guard` (`id`, `company_id`, `bank_process_id`, `resend_day_start`, `guard_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`bank_process_id`, s.`resend_day_start`, s.`guard_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard` s;

-- Table `bank_process_accounting_resend_daily_guard_backup`
TRUNCATE TABLE `c168_org`.`bank_process_accounting_resend_daily_guard_backup`;
INSERT INTO `c168_org`.`bank_process_accounting_resend_daily_guard_backup` (`id`, `company_id`, `company_name`, `bank_process_id`, `bank_process_name`, `resend_day_start`, `guard_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`bank_process_id`, s.`bank_process_name`, s.`resend_day_start`, s.`guard_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard_backup` s;

-- Table `bank_process_backup`
TRUNCATE TABLE `c168_org`.`bank_process_backup`;
INSERT INTO `c168_org`.`bank_process_backup` (`id`, `company_id`, `company_name`, `country`, `bank`, `type`, `name`, `card_merchant_id`, `card_merchant_name`, `customer_id`, `customer_name`, `profit_account_id`, `profit_account_name`, `contract`, `insurance`, `sop`, `remark`, `cost`, `price`, `profit`, `profit_sharing`, `day_start`, `day_start_frequency`, `day_end`, `status`, `issue_flag`, `dts_modified`, `modified_by`, `modified_by_name`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_name`, `created_by_type`, `created_by_owner_id`, `accounting_resend_relax_created_floor`, `accounting_resend_schedule_day_start`, `accounting_resend_schedule_day_end`, `accounting_resend_schedule_frequency`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`country`, s.`bank`, s.`type`, s.`name`, s.`card_merchant_id`, s.`card_merchant_name`, s.`customer_id`, s.`customer_name`, s.`profit_account_id`, s.`profit_account_name`, s.`contract`, s.`insurance`, s.`sop`, s.`remark`, s.`cost`, s.`price`, s.`profit`, s.`profit_sharing`, s.`day_start`, s.`day_start_frequency`, s.`day_end`, s.`status`, s.`issue_flag`, s.`dts_modified`, s.`modified_by`, s.`modified_by_name`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_name`, s.`created_by_type`, s.`created_by_owner_id`, s.`accounting_resend_relax_created_floor`, s.`accounting_resend_schedule_day_start`, s.`accounting_resend_schedule_day_end`, s.`accounting_resend_schedule_frequency`
FROM `u857194726_count168`.`bank_process_backup` s;

-- Table `bank_process_maintenance_resend_pending`
TRUNCATE TABLE `c168_org`.`bank_process_maintenance_resend_pending`;
INSERT INTO `c168_org`.`bank_process_maintenance_resend_pending` (`id`, `company_id`, `bank_process_id`, `process_accounting_posted_id`, `period_type`, `transaction_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`bank_process_id`, s.`process_accounting_posted_id`, s.`period_type`, s.`transaction_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_maintenance_resend_pending` s;

-- Table `bank_process_maintenance_resend_pending_backup`
TRUNCATE TABLE `c168_org`.`bank_process_maintenance_resend_pending_backup`;
INSERT INTO `c168_org`.`bank_process_maintenance_resend_pending_backup` (`id`, `company_id`, `company_name`, `bank_process_id`, `bank_process_name`, `process_accounting_posted_id`, `period_type`, `transaction_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`bank_process_id`, s.`bank_process_name`, s.`process_accounting_posted_id`, s.`period_type`, s.`transaction_date`, s.`created_at`
FROM `u857194726_count168`.`bank_process_maintenance_resend_pending_backup` s;

-- Table `company`
TRUNCATE TABLE `c168_org`.`company`;
INSERT INTO `c168_org`.`company` (`id`, `company_id`, `owner_id`, `created_by`, `created_at`, `expiration_date`, `domain_billing_period`, `permissions`, `fee_share_allocations`, `group_id`, `auto_renew_enabled`, `auto_renew_period`, `payment_customer_id`, `payment_subscription_id`, `auto_renew_updated_at`, `auto_renew_updated_by`)
SELECT s.`id`, s.`company_id`, s.`owner_id`, s.`created_by`, s.`created_at`, s.`expiration_date`, s.`domain_billing_period`, s.`permissions`, s.`fee_share_allocations`, s.`group_id`, s.`auto_renew_enabled`, s.`auto_renew_period`, s.`payment_customer_id`, s.`payment_subscription_id`, s.`auto_renew_updated_at`, s.`auto_renew_updated_by`
FROM `u857194726_count168`.`company` s;

-- Table `company_auto_renew_request`
TRUNCATE TABLE `c168_org`.`company_auto_renew_request`;
INSERT INTO `c168_org`.`company_auto_renew_request` (`id`, `entity_type`, `company_id`, `group_id`, `expiration_snapshot`, `status`, `period`, `price`, `from_account_id`, `to_account_id`, `transaction_id`, `new_expiration_date`, `processed_by`, `processed_at`, `reject_reason`, `created_at`, `updated_at`)
SELECT s.`id`, 'company' AS `entity_type`, s.`company_id`, NULL AS `group_id`, s.`expiration_snapshot`, s.`status`, s.`period`, s.`price`, s.`from_account_id`, s.`to_account_id`, s.`transaction_id`, s.`new_expiration_date`, s.`processed_by`, s.`processed_at`, s.`reject_reason`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`company_auto_renew_request` s;

-- Table `company_backup`
TRUNCATE TABLE `c168_org`.`company_backup`;
INSERT INTO `c168_org`.`company_backup` (`id`, `company_id`, `owner_id`, `owner_name`, `created_by`, `created_at`, `expiration_date`, `permissions`, `fee_share_allocations`, `group_id`)
SELECT s.`id`, s.`company_id`, s.`owner_id`, s.`owner_name`, s.`created_by`, s.`created_at`, s.`expiration_date`, s.`permissions`, s.`fee_share_allocations`, s.`group_id`
FROM `u857194726_count168`.`company_backup` s;

-- Table `company_countries`
TRUNCATE TABLE `c168_org`.`company_countries`;
INSERT INTO `c168_org`.`company_countries` (`id`, `company_id`, `country`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`country`, s.`created_at`
FROM `u857194726_count168`.`company_countries` s;

-- Table `company_countries_backup`
TRUNCATE TABLE `c168_org`.`company_countries_backup`;
INSERT INTO `c168_org`.`company_countries_backup` (`id`, `company_id`, `company_name`, `country`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`country`, s.`created_at`
FROM `u857194726_count168`.`company_countries_backup` s;

-- Table `company_deletion_archive`
TRUNCATE TABLE `c168_org`.`company_deletion_archive`;
INSERT INTO `c168_org`.`company_deletion_archive` (`id`, `company_db_id`, `company_code`, `owner_id`, `owner_code`, `owner_name`, `group_id`, `deleted_by_user_id`, `deleted_by_owner_id`, `deleted_by_login`, `deleted_at`, `restored_at`, `restored_by_login`, `status`, `row_counts`, `payload`)
SELECT s.`id`, s.`company_db_id`, s.`company_code`, s.`owner_id`, s.`owner_code`, s.`owner_name`, s.`group_id`, s.`deleted_by_user_id`, s.`deleted_by_owner_id`, s.`deleted_by_login`, s.`deleted_at`, s.`restored_at`, s.`restored_by_login`, s.`status`, s.`row_counts`, s.`payload`
FROM `u857194726_count168`.`company_deletion_archive` s;

-- Table `company_ownership`
TRUNCATE TABLE `c168_org`.`company_ownership`;
INSERT INTO `c168_org`.`company_ownership` (`id`, `company_id`, `entity_type`, `account_id`, `group_id`, `owner_type`, `percentage`, `created_at`, `include_group`, `partner_group_id`, `read_only`)
SELECT s.`id`, s.`company_id`, s.`entity_type`, s.`account_id`, s.`group_id`, s.`owner_type`, s.`percentage`, s.`created_at`, s.`include_group`, s.`partner_group_id`, s.`read_only`
FROM `u857194726_count168`.`company_ownership` s;

-- Table `company_ownership_backup`
TRUNCATE TABLE `c168_org`.`company_ownership_backup`;
INSERT INTO `c168_org`.`company_ownership_backup` (`id`, `company_id`, `company_name`, `entity_type`, `account_id`, `account_name`, `group_id`, `include_group`, `partner_group`, `owner_type`, `percentage`, `read_only`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`entity_type`, s.`account_id`, s.`account_name`, s.`group_id`, s.`include_group`, s.`partner_group`, s.`owner_type`, s.`percentage`, s.`read_only`, s.`created_at`
FROM `u857194726_count168`.`company_ownership_backup` s;

-- Table `company_ownership_history`
TRUNCATE TABLE `c168_org`.`company_ownership_history`;
INSERT INTO `c168_org`.`company_ownership_history` (`id`, `company_id`, `effective_month`, `account_id`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `saved_by`, `saved_at`)
SELECT s.`id`, s.`company_id`, s.`effective_month`, s.`account_id`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`saved_by`, s.`saved_at`
FROM `u857194726_count168`.`company_ownership_history` s;

-- Table `company_selected_bank_backup`
TRUNCATE TABLE `c168_org`.`company_selected_bank_backup`;
INSERT INTO `c168_org`.`company_selected_bank_backup` (`company_id`, `country`, `bank`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`bank`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_bank_backup` s;

-- Table `company_selected_banks`
TRUNCATE TABLE `c168_org`.`company_selected_banks`;
INSERT INTO `c168_org`.`company_selected_banks` (`company_id`, `country`, `bank`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`bank`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_banks` s;

-- Table `company_selected_countries`
TRUNCATE TABLE `c168_org`.`company_selected_countries`;
INSERT INTO `c168_org`.`company_selected_countries` (`company_id`, `country`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_countries` s;

-- Table `company_selected_countries_backup`
TRUNCATE TABLE `c168_org`.`company_selected_countries_backup`;
INSERT INTO `c168_org`.`company_selected_countries_backup` (`company_id`, `country`, `sort_order`)
SELECT s.`company_id`, s.`country`, s.`sort_order`
FROM `u857194726_count168`.`company_selected_countries_backup` s;

-- Table `country_bank`
TRUNCATE TABLE `c168_org`.`country_bank`;
INSERT INTO `c168_org`.`country_bank` (`id`, `company_id`, `country`, `bank`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`country`, s.`bank`, s.`created_at`
FROM `u857194726_count168`.`country_bank` s;

-- Table `currency`
TRUNCATE TABLE `c168_org`.`currency`;
INSERT INTO `c168_org`.`currency` (`id`, `code`, `company_id`, `scope_type`, `scope_id`, `sync_source`)
SELECT s.`id`, s.`code`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`sync_source`
FROM `u857194726_count168`.`currency` s;

-- Table `currency_backup`
TRUNCATE TABLE `c168_org`.`currency_backup`;
INSERT INTO `c168_org`.`currency_backup` (`id`, `code`, `company_id`, `company_name`)
SELECT s.`id`, s.`code`, s.`company_id`, s.`company_name`
FROM `u857194726_count168`.`currency_backup` s;

-- Table `data_capture_details`
TRUNCATE TABLE `c168_org`.`data_capture_details`;
INSERT INTO `c168_org`.`data_capture_details` (`id`, `company_id`, `scope_type`, `scope_id`, `capture_id`, `id_product_main`, `description_main`, `id_product_sub`, `columns_value`, `description_sub`, `product_type`, `formula_variant`, `id_product`, `account_id`, `currency_id`, `source_value`, `source_percent`, `enable_source_percent`, `formula`, `processed_amount`, `rate`, `display_order`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`capture_id`, s.`id_product_main`, s.`description_main`, s.`id_product_sub`, s.`columns_value`, s.`description_sub`, s.`product_type`, s.`formula_variant`, s.`id_product`, s.`account_id`, s.`currency_id`, s.`source_value`, s.`source_percent`, s.`enable_source_percent`, s.`formula`, s.`processed_amount`, s.`rate`, s.`display_order`, s.`created_at`
FROM `u857194726_count168`.`data_capture_details` s;

-- Table `data_capture_details_backup`
TRUNCATE TABLE `c168_org`.`data_capture_details_backup`;
INSERT INTO `c168_org`.`data_capture_details_backup` (`backup_id`, `id`, `company_id`, `capture_id`, `id_product_main`, `description_main`, `id_product_sub`, `columns_value`, `description_sub`, `product_type`, `formula_variant`, `id_product`, `account_id`, `currency_id`, `source_value`, `source_percent`, `enable_source_percent`, `formula`, `processed_amount`, `rate`, `display_order`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`capture_id`, s.`id_product_main`, s.`description_main`, s.`id_product_sub`, s.`columns_value`, s.`description_sub`, s.`product_type`, s.`formula_variant`, s.`id_product`, s.`account_id`, s.`currency_id`, s.`source_value`, s.`source_percent`, s.`enable_source_percent`, s.`formula`, s.`processed_amount`, s.`rate`, s.`display_order`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`data_capture_details_backup` s;

-- Table `data_capture_draft`
TRUNCATE TABLE `c168_org`.`data_capture_draft`;
INSERT INTO `c168_org`.`data_capture_draft` (`id`, `scope_type`, `group_id`, `company_id`, `process_key`, `currency_id`, `draft_json`, `updated_by`, `updated_at`)
SELECT s.`id`, s.`scope_type`, s.`group_id`, s.`company_id`, s.`process_key`, s.`currency_id`, s.`draft_json`, s.`updated_by`, s.`updated_at`
FROM `u857194726_count168`.`data_capture_draft` s;

-- Table `data_capture_submit_queue`
TRUNCATE TABLE `c168_org`.`data_capture_submit_queue`;
INSERT INTO `c168_org`.`data_capture_submit_queue` (`id`, `company_id`, `user_id`, `status`, `request_json`, `capture_id`, `rows_count`, `error_message`, `created_at`, `finished_at`)
SELECT s.`id`, s.`company_id`, s.`user_id`, s.`status`, s.`request_json`, s.`capture_id`, s.`rows_count`, s.`error_message`, s.`created_at`, s.`finished_at`
FROM `u857194726_count168`.`data_capture_submit_queue` s;

-- Table `data_capture_submit_queue_backup`
TRUNCATE TABLE `c168_org`.`data_capture_submit_queue_backup`;
INSERT INTO `c168_org`.`data_capture_submit_queue_backup` (`id`, `company_id`, `company_name`, `user_id`, `status`, `request_json`, `capture_id`, `capture_name`, `rows_count`, `error_message`, `created_at`, `finished_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`user_id`, s.`status`, s.`request_json`, s.`capture_id`, s.`capture_name`, s.`rows_count`, s.`error_message`, s.`created_at`, s.`finished_at`
FROM `u857194726_count168`.`data_capture_submit_queue_backup` s;

-- Table `data_capture_summary_state`
TRUNCATE TABLE `c168_org`.`data_capture_summary_state`;
INSERT INTO `c168_org`.`data_capture_summary_state` (`id`, `company_id`, `process_key`, `state_json`, `updated_at`)
SELECT s.`id`, s.`company_id`, s.`process_key`, s.`state_json`, s.`updated_at`
FROM `u857194726_count168`.`data_capture_summary_state` s;

-- Table `data_capture_summary_state_backup`
TRUNCATE TABLE `c168_org`.`data_capture_summary_state_backup`;
INSERT INTO `c168_org`.`data_capture_summary_state_backup` (`id`, `company_id`, `company_name`, `process_key`, `state_json`, `updated_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`process_key`, s.`state_json`, s.`updated_at`
FROM `u857194726_count168`.`data_capture_summary_state_backup` s;

-- Table `data_capture_templates`
TRUNCATE TABLE `c168_org`.`data_capture_templates`;
INSERT INTO `c168_org`.`data_capture_templates` (`id`, `company_id`, `scope_type`, `scope_id`, `process_id`, `source_columns`, `batch_selection`, `columns_display`, `data_capture_id`, `row_index`, `sub_order`, `id_product`, `product_type`, `formula_variant`, `parent_id_product`, `template_key`, `description`, `account_id`, `account_display`, `currency_id`, `currency_display`, `formula_operators`, `input_method`, `formula_display`, `last_source_value`, `last_processed_amount`, `source_percent`, `enable_source_percent`, `enable_input_method`, `updated_at`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`process_id`, s.`source_columns`, s.`batch_selection`, s.`columns_display`, s.`data_capture_id`, s.`row_index`, s.`sub_order`, s.`id_product`, s.`product_type`, s.`formula_variant`, s.`parent_id_product`, s.`template_key`, s.`description`, s.`account_id`, s.`account_display`, s.`currency_id`, s.`currency_display`, s.`formula_operators`, s.`input_method`, s.`formula_display`, s.`last_source_value`, s.`last_processed_amount`, s.`source_percent`, s.`enable_source_percent`, s.`enable_input_method`, s.`updated_at`, s.`created_at`
FROM `u857194726_count168`.`data_capture_templates` s;

-- Table `data_capture_templates_backup`
TRUNCATE TABLE `c168_org`.`data_capture_templates_backup`;
INSERT INTO `c168_org`.`data_capture_templates_backup` (`backup_id`, `id`, `company_id`, `process_id`, `source_columns`, `batch_selection`, `columns_display`, `data_capture_id`, `row_index`, `sub_order`, `id_product`, `product_type`, `formula_variant`, `parent_id_product`, `template_key`, `description`, `account_id`, `account_display`, `currency_id`, `currency_display`, `formula_operators`, `input_method`, `formula_display`, `last_source_value`, `last_processed_amount`, `source_percent`, `enable_source_percent`, `enable_input_method`, `updated_at`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`process_id`, s.`source_columns`, s.`batch_selection`, s.`columns_display`, s.`data_capture_id`, s.`row_index`, s.`sub_order`, s.`id_product`, s.`product_type`, s.`formula_variant`, s.`parent_id_product`, s.`template_key`, s.`description`, s.`account_id`, s.`account_display`, s.`currency_id`, s.`currency_display`, s.`formula_operators`, s.`input_method`, s.`formula_display`, s.`last_source_value`, s.`last_processed_amount`, s.`source_percent`, s.`enable_source_percent`, s.`enable_input_method`, s.`updated_at`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`data_capture_templates_backup` s;

-- Table `data_captures`
TRUNCATE TABLE `c168_org`.`data_captures`;
INSERT INTO `c168_org`.`data_captures` (`id`, `company_id`, `scope_type`, `scope_id`, `capture_date`, `process_id`, `currency_id`, `created_at`, `created_by`, `user_type`, `remark`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`capture_date`, s.`process_id`, s.`currency_id`, s.`created_at`, s.`created_by`, s.`user_type`, s.`remark`
FROM `u857194726_count168`.`data_captures` s;

-- Table `data_captures_backup`
TRUNCATE TABLE `c168_org`.`data_captures_backup`;
INSERT INTO `c168_org`.`data_captures_backup` (`backup_id`, `id`, `company_id`, `capture_date`, `process_id`, `currency_id`, `created_at`, `created_by`, `user_type`, `remark`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`capture_date`, s.`process_id`, s.`currency_id`, s.`created_at`, s.`created_by`, s.`user_type`, s.`remark`, s.`backup_created_at`
FROM `u857194726_count168`.`data_captures_backup` s;

-- Table `data_captures_deleted`
TRUNCATE TABLE `c168_org`.`data_captures_deleted`;
INSERT INTO `c168_org`.`data_captures_deleted` (`id`, `capture_id`, `company_id`, `process_id`, `currency_id`, `capture_date`, `created_at`, `created_by`, `user_type`, `remark`, `deleted_by_user_id`, `deleted_by_owner_id`, `deleted_at`)
SELECT s.`id`, s.`capture_id`, s.`company_id`, s.`process_id`, s.`currency_id`, s.`capture_date`, s.`created_at`, s.`created_by`, s.`user_type`, s.`remark`, s.`deleted_by_user_id`, s.`deleted_by_owner_id`, s.`deleted_at`
FROM `u857194726_count168`.`data_captures_deleted` s;

-- Table `day`
TRUNCATE TABLE `c168_org`.`day`;
INSERT INTO `c168_org`.`day` (`id`, `day_name`)
SELECT s.`id`, s.`day_name`
FROM `u857194726_count168`.`day` s;

-- Table `deleted_logs`
TRUNCATE TABLE `c168_org`.`deleted_logs`;
INSERT INTO `c168_org`.`deleted_logs` (`id`, `user`, `company_id`, `page`, `table_name`, `record_id`, `action_type`, `ip_address`, `deleted_data`, `created_at`)
SELECT s.`id`, s.`user`, s.`company_id`, s.`page`, s.`table_name`, s.`record_id`, s.`action_type`, s.`ip_address`, s.`deleted_data`, s.`created_at`
FROM `u857194726_count168`.`deleted_logs` s;

-- Table `description`
TRUNCATE TABLE `c168_org`.`description`;
INSERT INTO `c168_org`.`description` (`id`, `name`, `company_id`, `scope_type`, `scope_id`)
SELECT s.`id`, s.`name`, s.`company_id`, s.`scope_type`, s.`scope_id`
FROM `u857194726_count168`.`description` s;

-- Table `description_backup`
TRUNCATE TABLE `c168_org`.`description_backup`;
INSERT INTO `c168_org`.`description_backup` (`id`, `name`, `company_id`, `company_name`)
SELECT s.`id`, s.`name`, s.`company_id`, s.`company_name`
FROM `u857194726_count168`.`description_backup` s;

-- Table `domain_list_fee_settings`
TRUNCATE TABLE `c168_org`.`domain_list_fee_settings`;
INSERT INTO `c168_org`.`domain_list_fee_settings` (`id`, `price`, `period_prices`, `maintenance_fee`, `updated_at`, `group_price`, `company_price`, `company_period_prices`, `group_period_prices`)
SELECT s.`id`, s.`price`, s.`period_prices`, s.`maintenance_fee`, s.`updated_at`, NULL AS `group_price`, NULL AS `company_price`, NULL AS `company_period_prices`, NULL AS `group_period_prices`
FROM `u857194726_count168`.`domain_list_fee_settings` s;

-- Table `group_company_map`
TRUNCATE TABLE `c168_org`.`group_company_map`;
INSERT INTO `c168_org`.`group_company_map` (`id`, `group_id`, `company_id`, `created_at`)
SELECT s.`id`, s.`group_id`, s.`company_id`, s.`created_at`
FROM `u857194726_count168`.`group_company_map` s;

-- Table `group_ownership`
TRUNCATE TABLE `c168_org`.`group_ownership`;
INSERT INTO `c168_org`.`group_ownership` (`id`, `group_id`, `owner_id`, `account_id`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `created_at`, `updated_at`)
SELECT s.`id`, s.`group_id`, s.`owner_id`, s.`account_id`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`group_ownership` s;

-- Table `group_ownership_backup`
TRUNCATE TABLE `c168_org`.`group_ownership_backup`;
INSERT INTO `c168_org`.`group_ownership_backup` (`id`, `group_id`, `owner_id`, `owner_name`, `account_id`, `account_name`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `created_at`, `updated_at`)
SELECT s.`id`, s.`group_id`, s.`owner_id`, s.`owner_name`, s.`account_id`, s.`account_name`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`group_ownership_backup` s;

-- Table `group_ownership_history`
TRUNCATE TABLE `c168_org`.`group_ownership_history`;
INSERT INTO `c168_org`.`group_ownership_history` (`id`, `group_id`, `owner_id`, `effective_month`, `account_id`, `owner_type`, `percentage`, `partner_group_id`, `read_only`, `saved_by`, `saved_at`)
SELECT s.`id`, s.`group_id`, s.`owner_id`, s.`effective_month`, s.`account_id`, s.`owner_type`, s.`percentage`, s.`partner_group_id`, s.`read_only`, s.`saved_by`, s.`saved_at`
FROM `u857194726_count168`.`group_ownership_history` s;

-- Table `groups`
TRUNCATE TABLE `c168_org`.`groups`;
INSERT INTO `c168_org`.`groups` (`id`, `group_code`, `group_name`, `status`, `owner_id`, `expiration_date`, `permissions`, `fee_share_allocations`, `created_by`, `created_at`, `updated_at`)
SELECT s.`id`, s.`group_code`, s.`group_name`, s.`status`, s.`owner_id`, s.`expiration_date`, s.`permissions`, s.`fee_share_allocations`, s.`created_by`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`groups` s;

-- Table `maintenance_marquee`
TRUNCATE TABLE `c168_org`.`maintenance_marquee`;
INSERT INTO `c168_org`.`maintenance_marquee` (`id`, `content`, `label_type`, `company_code`, `status`, `created_by`, `user_type`, `created_at`, `updated_at`)
SELECT s.`id`, s.`content`, s.`label_type`, s.`company_code`, s.`status`, s.`created_by`, s.`user_type`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`maintenance_marquee` s;

-- Table `owner`
TRUNCATE TABLE `c168_org`.`owner`;
INSERT INTO `c168_org`.`owner` (`id`, `owner_code`, `name`, `email`, `password`, `secondary_password`, `status`, `created_by`, `created_at`)
SELECT s.`id`, s.`owner_code`, s.`name`, s.`email`, s.`password`, s.`secondary_password`, s.`status`, s.`created_by`, s.`created_at`
FROM `u857194726_count168`.`owner` s;

-- Table `owner_backup`
TRUNCATE TABLE `c168_org`.`owner_backup`;
INSERT INTO `c168_org`.`owner_backup` (`id`, `owner_code`, `name`, `email`, `password`, `secondary_password`, `status`, `created_by`, `created_at`)
SELECT s.`id`, s.`owner_code`, s.`name`, s.`email`, s.`password`, s.`secondary_password`, s.`status`, s.`created_by`, s.`created_at`
FROM `u857194726_count168`.`owner_backup` s;

-- Table `password_reset_tac`
TRUNCATE TABLE `c168_org`.`password_reset_tac`;
INSERT INTO `c168_org`.`password_reset_tac` (`email`, `company_id`, `code`, `expires_at`, `created_at`)
SELECT s.`email`, s.`company_id`, s.`code`, s.`expires_at`, s.`created_at`
FROM `u857194726_count168`.`password_reset_tac` s;

-- Table `password_reset_tac_owner`
TRUNCATE TABLE `c168_org`.`password_reset_tac_owner`;
INSERT INTO `c168_org`.`password_reset_tac_owner` (`email`, `owner_id`, `code`, `expires_at`, `created_at`)
SELECT s.`email`, s.`owner_id`, s.`code`, s.`expires_at`, s.`created_at`
FROM `u857194726_count168`.`password_reset_tac_owner` s;

-- Table `process`
TRUNCATE TABLE `c168_org`.`process`;
INSERT INTO `c168_org`.`process` (`id`, `process_id`, `description_id`, `currency_id`, `remove_word`, `replace_word_from`, `replace_word_to`, `remark`, `status`, `dts_modified`, `modified_by`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_type`, `created_by_owner_id`, `company_id`, `sync_source_process_id`)
SELECT s.`id`, s.`process_id`, s.`description_id`, s.`currency_id`, s.`remove_word`, s.`replace_word_from`, s.`replace_word_to`, s.`remark`, s.`status`, s.`dts_modified`, s.`modified_by`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_type`, s.`created_by_owner_id`, s.`company_id`, s.`sync_source_process_id`
FROM `u857194726_count168`.`process` s;

-- Table `process_accounting_due_dismissed`
TRUNCATE TABLE `c168_org`.`process_accounting_due_dismissed`;
INSERT INTO `c168_org`.`process_accounting_due_dismissed` (`id`, `company_id`, `process_id`, `period_type`, `anchor_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`process_id`, s.`period_type`, s.`anchor_date`, s.`created_at`
FROM `u857194726_count168`.`process_accounting_due_dismissed` s;

-- Table `process_accounting_posted`
TRUNCATE TABLE `c168_org`.`process_accounting_posted`;
INSERT INTO `c168_org`.`process_accounting_posted` (`id`, `company_id`, `process_id`, `posted_date`, `period_type`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`process_id`, s.`posted_date`, s.`period_type`, s.`created_at`
FROM `u857194726_count168`.`process_accounting_posted` s;

-- Table `process_backup`
TRUNCATE TABLE `c168_org`.`process_backup`;
INSERT INTO `c168_org`.`process_backup` (`id`, `process_id`, `description_id`, `description_name`, `currency_id`, `currency_name`, `remove_word`, `replace_word_from`, `replace_word_to`, `remark`, `status`, `dts_modified`, `modified_by`, `modified_name`, `modified_by_type`, `modified_by_owner_id`, `dts_created`, `created_by`, `created_by_type`, `created_by_owner_id`, `created_name`, `company_id`, `company_name`, `sync_source_process_id`)
SELECT s.`id`, s.`process_id`, s.`description_id`, s.`description_name`, s.`currency_id`, s.`currency_name`, s.`remove_word`, s.`replace_word_from`, s.`replace_word_to`, s.`remark`, s.`status`, s.`dts_modified`, s.`modified_by`, s.`modified_name`, s.`modified_by_type`, s.`modified_by_owner_id`, s.`dts_created`, s.`created_by`, s.`created_by_type`, s.`created_by_owner_id`, s.`created_name`, s.`company_id`, s.`company_name`, s.`sync_source_process_id`
FROM `u857194726_count168`.`process_backup` s;

-- Table `process_day`
TRUNCATE TABLE `c168_org`.`process_day`;
INSERT INTO `c168_org`.`process_day` (`id`, `process_id`, `day_id`)
SELECT s.`id`, s.`process_id`, s.`day_id`
FROM `u857194726_count168`.`process_day` s;

-- Table `process_day_backup`
TRUNCATE TABLE `c168_org`.`process_day_backup`;
INSERT INTO `c168_org`.`process_day_backup` (`id`, `process_id`, `day_id`, `process_name`, `day_name`)
SELECT s.`id`, s.`process_id`, s.`day_id`, s.`process_name`, s.`day_name`
FROM `u857194726_count168`.`process_day_backup` s;

-- Table `role`
TRUNCATE TABLE `c168_org`.`role`;
INSERT INTO `c168_org`.`role` (`id`, `code`)
SELECT s.`id`, s.`code`
FROM `u857194726_count168`.`role` s;

-- Table `submitted_processes`
TRUNCATE TABLE `c168_org`.`submitted_processes`;
INSERT INTO `c168_org`.`submitted_processes` (`id`, `company_id`, `scope_type`, `scope_id`, `user_id`, `user_type`, `process_id`, `date_submitted`, `capture_date`, `created_at`)
SELECT s.`id`, s.`company_id`, 'company' AS `scope_type`, s.`company_id` AS `scope_id`, s.`user_id`, s.`user_type`, s.`process_id`, s.`date_submitted`, s.`capture_date`, s.`created_at`
FROM `u857194726_count168`.`submitted_processes` s;

-- Table `submitted_processes_backup`
TRUNCATE TABLE `c168_org`.`submitted_processes_backup`;
INSERT INTO `c168_org`.`submitted_processes_backup` (`id`, `company_id`, `company_name`, `user_id`, `user_name`, `user_type`, `process_id`, `process_name`, `date_submitted`, `capture_date`, `created_at`)
SELECT s.`id`, s.`company_id`, s.`company_name`, s.`user_id`, s.`user_name`, s.`user_type`, s.`process_id`, s.`process_name`, s.`date_submitted`, s.`capture_date`, s.`created_at`
FROM `u857194726_count168`.`submitted_processes_backup` s;

-- Table `tenant_module_policy`
TRUNCATE TABLE `c168_org`.`tenant_module_policy`;
INSERT INTO `c168_org`.`tenant_module_policy` (`id`, `scope_type`, `scope_id`, `module_key`, `is_enabled`, `created_at`, `updated_at`)
SELECT s.`id`, s.`scope_type`, s.`scope_id`, s.`module_key`, s.`is_enabled`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`tenant_module_policy` s;

-- Table `transaction_entry`
TRUNCATE TABLE `c168_org`.`transaction_entry`;
INSERT INTO `c168_org`.`transaction_entry` (`id`, `header_id`, `company_id`, `scope_type`, `scope_id`, `account_id`, `currency_id`, `amount`, `entry_type`, `description`, `created_at`)
SELECT s.`id`, s.`header_id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`account_id`, s.`currency_id`, s.`amount`, s.`entry_type`, s.`description`, s.`created_at`
FROM `u857194726_count168`.`transaction_entry` s;

-- Table `transaction_entry_backup`
TRUNCATE TABLE `c168_org`.`transaction_entry_backup`;
INSERT INTO `c168_org`.`transaction_entry_backup` (`backup_id`, `id`, `header_id`, `company_id`, `account_id`, `currency_id`, `amount`, `entry_type`, `description`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`header_id`, s.`company_id`, s.`account_id`, s.`currency_id`, s.`amount`, s.`entry_type`, s.`description`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transaction_entry_backup` s;

-- Table `transactions`
TRUNCATE TABLE `c168_org`.`transactions`;
INSERT INTO `c168_org`.`transactions` (`id`, `company_id`, `scope_type`, `scope_id`, `transaction_type`, `account_id`, `from_account_id`, `currency_id`, `amount`, `transaction_date`, `description`, `sms`, `created_by`, `created_by_owner`, `created_at`, `updated_at`, `approval_status`, `approved_by`, `approved_by_owner`, `approved_at`, `source_bank_process_id`, `source_bank_process_period_type`)
SELECT s.`id`, s.`company_id`, s.`scope_type`, s.`scope_id`, s.`transaction_type`, s.`account_id`, s.`from_account_id`, s.`currency_id`, s.`amount`, s.`transaction_date`, s.`description`, s.`sms`, s.`created_by`, s.`created_by_owner`, s.`created_at`, s.`updated_at`, s.`approval_status`, s.`approved_by`, s.`approved_by_owner`, s.`approved_at`, s.`source_bank_process_id`, s.`source_bank_process_period_type`
FROM `u857194726_count168`.`transactions` s;

-- Table `transactions_backup`
TRUNCATE TABLE `c168_org`.`transactions_backup`;
INSERT INTO `c168_org`.`transactions_backup` (`backup_id`, `id`, `company_id`, `transaction_type`, `account_id`, `from_account_id`, `currency_id`, `amount`, `transaction_date`, `description`, `sms`, `created_by`, `created_by_owner`, `created_at`, `updated_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`company_id`, s.`transaction_type`, s.`account_id`, s.`from_account_id`, s.`currency_id`, s.`amount`, s.`transaction_date`, s.`description`, s.`sms`, s.`created_by`, s.`created_by_owner`, s.`created_at`, s.`updated_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transactions_backup` s;

-- Table `transactions_deleted`
TRUNCATE TABLE `c168_org`.`transactions_deleted`;
INSERT INTO `c168_org`.`transactions_deleted` (`id`, `transaction_id`, `company_id`, `transaction_type`, `account_id`, `from_account_id`, `amount`, `currency_id`, `transaction_date`, `description`, `sms`, `created_by`, `created_by_owner`, `created_at`, `deleted_by_user_id`, `deleted_by_owner_id`, `deleted_at`, `source_bank_process_id`, `source_bank_process_period_type`)
SELECT s.`id`, s.`transaction_id`, s.`company_id`, s.`transaction_type`, s.`account_id`, s.`from_account_id`, s.`amount`, s.`currency_id`, s.`transaction_date`, s.`description`, s.`sms`, s.`created_by`, s.`created_by_owner`, s.`created_at`, s.`deleted_by_user_id`, s.`deleted_by_owner_id`, s.`deleted_at`, s.`source_bank_process_id`, s.`source_bank_process_period_type`
FROM `u857194726_count168`.`transactions_deleted` s;

-- Table `transactions_rate`
TRUNCATE TABLE `c168_org`.`transactions_rate`;
INSERT INTO `c168_org`.`transactions_rate` (`id`, `transaction_id`, `company_id`, `rate_group_id`, `rate_from_account_id`, `rate_to_account_id`, `rate_from_currency_id`, `rate_from_amount`, `rate_to_currency_id`, `rate_to_amount`, `exchange_rate`, `rate_transfer_from_account_id`, `rate_transfer_to_account_id`, `rate_transfer_from_amount`, `rate_transfer_to_amount`, `rate_middleman_account_id`, `rate_middleman_rate`, `rate_middleman_amount`, `created_at`, `updated_at`)
SELECT s.`id`, s.`transaction_id`, s.`company_id`, s.`rate_group_id`, s.`rate_from_account_id`, s.`rate_to_account_id`, s.`rate_from_currency_id`, s.`rate_from_amount`, s.`rate_to_currency_id`, s.`rate_to_amount`, s.`exchange_rate`, s.`rate_transfer_from_account_id`, s.`rate_transfer_to_account_id`, s.`rate_transfer_from_amount`, s.`rate_transfer_to_amount`, s.`rate_middleman_account_id`, s.`rate_middleman_rate`, s.`rate_middleman_amount`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`transactions_rate` s;

-- Table `transactions_rate_backup`
TRUNCATE TABLE `c168_org`.`transactions_rate_backup`;
INSERT INTO `c168_org`.`transactions_rate_backup` (`backup_id`, `id`, `transaction_id`, `company_id`, `rate_group_id`, `rate_from_account_id`, `rate_to_account_id`, `rate_from_currency_id`, `rate_from_amount`, `rate_to_currency_id`, `rate_to_amount`, `exchange_rate`, `rate_transfer_from_account_id`, `rate_transfer_to_account_id`, `rate_transfer_from_amount`, `rate_transfer_to_amount`, `rate_middleman_account_id`, `rate_middleman_rate`, `rate_middleman_amount`, `created_at`, `updated_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`transaction_id`, s.`company_id`, s.`rate_group_id`, s.`rate_from_account_id`, s.`rate_to_account_id`, s.`rate_from_currency_id`, s.`rate_from_amount`, s.`rate_to_currency_id`, s.`rate_to_amount`, s.`exchange_rate`, s.`rate_transfer_from_account_id`, s.`rate_transfer_to_account_id`, s.`rate_transfer_from_amount`, s.`rate_transfer_to_amount`, s.`rate_middleman_account_id`, s.`rate_middleman_rate`, s.`rate_middleman_amount`, s.`created_at`, s.`updated_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transactions_rate_backup` s;

-- Table `transactions_rate_details`
TRUNCATE TABLE `c168_org`.`transactions_rate_details`;
INSERT INTO `c168_org`.`transactions_rate_details` (`id`, `rate_group_id`, `transaction_id`, `company_id`, `record_type`, `account_id`, `from_account_id`, `amount`, `currency_id`, `description`, `created_at`)
SELECT s.`id`, s.`rate_group_id`, s.`transaction_id`, s.`company_id`, s.`record_type`, s.`account_id`, s.`from_account_id`, s.`amount`, s.`currency_id`, s.`description`, s.`created_at`
FROM `u857194726_count168`.`transactions_rate_details` s;

-- Table `transactions_rate_details_backup`
TRUNCATE TABLE `c168_org`.`transactions_rate_details_backup`;
INSERT INTO `c168_org`.`transactions_rate_details_backup` (`backup_id`, `id`, `rate_group_id`, `transaction_id`, `company_id`, `record_type`, `account_id`, `from_account_id`, `amount`, `currency_id`, `description`, `created_at`, `backup_created_at`)
SELECT s.`backup_id`, s.`id`, s.`rate_group_id`, s.`transaction_id`, s.`company_id`, s.`record_type`, s.`account_id`, s.`from_account_id`, s.`amount`, s.`currency_id`, s.`description`, s.`created_at`, s.`backup_created_at`
FROM `u857194726_count168`.`transactions_rate_details_backup` s;

-- Table `user`
TRUNCATE TABLE `c168_org`.`user`;
INSERT INTO `c168_org`.`user` (`id`, `login_id`, `name`, `password`, `secondary_password`, `email`, `role`, `permissions`, `status`, `created_by`, `created_at`, `last_login`, `remember_token`, `remember_token_expires`, `read_only`)
SELECT s.`id`, s.`login_id`, s.`name`, s.`password`, s.`secondary_password`, s.`email`, s.`role`, s.`permissions`, s.`status`, s.`created_by`, s.`created_at`, s.`last_login`, s.`remember_token`, s.`remember_token_expires`, s.`read_only`
FROM `u857194726_count168`.`user` s;

-- Table `user_backup`
TRUNCATE TABLE `c168_org`.`user_backup`;
INSERT INTO `c168_org`.`user_backup` (`id`, `login_id`, `name`, `password`, `secondary_password`, `email`, `role`, `permissions`, `status`, `created_by`, `created_at`, `last_login`, `remember_token`, `remember_token_expires`, `read_only`)
SELECT s.`id`, s.`login_id`, s.`name`, s.`password`, s.`secondary_password`, s.`email`, s.`role`, s.`permissions`, s.`status`, s.`created_by`, s.`created_at`, s.`last_login`, s.`remember_token`, s.`remember_token_expires`, s.`read_only`
FROM `u857194726_count168`.`user_backup` s;

-- Table `user_company_map`
TRUNCATE TABLE `c168_org`.`user_company_map`;
INSERT INTO `c168_org`.`user_company_map` (`id`, `user_id`, `company_id`, `scope_type`, `scope_id`)
SELECT s.`id`, s.`user_id`, s.`company_id`, s.`scope_type`, s.`scope_id`
FROM `u857194726_count168`.`user_company_map` s;

-- Table `user_company_map_backup`
TRUNCATE TABLE `c168_org`.`user_company_map_backup`;
INSERT INTO `c168_org`.`user_company_map_backup` (`id`, `user_id`, `user_name`, `company_id`, `company_name`)
SELECT s.`id`, s.`user_id`, s.`user_name`, s.`company_id`, s.`company_name`
FROM `u857194726_count168`.`user_company_map_backup` s;

-- Table `user_company_permission_backup`
TRUNCATE TABLE `c168_org`.`user_company_permission_backup`;
INSERT INTO `c168_org`.`user_company_permission_backup` (`id`, `user_id`, `user_name`, `company_id`, `company_name`, `account_permissions`, `process_permissions`, `created_at`, `updated_at`)
SELECT s.`id`, s.`user_id`, s.`user_name`, s.`company_id`, s.`company_name`, s.`account_permissions`, s.`process_permissions`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`user_company_permission_backup` s;

-- Table `user_company_permissions`
TRUNCATE TABLE `c168_org`.`user_company_permissions`;
INSERT INTO `c168_org`.`user_company_permissions` (`id`, `user_id`, `company_id`, `account_permissions`, `process_permissions`, `created_at`, `updated_at`)
SELECT s.`id`, s.`user_id`, s.`company_id`, s.`account_permissions`, s.`process_permissions`, s.`created_at`, s.`updated_at`
FROM `u857194726_count168`.`user_company_permissions` s;

-- Table `user_group_map`
TRUNCATE TABLE `c168_org`.`user_group_map`;
INSERT INTO `c168_org`.`user_group_map` (`id`, `user_id`, `group_id`, `created_at`)
SELECT s.`id`, s.`user_id`, s.`group_id`, s.`created_at`
FROM `u857194726_count168`.`user_group_map` s;

-- Backfill scope_id where derived/NULL (ref: database/ops/SCOPE_ID_BACKFILL_DATA_CAPTURE_TEMPLATES.md)
UPDATE `account_company`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `currency`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `data_capture_details`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `data_capture_templates`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `data_captures`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `description`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `submitted_processes`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `transaction_entry`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `transactions`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

UPDATE `user_company_map`
SET `scope_type` = 'company',
    `scope_id` = `company_id`
WHERE `scope_id` IS NULL
  AND `company_id` IS NOT NULL;

-- Row-count sanity check (target should match source for replaced tables):
SELECT 'account' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account`) AS source_rows;
SELECT 'account_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_backup`) AS source_rows;
SELECT 'account_company' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_company`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_company`) AS source_rows;
SELECT 'account_company_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_company_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_company_backup`) AS source_rows;
SELECT 'account_currency' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_currency`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_currency`) AS source_rows;
SELECT 'account_currency_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_currency_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_currency_backup`) AS source_rows;
SELECT 'account_currency_display_order' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_currency_display_order`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_currency_display_order`) AS source_rows;
SELECT 'account_currency_display_order_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_currency_display_order_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_currency_display_order_backup`) AS source_rows;
SELECT 'account_link' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_link`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_link`) AS source_rows;
SELECT 'account_link_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`account_link_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`account_link_backup`) AS source_rows;
SELECT 'announcements' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`announcements`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`announcements`) AS source_rows;
SELECT 'auto_login_credentials' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`auto_login_credentials`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`auto_login_credentials`) AS source_rows;
SELECT 'bank_process' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`bank_process`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`bank_process`) AS source_rows;
SELECT 'bank_process_accounting_resend_daily_guard' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`bank_process_accounting_resend_daily_guard`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard`) AS source_rows;
SELECT 'bank_process_accounting_resend_daily_guard_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`bank_process_accounting_resend_daily_guard_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`bank_process_accounting_resend_daily_guard_backup`) AS source_rows;
SELECT 'bank_process_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`bank_process_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`bank_process_backup`) AS source_rows;
SELECT 'bank_process_maintenance_resend_pending' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`bank_process_maintenance_resend_pending`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`bank_process_maintenance_resend_pending`) AS source_rows;
SELECT 'bank_process_maintenance_resend_pending_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`bank_process_maintenance_resend_pending_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`bank_process_maintenance_resend_pending_backup`) AS source_rows;
SELECT 'company' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company`) AS source_rows;
SELECT 'company_auto_renew_request' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_auto_renew_request`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_auto_renew_request`) AS source_rows;
SELECT 'company_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_backup`) AS source_rows;
SELECT 'company_countries' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_countries`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_countries`) AS source_rows;
SELECT 'company_countries_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_countries_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_countries_backup`) AS source_rows;
SELECT 'company_deletion_archive' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_deletion_archive`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_deletion_archive`) AS source_rows;
SELECT 'company_ownership' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_ownership`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_ownership`) AS source_rows;
SELECT 'company_ownership_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_ownership_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_ownership_backup`) AS source_rows;
SELECT 'company_ownership_history' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_ownership_history`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_ownership_history`) AS source_rows;
SELECT 'company_selected_bank_backup' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_selected_bank_backup`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_selected_bank_backup`) AS source_rows;
SELECT 'company_selected_banks' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_selected_banks`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_selected_banks`) AS source_rows;
SELECT 'company_selected_countries' AS table_name, (SELECT COUNT(*) FROM `c168_org`.`company_selected_countries`) AS target_rows, (SELECT COUNT(*) FROM `u857194726_count168`.`company_selected_countries`) AS source_rows;
-- ... and 57 more tables

COMMIT;
-- If anything looks wrong:
-- ROLLBACK TO SAVEPOINT replace_begin;
-- ROLLBACK;

SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;

-- Metadata:
-- Replaced tables: 87
-- Truncated-only (no source): 0
-- Skipped: 0
--   source-only (not in target schema): system_it_allowlist
--   source-only (not in target schema): system_runtime_flags
--   source-only (not in target schema): transaction_full_details_with_rate
