-- Read-only: submitted_processes joined to their data_captures / data_capture_details
-- amounts, for the processes restored on 2026-08-24 (AP7FT003, REDIRECT2UMYR,
-- INFINITY688US-2). Safe to run any time after part 1/2/3 have been committed.

SELECT
  sp.process_code,
  sp.capture_date,
  sp.date_submitted,
  sp.user_id       AS submitted_by_user_id,
  sp.created_at    AS submitted_at,
  dcd.id_product_main,
  dcd.description_main,
  dcd.processed_amount,
  dcd.currency_id
FROM submitted_processes sp
JOIN process p
  ON p.id = sp.process_id
JOIN data_captures dc
  ON dc.company_id = sp.company_id
 AND dc.process_code = sp.process_code
 AND dc.capture_date = sp.capture_date
JOIN data_capture_details dcd
  ON dcd.capture_id = dc.id
WHERE sp.process_code IN ('AP7FT003', 'REDIRECT2UMYR', 'INFINITY688US-2')
ORDER BY sp.process_code, sp.capture_date, dcd.display_order, dcd.id;

-- Per-capture totals only (no line-item breakdown):
SELECT
  sp.process_code,
  sp.capture_date,
  sp.date_submitted,
  sp.user_id AS submitted_by_user_id,
  COUNT(dcd.id) AS detail_lines,
  SUM(dcd.processed_amount) AS net_amount
FROM submitted_processes sp
JOIN data_captures dc
  ON dc.company_id = sp.company_id
 AND dc.process_code = sp.process_code
 AND dc.capture_date = sp.capture_date
JOIN data_capture_details dcd
  ON dcd.capture_id = dc.id
WHERE sp.process_code IN ('AP7FT003', 'REDIRECT2UMYR', 'INFINITY688US-2')
GROUP BY sp.process_code, sp.capture_date, sp.date_submitted, sp.user_id
ORDER BY sp.process_code, sp.capture_date;
