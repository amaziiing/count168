# SQL Merge Conflict Report

- Source DB: `u857194726_count168`
- Target DB: `c168_org`

## Structure Diff

- Tables only in source: **3**
- Tables only in target: **0**
- Tables with schema difference: **85**

### Schema-different tables
- `account`
- `account_backup`
- `account_company`
- `account_company_backup`
- `account_currency`
- `account_currency_backup`
- `account_currency_display_order`
- `account_link`
- `announcements`
- `auto_login_credentials`
- `bank_process`
- `bank_process_accounting_resend_daily_guard`
- `bank_process_accounting_resend_daily_guard_backup`
- `bank_process_backup`
- `bank_process_maintenance_resend_pending`
- `bank_process_maintenance_resend_pending_backup`
- `company`
- `company_auto_renew_request`
- `company_backup`
- `company_countries`
- `company_countries_backup`
- `company_deletion_archive`
- `company_ownership`
- `company_ownership_backup`
- `company_ownership_history`
- `company_selected_bank_backup`
- `company_selected_banks`
- `company_selected_countries`
- `company_selected_countries_backup`
- `country_bank`
- `currency`
- `currency_backup`
- `data_capture_details`
- `data_capture_details_backup`
- `data_capture_draft`
- `data_capture_submit_queue`
- `data_capture_submit_queue_backup`
- `data_capture_summary_state`
- `data_capture_summary_state_backup`
- `data_capture_templates`
- `data_capture_templates_backup`
- `data_captures`
- `data_captures_backup`
- `data_captures_deleted`
- `day`
- `deleted_logs`
- `description`
- `description_backup`
- `domain_list_fee_settings`
- `group_company_map`
- `group_ownership`
- `group_ownership_backup`
- `group_ownership_history`
- `groups`
- `maintenance_marquee`
- `owner`
- `owner_backup`
- `password_reset_tac`
- `password_reset_tac_owner`
- `process`
- `process_accounting_due_dismissed`
- `process_accounting_posted`
- `process_backup`
- `process_day`
- `process_day_backup`
- `role`
- `submitted_processes`
- `submitted_processes_backup`
- `tenant_module_policy`
- `transaction_entry`
- `transaction_entry_backup`
- `transactions`
- `transactions_backup`
- `transactions_deleted`
- `transactions_rate`
- `transactions_rate_backup`
- `transactions_rate_details`
- `transactions_rate_details_backup`
- `user`
- `user_backup`
- `user_company_map`
- `user_company_map_backup`
- `user_company_permission_backup`
- `user_company_permissions`
- `user_group_map`

### Column-set differences (auto-merge skipped)

- `company_auto_renew_request`: source_only=[], target_only=['entity_type', 'group_id']
- `domain_list_fee_settings`: source_only=[], target_only=['company_period_prices', 'company_price', 'group_period_prices', 'group_price']
- `submitted_processes`: source_only=[], target_only=['scope_id', 'scope_type']

## Data Key Conflict (Primary Key)

| table | pk | source_rows | target_rows | source_only_pk | target_only_pk | same_pk_same_data | same_pk_diff_data |
|---|---|---:|---:|---:|---:|---:|---:|
| `submitted_processes` | `id` | 3511 | 3483 | 32 | 4 | 0 | 3479 |
| `data_capture_templates` | `id` | 10246 | 10000 | 247 | 1 | 9919 | 80 |
| `user` | `id` | 84 | 81 | 3 | 0 | 65 | 16 |
| `user_backup` | `id` | 84 | 81 | 3 | 0 | 65 | 16 |
| `account` | `id` | 1408 | 1406 | 2 | 0 | 1392 | 14 |
| `account_backup` | `id` | 1408 | 1406 | 2 | 0 | 1392 | 14 |
| `user_company_permissions` | `id` | 52 | 49 | 3 | 0 | 35 | 14 |
| `user_company_permission_backup` | `id` | 52 | 49 | 3 | 0 | 42 | 7 |
| `bank_process` | `id` | 115 | 110 | 5 | 0 | 104 | 6 |
| `bank_process_backup` | `id` | 115 | 110 | 5 | 0 | 104 | 6 |
| `data_capture_submit_queue_backup` | `id` | 6977 | 6942 | 35 | 0 | 6938 | 4 |
| `data_capture_summary_state` | `id` | 480 | 478 | 2 | 0 | 475 | 3 |
| `data_capture_summary_state_backup` | `id` | 480 | 478 | 2 | 0 | 475 | 3 |
| `process` | `id` | 1057 | 1056 | 1 | 0 | 1055 | 1 |
| `owner` | `id` | 11 | 11 | 0 | 0 | 10 | 1 |
| `domain_list_fee_settings` | `id` | 1 | 1 | 0 | 0 | 0 | 1 |
| `data_capture_details_backup` | `backup_id` | 105251 | 104371 | 880 | 0 | 104371 | 0 |
| `data_capture_details` | `id` | 52375 | 51611 | 799 | 35 | 51576 | 0 |
| `data_capture_templates_backup` | `backup_id` | 49946 | 48741 | 1205 | 0 | 48741 | 0 |
| `transactions_backup` | `backup_id` | 17128 | 16933 | 195 | 0 | 16933 | 0 |
| `data_captures_backup` | `backup_id` | 15721 | 15686 | 35 | 0 | 15686 | 0 |
| `data_captures` | `id` | 8801 | 8773 | 32 | 4 | 8769 | 0 |
| `transactions` | `id` | 8328 | 8159 | 169 | 0 | 8159 | 0 |
| `deleted_logs` | `id` | 7920 | 7771 | 149 | 0 | 7771 | 0 |
| `data_capture_submit_queue` | `id` | 6977 | 6942 | 35 | 0 | 6942 | 0 |
| `submitted_processes_backup` | `id` | 3511 | 3483 | 32 | 4 | 3479 | 0 |
| `transaction_entry_backup` | `backup_id` | 3041 | 3021 | 20 | 0 | 3021 | 0 |
| `transactions_deleted` | `id` | 2776 | 2762 | 14 | 0 | 2762 | 0 |
| `process_day` | `id` | 2492 | 2490 | 4 | 2 | 2488 | 0 |
| `process_day_backup` | `id` | 2492 | 2488 | 4 | 0 | 2488 | 0 |
| `account_currency` | `id` | 1575 | 1573 | 2 | 0 | 1573 | 0 |
| `account_currency_backup` | `id` | 1575 | 1573 | 2 | 0 | 1573 | 0 |
| `account_company` | `id` | 1361 | 1359 | 2 | 0 | 1359 | 0 |
| `account_company_backup` | `id` | 1361 | 1359 | 2 | 0 | 1359 | 0 |
| `transactions_rate_details_backup` | `backup_id` | 1235 | 1215 | 20 | 0 | 1215 | 0 |
| `data_captures_deleted` | `id` | 1085 | 1078 | 7 | 0 | 1078 | 0 |
| `process_backup` | `id` | 1057 | 1055 | 2 | 0 | 1055 | 0 |
| `process_accounting_posted` | `id` | 905 | 898 | 7 | 0 | 898 | 0 |
| `description` | `id` | 503 | 502 | 1 | 0 | 502 | 0 |
| `description_backup` | `id` | 503 | 502 | 1 | 0 | 502 | 0 |
| `transactions_rate_details` | `id` | 484 | 468 | 16 | 0 | 468 | 0 |
| `transaction_entry` | `id` | 465 | 449 | 16 | 0 | 449 | 0 |
| `bank_process_maintenance_resend_pending` | `id` | 293 | 292 | 1 | 0 | 292 | 0 |
| `bank_process_maintenance_resend_pending_backup` | `id` | 293 | 292 | 1 | 0 | 292 | 0 |
| `transactions_rate_backup` | `backup_id` | 281 | 276 | 5 | 0 | 276 | 0 |
| `country_bank` | `id` | 183 | 182 | 1 | 0 | 182 | 0 |
| `company_selected_bank_backup` | `company_id,country,bank` | 125 | 124 | 1 | 0 | 124 | 0 |
| `company_selected_banks` | `company_id,country,bank` | 125 | 124 | 1 | 0 | 124 | 0 |
| `transactions_rate` | `id` | 112 | 108 | 4 | 0 | 108 | 0 |
| `account_link` | `id` | 78 | 78 | 0 | 0 | 78 | 0 |
| `user_company_map` | `id` | 64 | 61 | 3 | 0 | 61 | 0 |
| `user_company_map_backup` | `id` | 64 | 61 | 3 | 0 | 61 | 0 |
| `currency` | `id` | 60 | 60 | 0 | 0 | 60 | 0 |
| `currency_backup` | `id` | 60 | 60 | 0 | 0 | 60 | 0 |
| `tenant_module_policy` | `id` | 56 | 56 | 0 | 0 | 56 | 0 |
| `company_selected_countries` | `company_id,country` | 54 | 54 | 0 | 0 | 54 | 0 |
| `company_selected_countries_backup` | `company_id,country` | 54 | 54 | 0 | 0 | 54 | 0 |
| `bank_process_accounting_resend_daily_guard` | `id` | 48 | 48 | 0 | 0 | 48 | 0 |
| `bank_process_accounting_resend_daily_guard_backup` | `id` | 48 | 48 | 0 | 0 | 48 | 0 |
| `company_countries` | `id` | 38 | 38 | 0 | 0 | 38 | 0 |
| `company_countries_backup` | `id` | 38 | 38 | 0 | 0 | 38 | 0 |
| `company` | `id` | 26 | 26 | 0 | 0 | 26 | 0 |
| `company_backup` | `id` | 26 | 26 | 0 | 0 | 26 | 0 |
| `company_ownership` | `id` | 22 | 22 | 0 | 0 | 22 | 0 |
| `company_ownership_backup` | `id` | 22 | 22 | 0 | 0 | 22 | 0 |
| `process_accounting_due_dismissed` | `id` | 20 | 20 | 0 | 0 | 20 | 0 |
| `account_currency_display_order` | `id` | 15 | 15 | 0 | 0 | 15 | 0 |
| `owner_backup` | `id` | 11 | 11 | 0 | 0 | 11 | 0 |
| `role` | `id` | 10 | 10 | 0 | 0 | 10 | 0 |
| `group_company_map` | `id` | 9 | 9 | 0 | 0 | 9 | 0 |
| `group_ownership` | `id` | 9 | 9 | 0 | 0 | 9 | 0 |
| `group_ownership_backup` | `id` | 9 | 9 | 0 | 0 | 9 | 0 |
| `day` | `id` | 7 | 7 | 0 | 0 | 7 | 0 |
| `company_deletion_archive` | `id` | 5 | 5 | 0 | 0 | 5 | 0 |
| `groups` | `id` | 4 | 4 | 0 | 0 | 4 | 0 |
| `password_reset_tac_owner` | `email,owner_id` | 3 | 3 | 0 | 0 | 3 | 0 |
| `data_capture_draft` | `id` | 2 | 2 | 0 | 0 | 2 | 0 |
| `announcements` | `id` | 2 | 1 | 1 | 0 | 1 | 0 |
| `password_reset_tac` | `email,company_id` | 1 | 1 | 0 | 0 | 1 | 0 |
| `company_auto_renew_request` | `id` | 0 | 5 | 0 | 5 | 0 | 0 |
| `maintenance_marquee` | `id` | 1 | 0 | 1 | 0 | 0 | 0 |

## High-Risk Tables

- same_pk_diff_data > 0 tables: **16**
- `submitted_processes`: 3479
- `data_capture_templates`: 80
- `user`: 16
- `user_backup`: 16
- `account`: 14
- `account_backup`: 14
- `user_company_permissions`: 14
- `user_company_permission_backup`: 7
- `bank_process`: 6
- `bank_process_backup`: 6
- `data_capture_submit_queue_backup`: 4
- `data_capture_summary_state`: 3
- `data_capture_summary_state_backup`: 3
- `process`: 1
- `owner`: 1
- `domain_list_fee_settings`: 1

