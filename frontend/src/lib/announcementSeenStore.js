/** Bell-badge seen store — date-gated "unseen announcements". Seen ids persist
    in localStorage keyed "<user_id>:<YYYY-MM-DD>", so the badge is governed by
    the day: seen today stays seen across re-logins on the same device; a new
    day (or a different user) yields a fresh ownerKey and the badge reappears. */

const ANNOUNCEMENT_SEEN_KEY = "web-announcement-seen";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function announcementSeenOwnerKey(userId) {
  return `${userId ?? "anon"}:${todayKey()}`;
}

export function readAnnouncementSeen() {
  if (typeof localStorage === "undefined") return { ownerKey: "", ids: [] };
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_SEEN_KEY);
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

export function saveAnnouncementSeen(ownerKey, ids) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      ANNOUNCEMENT_SEEN_KEY,
      JSON.stringify({ ownerKey: String(ownerKey || ""), ids: [...ids] }),
    );
  } catch {
    /* quota — badge simply resets next boot */
  }
}
