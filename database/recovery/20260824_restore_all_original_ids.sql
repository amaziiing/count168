-- FINAL consolidated recovery script for database `c168_org`.
--
-- Rewritten with NO session variables (@var) at all -- the previous version
-- used `SET @proc_x = LAST_INSERT_ID()` and DBeaver's script executor hit a
-- foreign key error on the very first data_captures insert, which means the
-- session variable did not carry over from the preceding INSERT INTO
-- `process` statement (most likely each statement ran on a fresh connection
-- under that execution mode). To make this immune to that entirely, every
-- process.id AND every data_captures.id below is now an explicit literal --
-- the ORIGINAL id each row had before the 2026-08-24 cascade delete. All 18
-- ids (5 process + 13 data_captures) were confirmed free in `c168_org` right
-- before writing this script.
--
-- Restores everything lost to ON DELETE CASCADE when the description-dedup
-- cleanup deleted 5 "duplicate" process rows that were actually distinct
-- per-submission process rows carrying live data:
--   - process.id 4689  AB33888          (company 123, XE88 LC)
--   - process.id 4176  XE8877003        (company 123, XE88 LC)
--   - process.id 4419  AP7FT003         (company 124)
--   - process.id 4591  REDIRECT2UMYR    (company 124)
--   - process.id 4538  INFINITY688US-2  (company 127)
--
-- Restoring the original process id numbers (not fresh auto-increment ones)
-- matters because api/capture_maintenance/search_api.php resolves the
-- "Process" filter to a single process.id via dcResolveProcessIdByCode()
-- (data_capture_scope_common.php:520-547), which for these codes must
-- resolve back to these exact ids for the restored captures to be visible
-- in the Capture Maintenance screen.
--
-- Run as one script in `c168_org`. Because there are no session variables,
-- statement order no longer matters for correctness, but table structure
-- (process before data_captures before data_capture_details) is still kept
-- for readability. Review the verification SELECT, then COMMIT or ROLLBACK.

START TRANSACTION;

-- Sanity check -- all ids below must be free. If this returns any rows, STOP.
SELECT id, 'process' AS tbl FROM process WHERE id IN (4689, 4176, 4419, 4591, 4538)
UNION ALL
SELECT id, 'data_captures' FROM data_captures WHERE id IN (19226,8797,8913,17371,13147,13827,14579,15176,15977,16602,16026,19079,14573);
-- Expect: empty result set. Do not proceed if it isn't.

-- =====================================================================
-- process 4689 -- AB33888 (company 123, XE88 LC)
-- =====================================================================
INSERT INTO process
  (id, process_id, description_id, currency_id, remove_word, replace_word_from, replace_word_to, remark,
   status, enable_save_draft, dts_modified, modified_by, modified_by_type, modified_by_owner_id,
   dts_created, created_by, created_by_type, created_by_owner_id, company_id, sync_source_process_id)
VALUES
  (4689, 'AB33888', 1900, 169, '', 'TOTAL WIN: ', 'AB33888', '',
   'waiting', 0, '2026-08-24 02:32:54', 265, 'user', NULL,
   '2026-08-24 02:12:06', 265, 'user', NULL, 123, 3607);

INSERT INTO data_captures
  (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES
  (19226, 123, 'company', NULL, '2026-08-23', 4689, 'AB33888', 169, '2026-08-23 18:18:16', 265, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (123,'company',NULL,19226,'NXE9511',NULL,NULL,'NXE9511:B:1',NULL,'main',1,'NXE9511','3869',169,'','0.14',1,'9.00*(0.14)',-1.260000,NULL,NULL,0,'2026-08-23 18:18:16'),
  (123,'company',NULL,19226,'NXE9511',NULL,'NXE9511','NXE9511:B:1',NULL,'sub',1,'NXE9511','3963',169,'','0.004',1,'9.00*(0.004)',0.036000,NULL,NULL,1,'2026-08-23 18:18:16'),
  (123,'company',NULL,19226,'AB33888',NULL,NULL,'AB33888:#2:2',NULL,'main',1,'AB33888','3802',169,'','0.136',1,'9.00*(0.136)',1.224000,NULL,NULL,1,'2026-08-23 18:18:16');


-- =====================================================================
-- process 4176 -- XE8877003 (company 123, XE88 LC)
-- =====================================================================
INSERT INTO process
  (id, process_id, description_id, currency_id, remove_word, replace_word_from, replace_word_to, remark,
   status, enable_save_draft, dts_modified, modified_by, modified_by_type, modified_by_owner_id,
   dts_created, created_by, created_by_type, created_by_owner_id, company_id, sync_source_process_id)
VALUES
  (4176, 'XE8877003', 1900, 169, '', 'TOTAL WIN:', 'XE8877003', '',
   'active', 0, '2026-08-23 19:55:44', NULL, 'user', NULL,
   '2026-04-24 04:54:13', 264, 'user', NULL, 123, NULL);

INSERT INTO data_captures
  (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES
  (8797, 123, 'company', NULL, '2026-04-19', 4176, 'XE8877003', 169, '2026-04-23 20:57:22', 264, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (123,'company',NULL,8797,'95XE016',NULL,NULL,'95XE016:A:1',NULL,'main',1,'','3883',169,'','0.145',1,'895.46*(0.145)',-129.841700,NULL,NULL,0,'2026-04-23 20:57:22'),
  (123,'company',NULL,8797,'95XE016',NULL,'95XE016','95XE016:A:1',NULL,'sub',1,'','3963',169,'','0.005',1,'895.46*(0.005)',4.477300,NULL,NULL,0,'2026-04-23 20:57:22'),
  (123,'company',NULL,8797,'XE8877003',NULL,NULL,'XE8877003:B:1',NULL,'main',1,'','3776',169,'','0.14',1,'895.46*(0.14)',125.364400,NULL,NULL,1,'2026-04-23 20:57:22');

INSERT INTO data_captures
  (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES
  (8913, 123, 'company', NULL, '2026-04-26', 4176, 'XE8877003', 169, '2026-04-26 16:37:59', 264, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (123,'company',NULL,8913,'95XE016',NULL,NULL,'95XE016:A:1',NULL,'main',1,'','3883',169,'','0.145',1,'99.95*(0.145)',-14.492750,NULL,NULL,0,'2026-04-26 16:37:59'),
  (123,'company',NULL,8913,'95XE016',NULL,'95XE016','95XE016:A:1',NULL,'sub',1,'','3963',169,'','0.005',1,'99.95*(0.005)',0.499750,NULL,NULL,0,'2026-04-26 16:37:59'),
  (123,'company',NULL,8913,'XE8877003',NULL,NULL,'XE8877003:B:1',NULL,'main',1,'','3776',169,'','0.14',1,'99.95*(0.14)',13.993000,NULL,NULL,1,'2026-04-26 16:37:59');

INSERT INTO data_captures
  (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES
  (17371, 123, 'company', NULL, '2026-08-02', 4176, 'XE8877003', 169, '2026-08-02 08:11:59', 264, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (123,'company',NULL,17371,'95XE016',NULL,NULL,'95XE016:A:1',NULL,'main',1,'95XE016','3883',169,'','0.145',1,'(-185.46)*(0.145)',26.891700,NULL,NULL,0,'2026-08-02 08:11:59'),
  (123,'company',NULL,17371,'95XE016',NULL,'95XE016','95XE016:A:1',NULL,'sub',1,'95XE016','3963',169,'','0.005',1,'(-185.46)*(0.005)',-0.927300,NULL,NULL,0,'2026-08-02 08:11:59'),
  (123,'company',NULL,17371,'XE8877003',NULL,NULL,'XE8877003:B:1',NULL,'main',1,'XE8877003','3776',169,'','0.14',1,'(-185.46)*(0.14)',-25.964400,NULL,NULL,1,'2026-08-02 08:11:59');


-- =====================================================================
-- process 4419 -- AP7FT003 (company 124)
-- =====================================================================
INSERT INTO process
  (id, process_id, description_id, currency_id, remove_word, replace_word_from, replace_word_to, remark,
   status, enable_save_draft, dts_modified, modified_by, modified_by_type, modified_by_owner_id,
   dts_created, created_by, created_by_type, created_by_owner_id, company_id, sync_source_process_id)
VALUES
  (4419, 'AP7FT003', 2021, 177, '', 'SUB TOTAL', 'AP7FT003', '',
   'active', 0, '2026-06-14 10:30:13', NULL, 'user', NULL,
   '2026-06-14 10:30:13', 260, 'user', NULL, 124, NULL);

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (13147, 124, 'company', NULL, '2026-06-14', 4419, 'AP7FT003', 177, '2026-06-15 01:05:02', 260, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,13147,'RSFT003',NULL,NULL,'RSFT003:A:2',NULL,'main',1,'','3763',177,'','1',1,'2035.71*0.45',916.069500,NULL,NULL,0,'2026-06-15 01:05:02'),
  (124,'company',NULL,13147,'RSFT003',NULL,'RSFT003','RSFT003:A:2',NULL,'sub',1,'','5383',177,'','1',1,'2035.71*0.05',101.785500,NULL,NULL,0,'2026-06-15 01:05:02'),
  (124,'company',NULL,13147,'RSFT005',NULL,NULL,'RSFT005:B:2',NULL,'main',1,'','5383',177,'','1',1,'1.35*0.5',0.675000,NULL,NULL,1,'2026-06-15 01:05:02'),
  (124,'company',NULL,13147,'RSFT007',NULL,NULL,'RSFT007:C:2',NULL,'main',1,'','3709',177,'','1',1,'112.08*0.45',50.436000,NULL,NULL,2,'2026-06-15 01:05:02'),
  (124,'company',NULL,13147,'RSFT007',NULL,'RSFT007','RSFT007:C:2',NULL,'sub',1,'','5383',177,'','1',1,'112.08*0.05',5.604000,NULL,NULL,2,'2026-06-15 01:05:02'),
  (124,'company',NULL,13147,'RSFT008',NULL,NULL,'RSFT008:D:2',NULL,'main',1,'','5383',177,'','1',1,'791.09*0.5',395.545000,NULL,NULL,3,'2026-06-15 01:05:02'),
  (124,'company',NULL,13147,'AP7FT003',NULL,NULL,'AP7FT003:E:1',NULL,'main',1,'','3691',177,'','1',1,'2940.23*0.5',-1470.115000,NULL,NULL,4,'2026-06-15 01:05:02');

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (13827, 124, 'company', NULL, '2026-06-21', 4419, 'AP7FT003', 177, '2026-06-22 00:29:36', 260, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,13827,'RSFT003',NULL,NULL,'RSFT003:A:2',NULL,'main',1,'','3763',177,'','1',1,'757.19*0.45',340.735500,NULL,NULL,0,'2026-06-22 00:29:36'),
  (124,'company',NULL,13827,'RSFT003',NULL,'RSFT003','RSFT003:A:2',NULL,'sub',1,'','5383',177,'','1',1,'757.19*0.05',37.859500,NULL,NULL,0,'2026-06-22 00:29:36'),
  (124,'company',NULL,13827,'RSFT007',NULL,NULL,'RSFT007:C:2',NULL,'main',1,'','3709',177,'','1',1,'21.91*0.45',9.859500,NULL,NULL,2,'2026-06-22 00:29:36'),
  (124,'company',NULL,13827,'RSFT007',NULL,'RSFT007','RSFT007:C:2',NULL,'sub',1,'','5383',177,'','1',1,'21.91*0.05',1.095500,NULL,NULL,2,'2026-06-22 00:29:36'),
  (124,'company',NULL,13827,'RSFT008',NULL,NULL,'RSFT008:D:2',NULL,'main',1,'','5383',177,'','1',1,'1340.29*0.5',670.145000,NULL,NULL,3,'2026-06-22 00:29:36'),
  (124,'company',NULL,13827,'AP7FT003',NULL,NULL,'AP7FT003:E:1',NULL,'main',1,'','3691',177,'','1',1,'2119.39*0.5',-1059.695000,NULL,NULL,4,'2026-06-22 00:29:36');

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (14579, 124, 'company', NULL, '2026-06-28', 4419, 'AP7FT003', 177, '2026-06-29 05:22:03', 260, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,14579,'RSFT003',NULL,NULL,'RSFT003:A:2',NULL,'main',1,'','3763',177,'','1',1,'(-3963.24)*0.45',-1783.458000,NULL,NULL,0,'2026-06-29 05:22:03'),
  (124,'company',NULL,14579,'RSFT003',NULL,'RSFT003','RSFT003:A:2',NULL,'sub',1,'','5383',177,'','1',1,'(-3963.24)*0.05',-198.162000,NULL,NULL,0,'2026-06-29 05:22:03'),
  (124,'company',NULL,14579,'RSFT008',NULL,NULL,'RSFT008:D:2',NULL,'main',1,'','5383',177,'','1',1,'851.64*0.5',425.820000,NULL,NULL,3,'2026-06-29 05:22:03'),
  (124,'company',NULL,14579,'RSFT011',NULL,NULL,'RSFT011:C:2',NULL,'main',1,'','5383',177,'','1',1,'4901.27*0.5',2450.635000,NULL,NULL,2,'2026-06-29 05:22:03'),
  (124,'company',NULL,14579,'AP7FT003',NULL,NULL,'AP7FT003:E:1',NULL,'main',1,'','3691',177,'','1',1,'1789.67*0.5',-894.835000,NULL,NULL,4,'2026-06-29 05:22:03');

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (15176, 124, 'company', NULL, '2026-07-05', 4419, 'AP7FT003', 177, '2026-07-05 23:47:21', 260, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,15176,'RSFT003',NULL,NULL,'RSFT003:A:2',NULL,'main',1,'','3763',177,'','1',1,'1567.73*0.45',705.478500,NULL,NULL,0,'2026-07-05 23:47:21'),
  (124,'company',NULL,15176,'RSFT003',NULL,'RSFT003','RSFT003:A:2',NULL,'sub',1,'','5383',177,'','1',1,'1567.73*0.05',78.386500,NULL,NULL,0,'2026-07-05 23:47:21'),
  (124,'company',NULL,15176,'RSFT008',NULL,NULL,'RSFT008:D:2',NULL,'main',1,'','5383',177,'','1',1,'1952.12*0.5',976.060000,NULL,NULL,3,'2026-07-05 23:47:21'),
  (124,'company',NULL,15176,'RSFT011',NULL,NULL,'RSFT011:C:2',NULL,'main',1,'','5383',177,'','1',1,'(-4574.45)*0.5',-2287.225000,NULL,NULL,2,'2026-07-05 23:47:21'),
  (124,'company',NULL,15176,'AP7FT003',NULL,NULL,'AP7FT003:E:1',NULL,'main',1,'','3691',177,'','1',1,'(-1054.60)*0.5',527.300000,NULL,NULL,4,'2026-07-05 23:47:21');

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (15977, 124, 'company', NULL, '2026-07-12', 4419, 'AP7FT003', 177, '2026-07-13 00:39:36', 260, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,15977,'RSFT003',NULL,NULL,'RSFT003:A:2',NULL,'main',1,'','3763',177,'','1',1,'(-75.42)*0.45',-33.939000,NULL,NULL,0,'2026-07-13 00:39:36'),
  (124,'company',NULL,15977,'RSFT003',NULL,'RSFT003','RSFT003:A:2',NULL,'sub',1,'','5383',177,'','1',1,'(-75.42)*0.05',-3.771000,NULL,NULL,0,'2026-07-13 00:39:36'),
  (124,'company',NULL,15977,'RSFT007',NULL,NULL,'RSFT007:C:2',NULL,'main',1,'','3709',177,'','1',1,'34.61*0.45',15.574500,NULL,NULL,2,'2026-07-13 00:39:36'),
  (124,'company',NULL,15977,'RSFT007',NULL,'RSFT007','RSFT007:C:2',NULL,'sub',1,'','5383',177,'','1',1,'34.61*0.05',1.730500,NULL,NULL,2,'2026-07-13 00:39:36'),
  (124,'company',NULL,15977,'RSFT008',NULL,NULL,'RSFT008:D:2',NULL,'main',1,'','5383',177,'','1',1,'3769.88*0.5',1884.940000,NULL,NULL,3,'2026-07-13 00:39:36'),
  (124,'company',NULL,15977,'RSFT011',NULL,NULL,'RSFT011:C:2',NULL,'main',1,'','5383',177,'','1',1,'9593.64*0.5',4796.820000,NULL,NULL,2,'2026-07-13 00:39:36'),
  (124,'company',NULL,15977,'AP7FT003',NULL,NULL,'AP7FT003:E:1',NULL,'main',1,'','3691',177,'','1',1,'13322.72*0.5',-6661.360000,NULL,NULL,4,'2026-07-13 00:39:36');

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (16602, 124, 'company', NULL, '2026-07-19', 4419, 'AP7FT003', 177, '2026-07-20 00:11:33', 260, 'user', NULL, NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,16602,'RSFT003',NULL,NULL,'RSFT003:A:2',NULL,'main',1,'','3763',177,'','1',1,'1354.37*0.45',609.466500,NULL,NULL,0,'2026-07-20 00:11:33'),
  (124,'company',NULL,16602,'RSFT003',NULL,'RSFT003','RSFT003:A:2',NULL,'sub',1,'','5383',177,'','1',1,'1354.37*0.05',67.718500,NULL,NULL,0,'2026-07-20 00:11:33'),
  (124,'company',NULL,16602,'RSFT008',NULL,NULL,'RSFT008:D:2',NULL,'main',1,'','5383',177,'','1',1,'10031.93*0.5',5015.965000,NULL,NULL,3,'2026-07-20 00:11:33'),
  (124,'company',NULL,16602,'AP7FT003',NULL,NULL,'AP7FT003:E:1',NULL,'main',1,'','3691',177,'','1',1,'11386.30*0.5',-5693.150000,NULL,NULL,4,'2026-07-20 00:11:33');


-- =====================================================================
-- process 4591 -- REDIRECT2UMYR (company 124)
-- =====================================================================
INSERT INTO process
  (id, process_id, description_id, currency_id, remove_word, replace_word_from, replace_word_to, remark,
   status, enable_save_draft, dts_modified, modified_by, modified_by_type, modified_by_owner_id,
   dts_created, created_by, created_by_type, created_by_owner_id, company_id, sync_source_process_id)
VALUES
  (4591, 'REDIRECT2UMYR', 2073, 177, '', '', 'REDIRECT2UMYR', '',
   'active', 0, '2026-07-14 13:41:38', 261, 'user', NULL,
   '2026-07-14 12:22:49', 261, 'user', NULL, 124, NULL);

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (16026, 124, 'company', NULL, '2026-07-12', 4591, 'REDIRECT2UMYR', 177, '2026-07-14 05:23:40', 261, 'user', '2026 JUN', NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,16026,'REDIRECT2UMYR',NULL,NULL,'REDIRECT2UMYR:A:7',NULL,'main',1,'','5480',177,'','1',1,'(1296.45)*0.1075',-139.368375,NULL,NULL,0,'2026-07-14 05:23:40'),
  (124,'company',NULL,16026,'REDIRECT2UMYR',NULL,'REDIRECT2UMYR','REDIRECT2UMYR:A:7',NULL,'sub',1,'','3691',177,'','1',1,'(1296.45)*0.1075',139.368375,NULL,NULL,0,'2026-07-14 05:23:40'),
  (124,'company',NULL,16026,'REDIRECT2UMYR','PROFIT','REDIRECT2UMYR','REDIRECT2UMYR:A:7',NULL,'sub',1,'','5495',177,'','1',1,'(1296.45)*0.0025',3.241125,NULL,NULL,0,'2026-07-14 05:23:40'),
  (124,'company',NULL,16026,'REDIRECT2UMYR','PROFIT','REDIRECT2UMYR','REDIRECT2UMYR:A:7',NULL,'sub',1,'','3691',177,'','1',1,'(1296.45)*0.0025',-3.241125,NULL,NULL,0,'2026-07-14 05:23:40');

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (19079, 124, 'company', NULL, '2026-08-16', 4591, 'REDIRECT2UMYR', 177, '2026-08-17 02:50:30', 261, 'user', 'JULY 2026', NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (124,'company',NULL,19079,'REDIRECT2UMYR',NULL,NULL,'REDIRECT2UMYR:A:7',NULL,'main',1,'REDIRECT2UMYR','5480',177,'','1',1,'(-564.64)*0.1075',60.698800,NULL,NULL,0,'2026-08-17 02:50:30'),
  (124,'company',NULL,19079,'REDIRECT2UMYR',NULL,'REDIRECT2UMYR','REDIRECT2UMYR:A:7',NULL,'sub',1,'REDIRECT2UMYR','3691',177,'','1',1,'(-564.64)*0.1075',-60.698800,NULL,NULL,0,'2026-08-17 02:50:30'),
  (124,'company',NULL,19079,'REDIRECT2UMYR','PROFIT','REDIRECT2UMYR','REDIRECT2UMYR:A:7',NULL,'sub',1,'REDIRECT2UMYR','5495',177,'','1',1,'(-564.64)*0.0025',-1.411600,NULL,NULL,0,'2026-08-17 02:50:30'),
  (124,'company',NULL,19079,'REDIRECT2UMYR','PROFIT','REDIRECT2UMYR','REDIRECT2UMYR:A:7',NULL,'sub',1,'REDIRECT2UMYR','3691',177,'','1',1,'(-564.64)*0.0025',1.411600,NULL,NULL,0,'2026-08-17 02:50:30');


-- =====================================================================
-- process 4538 -- INFINITY688US-2 (company 127)
-- =====================================================================
INSERT INTO process
  (id, process_id, description_id, currency_id, remove_word, replace_word_from, replace_word_to, remark,
   status, enable_save_draft, dts_modified, modified_by, modified_by_type, modified_by_owner_id,
   dts_created, created_by, created_by_type, created_by_owner_id, company_id, sync_source_process_id)
VALUES
  (4538, 'INFINITY688US-2', 1941, 190, 'NET - LOSE - API=;NET - WIN - API=', '', '', '2026 ',
   'active', 0, '2026-06-29 12:22:17', NULL, 'user', NULL,
   '2026-06-29 12:22:17', 254, 'user', NULL, 127, 4265);

INSERT INTO data_captures (id, company_id, scope_type, scope_id, capture_date, process_id, process_code, currency_id, created_at, created_by, user_type, remark, submit_request_id)
VALUES (14573, 127, 'company', NULL, '2026-06-28', 4538, 'INFINITY688US-2', 190, '2026-06-29 04:27:44', 254, 'user', '2026 MAY', NULL);
INSERT INTO data_capture_details
  (company_id, scope_type, scope_id, capture_id, id_product_main, description_main, id_product_sub, columns_value, description_sub, product_type, formula_variant, id_product, account_id, currency_id, source_value, source_percent, enable_source_percent, formula, processed_amount, rate, rate_expression, display_order, created_at)
VALUES
  (127,'company',NULL,14573,'YGR - TR8',NULL,NULL,'TR8:A:5',NULL,'main',1,'','4033',190,'','0.07',1,'(-47.63000000)*(0.07)',3.334100,NULL,NULL,0,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'YGR - TR8',NULL,'YGR - TR8','TR8:A:5',NULL,'sub',1,'','4023',190,'','0.015/2',1,'(-47.63000000)*(0.015/2)',-0.357225,NULL,NULL,0,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'YGR - TR8',NULL,'YGR - TR8','TR8:A:5',NULL,'sub',1,'','5151',190,'','0.015/2',1,'(-47.63000000)*(0.015/2)',-0.357225,NULL,NULL,0,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'YGR - TR8',NULL,'YGR - TR8','TR8:A:1',NULL,'sub',1,'','4503',190,'','1',1,'2.62',-2.620000,NULL,NULL,0,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'ACEWIN - ACEWIN=TR8=MYR',NULL,NULL,'ACEWIN=TR8=MYR:C:5 ACEWIN=TR8=MYR:C:7',NULL,'main',1,'','4033',190,'','0.07',1,'454.21000000*0.25430000*(0.07)',-8.085392,NULL,NULL,2,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'ACEWIN - ACEWIN=TR8=MYR',NULL,'ACEWIN - ACEWIN=TR8=MYR','ACEWIN - ACEWIN=TR8=MYR:B:6 ACEWIN - ACEWIN=TR8=MYR:B:8',NULL,'sub',1,'','4023',190,'','0.01/2',1,'454.21000000*0.25430000*(0.01/2)',0.577528,NULL,NULL,2,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'ACEWIN - ACEWIN=TR8=MYR',NULL,'ACEWIN - ACEWIN=TR8=MYR','ACEWIN - ACEWIN=TR8=MYR:B:6 ACEWIN - ACEWIN=TR8=MYR:B:8',NULL,'sub',1,'','5151',190,'','0.01/2',1,'454.21000000*0.25430000*(0.01/2)',0.577528,NULL,NULL,2,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'ACEWIN - ACEWIN=TR8=MYR',NULL,'ACEWIN - ACEWIN=TR8=MYR','ACEWIN - ACEWIN=TR8=MYR:B:2',NULL,'sub',1,'','4503',190,'','1',1,'(-6.93)',6.930000,NULL,NULL,2,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'FACHAI - TR8',NULL,NULL,'FACHAI - TR8:C:6 FACHAI - TR8:C:8',NULL,'main',1,'','4033',190,'','0.07',1,'(-442.74000000)*0.25216720*(0.07)',-7.815115,NULL,NULL,1,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'FACHAI - TR8',NULL,'FACHAI - TR8','FACHAI - TR8:A:6 FACHAI - TR8:A:8',NULL,'sub',1,'','4023',190,'','0.005',1,'(-442.74000000)*0.25216720*(0.005)',0.558223,NULL,NULL,1,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'FACHAI - TR8',NULL,'FACHAI - TR8','FACHAI - TR8:A:6 FACHAI - TR8:A:8',NULL,'sub',1,'','5151',190,'','0.005',1,'(-442.74000000)*0.25216720*(0.005)',0.558223,NULL,NULL,1,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'FACHAI - TR8',NULL,'FACHAI - TR8','TR8:B:1',NULL,'sub',1,'','4503',190,'','1',1,'(-6.70)',6.700000,NULL,NULL,1,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - TR8=PP',NULL,NULL,'TR8=PP:D:6',NULL,'main',1,'','4033',190,'','0.08',1,'9.90000000*(0.08)',-0.792000,NULL,NULL,3,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - TR8=PP',NULL,'IG - TR8=PP','TR8=PP:D:6',NULL,'sub',1,'','4023',190,'','0.02/2',1,'9.90000000*(0.02/2)',0.099000,NULL,NULL,3,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - TR8=PP',NULL,'IG - TR8=PP','TR8=PP:D:6',NULL,'sub',1,'','5151',190,'','0.02/2',1,'9.90000000*(0.02/2)',0.099000,NULL,NULL,3,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - TR8=PP',NULL,'IG - TR8=PP','TR8=PP:D:2',NULL,'sub',1,'','4503',190,'','1',1,'(-0.59)',0.590000,NULL,NULL,3,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - ZBH3840=MCG',NULL,NULL,'ZBH3840=MCG:E:6 ZBH3840=MCG:E:8',NULL,'main',1,'','4451',190,'','0.1',1,'15.53000000*0.25202000*(0.1)',-0.391387,NULL,NULL,4,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - ZBH3840=MCG',NULL,'IG - ZBH3840=MCG','ZBH3840=MCG:E:6 ZBH3840=MCG:E:8',NULL,'sub',1,'','4452',190,'','0.01',1,'15.53000000*0.25202000*(0.01)',0.039139,NULL,NULL,4,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - ZBH3840=MCG',NULL,'IG - ZBH3840=MCG','IG - ZBH3840=MCG:E:6 IG - ZBH3840=MCG:E:8',NULL,'sub',1,'','5151',190,'','0.02',1,'15.53000000*0.25202000*(0.02)',0.078277,NULL,NULL,4,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'IG - ZBH3840=MCG',NULL,'IG - ZBH3840=MCG','ZBH3840=MCG:E:2',NULL,'sub',1,'','4503',190,'','1',1,'(-0.27)',0.270000,NULL,NULL,4,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'AG(AGIN) - TR8=SLOT',NULL,NULL,'TR8=SLOT:A:5 TR8=SLOT:A:7',NULL,'main',1,'','4033',190,'','.08',1,'454.36000000*1.70294000*(0.08)',-9.148929,6.7658,NULL,2,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'AG(AGIN) - TR8=SLOT',NULL,'AG(AGIN) - TR8=SLOT','AG(AGIN) - TR8=SLOT:C:6 AG(AGIN) - TR8=SLOT:C:8',NULL,'sub',1,'','4023',190,'','0.01/2',1,'454.36000000*1.70294000*(0.01/2)',0.571808,6.7658,NULL,2,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'AG(AGIN) - TR8=SLOT',NULL,'AG(AGIN) - TR8=SLOT','AG(AGIN) - TR8=SLOT:C:6 AG(AGIN) - TR8=SLOT:C:8',NULL,'sub',1,'','5151',190,'','0.01/2',1,'454.36000000*1.70294000*(0.01/2)',0.571808,6.7658,NULL,2,'2026-06-29 04:27:44'),
  (127,'company',NULL,14573,'AG(AGIN) - TR8=SLOT',NULL,'AG(AGIN) - TR8=SLOT','TR8=SLOT:C:2',NULL,'sub',1,'','4503',190,'','1',1,'(-54.16)',8.004966,6.7658,NULL,2,'2026-06-29 04:27:44');


-- =====================================================================
-- process_day: MON (day_id=1) + THU (day_id=4)
-- (AB33888 / 4689 never had a day_use schedule -- not included, matches original)
-- =====================================================================
INSERT INTO process_day (process_id, day_id) VALUES
  (4176, 1), (4176, 4),
  (4419, 1), (4419, 4),
  (4591, 1), (4591, 4),
  (4538, 1), (4538, 4);


-- =====================================================================
-- submitted_processes: 6 rows
-- =====================================================================
INSERT INTO submitted_processes
  (company_id, scope_type, scope_id, user_id, user_type, process_id, process_code, date_submitted, capture_date, created_at)
VALUES
  (124, 'company', NULL, 260, 'user', 4419, 'AP7FT003', '2026-06-28', '2026-06-28', '2026-06-29 13:22:03'),
  (124, 'company', NULL, 260, 'user', 4419, 'AP7FT003', '2026-07-05', '2026-07-05', '2026-07-06 07:47:21'),
  (124, 'company', NULL, 260, 'user', 4419, 'AP7FT003', '2026-07-12', '2026-07-12', '2026-07-13 08:39:36'),
  (124, 'company', NULL, 260, 'user', 4419, 'AP7FT003', '2026-07-19', '2026-07-19', '2026-07-20 08:11:33'),
  (127, 'company', NULL, 254, 'user', 4538, 'INFINITY688US-2', '2026-06-28', '2026-06-28', '2026-06-29 12:27:44'),
  (124, 'company', NULL, 261, 'user', 4591, 'REDIRECT2UMYR', '2026-07-12', '2026-07-12', '2026-07-14 13:23:40');


-- =====================================================================
-- Verification -- review before COMMIT
-- =====================================================================
SELECT id, process_id, description_id, company_id FROM process WHERE id IN (4689,4176,4419,4591,4538) ORDER BY id;
-- Expect exactly the 5 rows above, with these exact ids.

SELECT capture_id, COUNT(*) AS detail_rows, ROUND(SUM(processed_amount),6) AS sum_amount
FROM data_capture_details
WHERE capture_id IN (19226,8797,8913,17371,13147,13827,14579,15176,15977,16602,16026,19079,14573)
GROUP BY capture_id;
-- Expect 13 rows: detail_rows 3/3/3/3/7/6/5/5/7/4/4/4/24 (78 total),
-- sums all 0 except the AP7FT003 07-12 capture (-0.005) and the
-- INFINITY688US-2 capture (-0.007673).

SELECT process_id, COUNT(*) FROM process_day WHERE process_id IN (4176,4419,4591,4538) GROUP BY process_id;
-- Expect 2 rows each (MON, THU).

SELECT process_code, COUNT(*) FROM submitted_processes WHERE process_id IN (4419,4591,4538) GROUP BY process_code;
-- Expect AP7FT003=4, REDIRECT2UMYR=1, INFINITY688US-2=1.

-- If everything matches:
-- COMMIT;
-- Otherwise:
-- ROLLBACK;
