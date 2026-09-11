/** Site picker for the phone build.
 *
 *  The Android shell always boots count168.site (see c168_mobile/app/
 *  capacitor.config.json → server.url), while every domain has its own
 *  database. So the login screen lets the user pick their site, and the app
 *  re-enters that domain on the next launch.
 */
export const SITE_STORAGE_KEY = "mobile_site";

export const SITE_OPTIONS = [
  { key: "site", host: "count168.site", label: "count168.site", short: "site" },
  { key: "org", host: "www.count168.org", label: "count168.org", short: "org" },
  { key: "com", host: "www.count168.com", label: "count168.com", short: "com" },
];

export function readChosenSite() {
  try {
    const key = localStorage.getItem(SITE_STORAGE_KEY) || "";
    return SITE_OPTIONS.some((site) => site.key === key) ? key : "";
  } catch {
    return "";
  }
}

export function writeChosenSite(key) {
  const next = SITE_OPTIONS.some((site) => site.key === key) ? key : "";
  try {
    if (next) localStorage.setItem(SITE_STORAGE_KEY, next);
    else localStorage.removeItem(SITE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return next;
}

/** Key of the domain this page is served from ("" when it is not a known site). */
export function currentSiteKey(hostname = window.location.hostname) {
  const host = String(hostname || "").toLowerCase();
  const hit = SITE_OPTIONS.find((site) => site.host === host);
  return hit ? hit.key : "";
}

export function siteLabel(key) {
  const hit = SITE_OPTIONS.find((site) => site.key === key);
  return hit ? hit.label : "";
}

/** Absolute URL on the target domain for the given (default: current) path. */
export function siteUrl(key, path) {
  const hit = SITE_OPTIONS.find((site) => site.key === key);
  if (!hit) return "";
  const target = path || `${window.location.pathname}${window.location.search}`;
  return `https://${hit.host}${target.startsWith("/") ? target : `/${target}`}`;
}

/** Switch domains: remember the choice, then load the same path there. */
export function switchSite(key) {
  const next = writeChosenSite(key);
  if (!next || next === currentSiteKey()) return false;
  const url = siteUrl(next);
  if (!url) return false;
  window.location.replace(url);
  return true;
}

/** Boot: when the user already picked a site, go straight back to it. */
export function applyChosenSiteRedirect() {
  const chosen = readChosenSite();
  if (!chosen || chosen === currentSiteKey()) return false;
  const url = siteUrl(chosen);
  if (!url) return false;
  window.location.replace(url);
  return true;
}
