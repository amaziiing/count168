-- Corrects a systematic date/time error introduced by the recovery script:
-- every capture_date / created_at / dts_created / dts_modified value used in
-- 20260824_restore_all_original_ids.sql was read through a MySQL query tool
-- whose session timezone was 8 hours behind the server's actual stored time
-- (server stores Malaysia time, UTC+8). For early-morning timestamps this
-- pushed the DATE back by one day -- confirmed against the raw dump text in
-- dump-c168_net-202608241230.sql (which is plain SQL text, immune to any
-- client-side timezone conversion) for all 13 captures and all 5 processes.
--
-- This does NOT touch data_capture_details.processed_amount or any other
-- financial figures -- only date/time columns.
--
-- Run in `c168_org`, one script, review before COMMIT.

START TRANSACTION;

-- =====================================================================
-- data_captures: capture_date +1 day, created_at +8 hours
-- =====================================================================
UPDATE data_captures
SET capture_date = DATE_ADD(capture_date, INTERVAL 1 DAY),
    created_at = DATE_ADD(created_at, INTERVAL 8 HOUR)
WHERE id IN (19226,8797,8913,17371,13147,13827,14579,15176,15977,16602,16026,19079,14573);

-- =====================================================================
-- data_capture_details: created_at +8 hours (same offset as their parent capture)
-- =====================================================================
UPDATE data_capture_details
SET created_at = DATE_ADD(created_at, INTERVAL 8 HOUR)
WHERE capture_id IN (19226,8797,8913,17371,13147,13827,14579,15176,15977,16602,16026,19079,14573);

-- =====================================================================
-- process: dts_created / dts_modified +8 hours (confirmed same-day for all 5,
-- but applying as a proper interval handles any edge case correctly anyway)
-- =====================================================================
UPDATE process
SET dts_created = DATE_ADD(dts_created, INTERVAL 8 HOUR),
    dts_modified = DATE_ADD(dts_modified, INTERVAL 8 HOUR)
WHERE id IN (4689,4176,4419,4591,4538);

-- =====================================================================
-- submitted_processes: date_submitted / capture_date +1 day.
-- created_at is NOT touched -- that column is a plain DATETIME in the
-- backup source (not a TIMESTAMP), so it was never subject to the timezone
-- conversion and was already correct.
-- =====================================================================
UPDATE submitted_processes
SET date_submitted = DATE_ADD(date_submitted, INTERVAL 1 DAY),
    capture_date = DATE_ADD(capture_date, INTERVAL 1 DAY)
WHERE process_id IN (4419,4591,4538);


-- =====================================================================
-- Verification -- review before COMMIT
-- =====================================================================
SELECT id, process_id, capture_date, created_at FROM data_captures
  WHERE id IN (19226,8797,8913,17371,13147,13827,14579,15176,15977,16602,16026,19079,14573)
  ORDER BY id;
-- Expect capture_date: 19226=2026-08-24, 8797=2026-04-20, 8913=2026-04-27,
-- 17371=2026-08-03, 13147=2026-06-15, 13827=2026-06-22, 14579=2026-06-29,
-- 15176=2026-07-06, 15977=2026-07-13, 16602=2026-07-20, 16026=2026-07-13,
-- 19079=2026-08-17, 14573=2026-06-29.

SELECT id, process_id, dts_created, dts_modified FROM process WHERE id IN (4689,4176,4419,4591,4538) ORDER BY id;

SELECT id, process_code, date_submitted, capture_date, created_at FROM submitted_processes
  WHERE process_id IN (4419,4591,4538) ORDER BY process_code, date_submitted;
-- Expect: AP7FT003 dates 2026-06-29 / 07-06 / 07-13 / 07-20;
-- INFINITY688US-2 2026-06-29; REDIRECT2UMYR 2026-07-13.

-- If everything matches:
-- COMMIT;
-- Otherwise:
-- ROLLBACK;
