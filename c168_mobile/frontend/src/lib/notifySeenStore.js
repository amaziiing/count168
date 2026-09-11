/** Bell-badge seen store — date-gated "unseen announcements". Seen ids persist
    in localStorage keyed "<user_id>:<YYYY-MM-DD>", so the badge is governed by
    the day: seen today stays seen across re-logins on the same device; a new
    day (or a different user) yields a fresh ownerKey and the badge reappears.
    PWA/Capacitor webviews never reload the page, hence the persisted key. */

const NOTIFY_SEEN_KEY = "m-notify-seen";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function notifySeenOwnerKey(userId) {
  return `${userId ?? "anon"}:${todayKey()}`;
}

export function readNotifySeen() {
  if (typeof localStorage === "undefined") return { ownerKey: "", ids: [] };
  try {
    const raw = localStorage.getItem(NOTIFY_SEEN_KEY);
    if (!raw) return { ownerKey: "", ids: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ids)) {
      return { ownerKey: "", ids: [] };
    }
    return {
      ownerKey: String(parsed.ownerKey || ""),
      ids: parsed.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0),
    };
  } catch {
    return { ownerKey: "", ids: [] };
  }
}

export function saveNotifySeen(ownerKey, ids) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      NOTIFY_SEEN_KEY,
      JSON.stringify({ ownerKey: String(ownerKey || ""), ids: [...ids] }),
    );
  } catch {
    /* quota — badge simply resets next boot */
  }
}
