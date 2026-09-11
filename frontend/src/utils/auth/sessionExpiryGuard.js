import { pathnameToPageKey, spaPath } from "../routing/pageRoutes.js";
import { safeSession } from "../storage/safeStorage.js";

export const SESSION_EXPIRED_NOTICE_KEY = "ec_session_expired_notice";

/**
 * Page keys that own their own auth flow (login / member / secondary password).
 * The guard never redirects from there: current_user_api legitimately returns
 * "Not logged in" on those pages, and reacting would create a redirect loop.
 */
const PUBLIC_PAGE_KEYS = new Set([
  "login",
  "member",
  "reset-password",
  "owner-secondary-password",
  "user-secondary-password",
]);

/**
 * Backend responses that mean "session is gone" (lowercased, trailing period stripped):
 * - current_user_api / restore_api:  success:false + "Not logged in"
 * - session_check.php APIs:          status:error + redirect:"/login"
 * - other endpoints:                 "用户未登录" / "User not logged in" /
 *                                    "User not authenticated" / "Unauthorized"
 */
const SESSION_LOST_MESSAGES = new Set([
  "not logged in",
  "user not logged in",
  "user not authenticated",
  "unauthorized",
  "please login first",
  "session expired. please login again",
  "用户未登录",
]);

/** Pure matcher: does this API JSON payload mean the session is gone? */
export function sessionLostFromPayload(json) {
  if (!json || typeof json !== "object") return false;
  if (json.status === "error" && json.redirect === "/login") return true;
  if (json.success !== false) return false;
  return [json.message, json.error].some((raw) => {
    if (typeof raw !== "string") return false;
    const normalized = raw.trim().toLowerCase().replace(/\.$/, "");
    return SESSION_LOST_MESSAGES.has(normalized);
  });
}

let redirecting = false;

/**
 * Force a full reload into the login page — same target as logout and the
 * maintenance kick. A full reload drops every stale page state in one go.
 */
export function redirectExpiredSessionToLogin() {
  if (typeof window === "undefined" || redirecting) return;
  if (PUBLIC_PAGE_KEYS.has(pathnameToPageKey(window.location.pathname))) return;
  redirecting = true;
  try {
    safeSession.setItem(SESSION_EXPIRED_NOTICE_KEY, "1");
  } catch {
    /* notice is best-effort */
  }
  // Same cache cleanup as logout; modules are already part of the shell bundle.
  void import("../dashboard/dashboardCache.js")
    .then((mod) => mod.resetDashboardSessionCaches())
    .catch(() => {});
  void import("../company/sharedCompanyFilter.js").then((mod) => {
    mod.clearDashboardFilterSession();
    mod.clearOwnerCompaniesCache();
  }).catch(() => {});
  window.location.assign(new URL(spaPath("login"), window.location.origin).href);
}

function inspectResponseForSessionExpiry(response) {
  try {
    const url = new URL(response.url, window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (!url.pathname.includes("/api/")) return;
    // 401 across this API layer always means "not logged in" (18 endpoints).
    if (response.status === 401) {
      redirectExpiredSessionToLogin();
      return;
    }
    const contentType = String(response.headers?.get?.("content-type") || "");
    if (!contentType.includes("application/json")) return;
    // Clone so the caller's own body reader is untouched; inspect fire-and-forget.
    response.clone()
      .json()
      .then((json) => {
        if (sessionLostFromPayload(json)) redirectExpiredSessionToLogin();
      })
      .catch(() => {});
  } catch {
    /* inspection must never break the caller */
  }
}

/**
 * Patch window.fetch once at bootstrap: any API response meaning "session gone"
 * (30s idle poll, react-query refetch, user action…) kicks the user to login
 * instead of leaving them stuck with a "not logged in" error toast.
 */
export function installSessionExpiryGuard() {
  if (typeof window === "undefined" || window.__ecSessionExpiryGuardInstalled) return;
  window.__ecSessionExpiryGuardInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (...args) =>
    originalFetch(...args).then((response) => {
      inspectResponseForSessionExpiry(response);
      return response;
    });
}
