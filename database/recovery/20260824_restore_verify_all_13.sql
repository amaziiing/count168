-- Final verification for the full 2026-08-24 cascade-delete recovery.
-- Confirms all 13 restored captures exist, with the right detail-row counts
-- and amounts, by matching on natural key (company_id, process_code,
-- capture_date, created_by) rather than the new auto-increment ids -- so this
-- can be run any time after both recovery scripts have been committed,
-- without needing to know the new ids.
--
-- Run: part 1 (10 captures) + part 2 (3 captures, XE8877003) must both be
-- committed first. Then run this as a plain SELECT script.

SELECT
  expected.company_id,
  expected.process_code,
  expected.capture_date,
  dc.id AS restored_capture_id,
  expected.expected_details,
  COUNT(dcd.id) AS actual_details,
  expected.expected_sum,
  ROUND(SUM(dcd.processed_amount), 6) AS actual_sum,
  CASE
    WHEN dc.id IS NULL THEN 'MISSING - capture not found'
    WHEN COUNT(dcd.id) <> expected.expected_details THEN 'MISMATCH - detail row count'
    ELSE 'OK'
  END AS check_result
FROM (
  SELECT 123 AS company_id, 'AB33888'        AS process_code, '2026-08-23' AS capture_date, 265 AS created_by, 3  AS expected_details, 0.000000  AS expected_sum
  UNION ALL SELECT 123, 'XE8877003', '2026-04-19', 264, 3,  0.000000
  UNION ALL SELECT 123, 'XE8877003', '2026-04-26', 264, 3,  0.000000
  UNION ALL SELECT 123, 'XE8877003', '2026-08-02', 264, 3,  0.000000
  UNION ALL SELECT 124, 'AP7FT003',  '2026-06-14', 260, 7,  0.000000
  UNION ALL SELECT 124, 'AP7FT003',  '2026-06-21', 260, 6,  0.000000
  UNION ALL SELECT 124, 'AP7FT003',  '2026-06-28', 260, 5,  0.000000
  UNION ALL SELECT 124, 'AP7FT003',  '2026-07-05', 260, 5,  0.000000
  UNION ALL SELECT 124, 'AP7FT003',  '2026-07-12', 260, 7, -0.005000
  UNION ALL SELECT 124, 'AP7FT003',  '2026-07-19', 260, 4,  0.000000
  UNION ALL SELECT 124, 'REDIRECT2UMYR', '2026-07-12', 261, 4,  0.000000
  UNION ALL SELECT 124, 'REDIRECT2UMYR', '2026-08-16', 261, 4,  0.000000
  UNION ALL SELECT 127, 'INFINITY688US-2', '2026-06-28', 254, 24, -0.007673
) AS expected
LEFT JOIN data_captures dc
  ON dc.company_id = expected.company_id
 AND dc.process_code = expected.process_code
 AND dc.capture_date = expected.capture_date
 AND dc.created_by = expected.created_by
LEFT JOIN data_capture_details dcd
  ON dcd.capture_id = dc.id
GROUP BY expected.company_id, expected.process_code, expected.capture_date, dc.id, expected.expected_details, expected.expected_sum
ORDER BY expected.company_id, expected.process_code, expected.capture_date;

-- Expect 13 rows, every one showing check_result = 'OK'.
-- If any row shows MISSING or MISMATCH, stop and don't treat the recovery as
-- done -- come back with that row's details before closing this out.
