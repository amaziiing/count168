-- Cleans up a full parallel "shadow" duplicate set left behind by the very
-- first recovery attempt (the session-variable version, before we knew we
-- were working in `c168_org`). That attempt reported an FK error and looked
-- like it failed, but it had actually already succeeded for all 5 processes
-- before the error -- leaving a second, auto-incremented copy of everything
-- alongside the final, correct, original-id copy from
-- 20260824_restore_all_original_ids.sql (+ the timezone fix).
--
-- Shadow (wrong, to be deleted) -> Correct (original id, keep):
--   4694 AB33888          -> 4689
--   4695 AP7FT003         -> 4419
--   4696 REDIRECT2UMYR    -> 4591
--   4697 INFINITY688US-2  -> 4538
--   4698 XE8877003        -> 4176
--
-- process.id cascades ON DELETE to data_captures, data_capture_details (via
-- data_captures), process_day, and submitted_processes (all confirmed
-- CASCADE earlier in this incident), so deleting just these 5 process rows
-- removes every shadow row without touching the correct copies.
--
-- Run in `c168_org`. Review the verification SELECTs, then COMMIT or ROLLBACK.

START TRANSACTION;

DELETE FROM process WHERE id IN (4694, 4695, 4696, 4697, 4698);

-- =====================================================================
-- Verification -- review before COMMIT
-- =====================================================================
SELECT id FROM process WHERE id IN (4694, 4695, 4696, 4697, 4698);
-- Expect: empty (shadow rows gone).

SELECT id, process_id, description_id, company_id FROM process
  WHERE id IN (4689, 4176, 4419, 4591, 4538) ORDER BY id;
-- Expect: exactly these 5 rows, untouched.

SELECT id, process_id, capture_date FROM data_captures
  WHERE id IN (19226,8797,8913,17371,13147,13827,14579,15176,15977,16602,16026,19079,14573)
  ORDER BY process_id, capture_date;
-- Expect: exactly 13 rows, all still pointing at 4689/4176/4419/4591/4538.

SELECT process_id, COUNT(*) FROM process
  WHERE process_id IN ('AB33888','XE8877003','AP7FT003','REDIRECT2UMYR','INFINITY688US-2')
  GROUP BY process_id;
-- Sanity check on overall row counts per process code (includes any other,
-- unrelated pre-existing process rows for the same code -- just confirms no
-- shadow ids remain mixed in).

-- If everything matches:
-- COMMIT;
-- Otherwise:
-- ROLLBACK;
