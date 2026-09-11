#!/usr/bin/env python3
"""Rewrite a .com phpMyAdmin dump for direct import into c168_org via DBeaver."""

from __future__ import annotations

import argparse
from pathlib import Path

SOURCE_DB = "u857194726_count168"
TARGET_DB = "c168_org"
DEFINER_REPLACEMENT = "admin@%"
# MariaDB 11.8 on Hostinger uses uca1400; older local MariaDB/MySQL does not.
COLLATION_REPLACEMENTS = {
    "utf8mb4_uca1400_ai_ci": "utf8mb4_unicode_ci",
    "utf8mb4_uca1400_as_ci": "utf8mb4_unicode_ci",
    "utf8mb4_uca1400_as_cs": "utf8mb4_unicode_ci",
}
HEADER = f"""-- Rewritten for direct DBeaver import into `{TARGET_DB}`
-- Source dump database name was `{SOURCE_DB}`.
-- Post-restore org fixes are appended at the end of this file.

USE `{TARGET_DB}`;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;

"""


def rewrite_dump(source: Path, target: Path, fixes: Path | None) -> None:
    replacements = {
        f"`{SOURCE_DB}`@`127.0.0.1`": f"`{DEFINER_REPLACEMENT.split('@')[0]}`@`{DEFINER_REPLACEMENT.split('@')[1]}`",
        f"-- Database: `{SOURCE_DB}`": f"-- Database: `{TARGET_DB}` (rewritten)",
        SOURCE_DB: TARGET_DB,
    }
    replacements.update(COLLATION_REPLACEMENTS)

    with source.open("r", encoding="utf-8", errors="replace") as src, target.open(
        "w", encoding="utf-8", newline="\n"
    ) as out:
        out.write(HEADER)
        for line in src:
            for old, new in replacements.items():
                line = line.replace(old, new)
            out.write(line)

        if fixes and fixes.is_file():
            out.write("\n\n-- ========== POST-RESTORE FIXES (appended) ==========\n\n")
            fix_text = fixes.read_text(encoding="utf-8")
            # Drop leading USE to avoid switching context mid-file after dump COMMIT.
            fix_lines = []
            for fix_line in fix_text.splitlines():
                stripped = fix_line.strip()
                if stripped.upper().startswith("USE `"):
                    continue
                fix_lines.append(fix_line)
            out.write("\n".join(fix_lines))
            if not fix_lines[-1].endswith("\n"):
                out.write("\n")

        out.write(
            "\nSET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;\n"
            "SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;\n"
        )

    print(f"Wrote: {target}")
    print(f"Size: {target.stat().st_size / (1024 * 1024):.1f} MB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Original .com dump (.sql)")
    parser.add_argument("--target", required=True, help="Output .sql for c168_org import")
    parser.add_argument(
        "--fixes",
        default="",
        help="Optional post_restore_fixes.sql to append",
    )
    args = parser.parse_args()

    fixes = Path(args.fixes) if args.fixes else None
    rewrite_dump(Path(args.source), Path(args.target), fixes)


if __name__ == "__main__":
    main()
