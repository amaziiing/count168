import {
  customerReportScopeIsReady,
  resolveCustomerReportScope,
} from "../shared/reportScope.js";

/**
 * Domain Report: group pill without subsidiary → group payroll ledger
 * (PROFIT / SALARY / COMMISSION / BONUS).
 * Explicit company pill always wins (aligned with Customer Report / transactionScope) — do not
 * force group-only just because the dashboard is in group-only mode, otherwise switching company
 * while lacking group-ledger permission wrongly enters single-group mode and errors out.
 */
export function resolveDomainReportScope(args) {
  const { companies, selectedGroup, companyId, groupsAllMode, groupAllMode, me = null } = args;
  const groupOnlyUi =
    Boolean(selectedGroup) &&
    !groupsAllMode &&
    !groupAllMode &&
    (companyId == null || companyId === "");

  return resolveCustomerReportScope({
    companies,
    selectedGroup,
    companyId: groupOnlyUi ? null : companyId,
    groupsAllMode,
    groupAllMode,
    me,
  });
}

/** Group entity / group-only: PROFIT + SALARY + COMMISSION + BONUS (aligned with Data Capture). */
export function domainReportUsesSalaryBonusProcesses(scope) {
  return scope?.mode === "group";
}

export { customerReportScopeIsReady as domainReportScopeIsReady };
