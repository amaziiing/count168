-- Pre-flight check: run this FIRST against the target database, BEFORE
-- running 20260824_full_migration_consolidated.sql there. Read-only, safe
-- to run anywhere, changes nothing.
--
-- It answers three questions:
--   1. Are the 5 process rows / 13 data_captures rows actually missing here
--      (i.e. did the same incident happen on this database too)?
--   2. Are the 18 target ids free to reuse (required for the migration file
--      to work as-is)?
--   3. Do description/currency/company mean the same thing here as they did
--      in c168_org (the migration file's values are hard-coded against that
--      database's content)?

-- ---------------------------------------------------------------------
-- 1. Are these 5 processes actually missing here?
-- ---------------------------------------------------------------------
SELECT 'process_check' AS section, id, process_id, description_id, company_id
FROM process
WHERE id IN (4689, 4176, 4419, 4591, 4538);
-- If this returns 0 rows: the 5 processes are indeed missing here, same as
-- the incident -- and the ids are free for the migration to reuse.
-- If this returns 5 rows already matching (AB33888/XE8877003/AP7FT003/
-- REDIRECT2UMYR/INFINITY688US-2 with those description_ids): nothing is
-- missing here, you don't need to run the migration.
-- If it returns rows that DON'T match those names/descriptions: STOP --
-- those ids are already used by unrelated data on this database, the
-- migration file cannot be used as-is here.

-- ---------------------------------------------------------------------
-- 2. Are the 13 data_captures ids free?
-- ---------------------------------------------------------------------
SELECT 'data_captures_check' AS section, id, process_id, capture_date
FROM data_captures
WHERE id IN (19226,8797,8913,17371,13147,13827,14579,15176,15977,16602,16026,19079,14573);
-- Same logic: expect 0 rows (free / actually missing) for the migration to
-- be usable as-is.

-- ---------------------------------------------------------------------
-- 3. Do the reference ids mean the same thing on this database?
-- ---------------------------------------------------------------------
SELECT 'description_check' AS section, id, name, company_id FROM description WHERE id IN (1900, 2021, 2073, 1941);
-- Expect: 1900='XE88 LC' (company 123), 2073='API BWG' (company 124),
-- 1941='INFINITY688 API USD' (company 127). 2021 can be any text (AP7FT003's
-- description text isn't required to match the process code) but MUST exist
-- for company 124, otherwise the process 4419 insert will fail its own FK
-- to description.

SELECT 'currency_check' AS section, id, code FROM currency WHERE id IN (169, 177, 190);
-- Expect: 169='MYR', 177='MYR', 190='USD'.

SELECT 'company_check' AS section, id, company_id AS company_code FROM company WHERE id IN (123, 124, 127);
-- Compare these codes against what you know these companies to be on this
-- database -- they don't have to be '95'/'RS'/'AG' like in c168_org, just
-- confirm id 123/124/127 point at the SAME three companies you intend to
-- restore data for.

-- ---------------------------------------------------------------------
-- 4. Bonus: does this database have its own duplicate-description problem
--    (the root cause of the original incident), independent of the above?
-- ---------------------------------------------------------------------
SELECT 'duplicate_description_check' AS section, company_id, name, COUNT(*) AS c
FROM description
GROUP BY company_id, name
HAVING c > 1
ORDER BY c DESC, company_id;
-- If this returns any rows, this database has the same underlying bug
-- (covered earlier in this incident) and may need its own separate
-- investigation before -- or regardless of -- running the migration file.
