/** Mirrors desktop sidebarPermissions.js for mobile routes only. */

import { canAccessC168DomainPages } from "../lib/c168DomainAccess.js";
import { isGroupLogin } from "../lib/loginScope.js";

export { canAccessC168DomainPages };

export function normRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function isOwnerUser(me) {
  return normRole(me?.role) === "owner";
}

export function getUserPermissions(me) {
  return Array.isArray(me?.permissions) ? me.permissions : [];
}

/** Empty permissions = unrestricted (owner / legacy). */
export function hasFullPermissions(me) {
  if (isOwnerUser(me) || String(me?.user_type || "").toLowerCase() === "owner") return true;
  return getUserPermissions(me).length === 0;
}

export function canAccessPermission(me, key) {
  if (hasFullPermissions(me)) return true;
  return getUserPermissions(me).includes(key);
}

export function canAccessDashboard(me) {
  return canAccessPermission(me, "home");
}

export function canAccessReport(me) {
  return canAccessPermission(me, "report");
}

/**
 * Report entry (More + hub + deep links): hide when the active company is Bank-only.
 * Mirrors desktop `canShowReportInSidebar` using session `me` flags (no GC cache on mobile).
 */
export function canShowReportEntry(me) {
  if (!canAccessReport(me)) return false;
  if (isGroupLogin(me)) return true;
  if (me?.company_has_gambling) return true;
  const code = String(me?.company_code || "").trim().toUpperCase();
  if (code === "C168" || me?.is_current_company_c168) return true;
  if (me?.company_has_bank && !me?.company_has_gambling) return false;
  return true;
}

export function canAccessTransaction(me) {
  return canAccessPermission(me, "payment");
}

export function canAccessAccount(me) {
  return canAccessPermission(me, "account");
}

/** Admin (user management) — mirrors the desktop "admin" sidebar permission. */
export function canAccessAdmin(me) {
  if (String(me?.user_type || "").toLowerCase() === "member") return false;
  return canAccessPermission(me, "admin");
}

/** Ownership page — owner / partnership only, same as desktop sidebar. */
export function canAccessOwnership(me) {
  const role = normRole(me?.role);
  if (role !== "owner" && role !== "partnership") return false;
  return canAccessPermission(me, "ownership");
}

/** Full Maintenance: owner / unrestricted, or explicit "maintenance" permission. */
export function canAccessFullMaintenance(me) {
  if (hasFullPermissions(me)) return true;
  return canAccessPermission(me, "maintenance");
}

/** Non-owner without Maintenance permission but whose company has gambling/bank. */
export function canAccessLimitedMaintenance(me) {
  if (hasFullPermissions(me)) return false;
  if (canAccessFullMaintenance(me)) return false;
  return Boolean(me?.company_has_gambling || me?.company_has_bank);
}

/** Payment Maintenance page — full Maintenance permission only (desktop-aligned). */
export function canAccessPaymentMaintenance(me) {
  return canAccessFullMaintenance(me);
}

/** First mobile route after login — aligned with desktop sidebar order where possible. */
export function resolveMobileLandingPath(me) {
  if (!me) return "/login";

  const userType = String(me.user_type || "").toLowerCase();
  if (userType === "member") return "/member";
  if (me.needs_owner_secondary) return "/owner-secondary-password";
  if (me.needs_user_secondary) return "/user-secondary-password";

  if (canAccessDashboard(me)) return "/dashboard";
  if (canAccessTransaction(me)) return "/transaction";
  if (canAccessAccount(me)) return "/account";
  if (canShowReportEntry(me)) return "/report";
  return "/more";
}

/** More hub + pages opened from More — hide the tab bar. */
export function isMobileMoreStackPath(pathname) {
  const p = String(pathname || "");
  return (
    p === "/more" ||
    p.startsWith("/more/") ||
    p.startsWith("/report") ||
    p.startsWith("/maintenance")
  );
}

/** First bottom-nav tab — used by the More back button. More itself lives in
    the app bar (top-right gear), not in the bottom nav. */
export function resolveMobileMoreBackPath(me) {
  if (!me) return "/dashboard";
  return mobileNavItems(me)[0]?.to || "/dashboard";
}

export function mobileNavItems(me) {
  if (String(me?.user_type || "").toLowerCase() === "member") {
    return [{ to: "/member", icon: "fa-chart-line", key: "winLoss" }];
  }
  const items = [];
  if (canAccessDashboard(me)) {
    items.push({ to: "/dashboard", icon: "fa-house", key: "navHome" });
  }
  if (canAccessTransaction(me)) {
    items.push({ to: "/transaction", icon: "fa-money-bill-transfer", key: "navTransaction" });
  }
  if (canAccessAccount(me)) {
    items.push({ to: "/account", icon: "fa-address-book", key: "navAccount" });
  }
  return items;
}
