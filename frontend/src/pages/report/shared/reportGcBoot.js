import { canUseGroupOnlyMode, isCompanyLogin } from "../../../utils/company/loginScope.js";
import { peekCompanySessionFlags } from "../../../utils/company/companySessionFlagsCache.js";
import {
  excludeGroupLabelsFromCompanyPicker,
  filterCompaniesWithDisplayId,
  independentCompaniesForPicker,
  isDashboardGroupOnlyMode,
  pickDefaultCompanyForGroup,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyWhenClosingGroup,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";

/**
 * Report-page-only sessionStorage cache of the owner company list, so a hard refresh can paint
 * Group/Company pills immediately instead of waiting on `fetchOwnerCompaniesAll`. This mirrors
 * `selectedGroup`'s own sync sessionStorage read — the boot fetch still runs afterward and
 * overwrites both this cache and the live `companies` state, so data never goes stale beyond one
 * refresh cycle. Scoped to report pages only — does not touch the shared `ownerCompaniesCache`
 * used by Dashboard / Maintenance / Account / etc.
 */
const REPORT_COMPANIES_CACHE_KEY = "eazycount:report:companies_cache";

export function readReportCompaniesCache() {
  try {
    const raw = sessionStorage.getItem(REPORT_COMPANIES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function persistReportCompaniesCache(rows) {
  try {
    if (!Array.isArray(rows) || rows.length === 0) {
      sessionStorage.removeItem(REPORT_COMPANIES_CACHE_KEY);
      return;
    }
    sessionStorage.setItem(REPORT_COMPANIES_CACHE_KEY, JSON.stringify(rows));
  } catch {
    // sessionStorage unavailable/full — best-effort cache only, boot fetch still covers correctness.
  }
}

/** Message thrown by report_scope_common.php / group_company_access.php when the session lacks group-ledger access. */
const GROUP_LEDGER_DENIED_MESSAGE = "无权访问该 Group Ledger";

/** True when a report fetch failed because the session was denied access to the requested group ledger. */
export function isGroupLedgerDeniedError(err) {
  const msg = err?.message;
  return typeof msg === "string" && msg.includes(GROUP_LEDGER_DENIED_MESSAGE);
}

/** Report pages never boot into group-only when logged in as a company. */
export function resolveReportGroupOnlyBoot(me, bootGc, persistedGc, bootGroup) {
  if (isCompanyLogin(me)) return false;
  return Boolean(
    bootGc.groupOnly ||
      persistedGc.groupOnly ||
      (bootGroup && isDashboardGroupOnlyMode() && canUseGroupOnlyMode(me, bootGroup)),
  );
}

/** Company-login report boot: when a group is set, always resolve a subsidiary company. */
export function resolveReportBootCompanyForGroup(me, companies, bootGroup, preferredCompanyId = null) {
  if (!isCompanyLogin(me) || !bootGroup) return null;
  const pick =
    pickDefaultSubsidiaryForGroup(companies, bootGroup, {
      me,
      preferredCompanyId,
    }) ??
    pickDefaultCompanyForGroup(companies, bootGroup, {
      me,
      preferredCompanyId,
    });
  return pick?.id ?? null;
}

function rowHasReportGambling(row) {
  const id = Number(row?.id);
  if (!Number.isFinite(id) || id <= 0) return false;
  const flags = peekCompanySessionFlags(id);
  return flags ? Boolean(flags.has_gambling) : true;
}

/**
 * Report: closing group → prefer Games/reportable subsidiary (never leave Bank-only as active Customer Report scope).
 * Falls back to independent companies, then any portfolio subsidiary.
 */
export function resolveReportCompanyWhenClosingGroup(_me, companies, currentCompanyId, groupIds = null) {
  const list = companies ?? [];
  const gids = groupIds?.length ? groupIds : sortedUniqueGroupIds(list);
  const subsidiaries = excludeGroupLabelsFromCompanyPicker(
    filterCompaniesWithDisplayId(list),
    gids,
  );
  const reportable =
    subsidiaries.find((row) => rowHasReportGambling(row)) ??
    independentCompaniesForPicker(list, gids).find((row) => rowHasReportGambling(row)) ??
    subsidiaries[0] ??
    independentCompaniesForPicker(list, gids)[0] ??
    null;
  if (reportable) return reportable;
  return resolveCompanyWhenClosingGroup(list, currentCompanyId, gids);
}
