import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePullToRefresh } from "../../hooks/usePullToRefresh.js";
import { useDirectScrollChrome } from "../../hooks/useDirectScrollChrome.js";
import { useScrollIdleVisible } from "../../hooks/useScrollIdleVisible.js";
import { isMobileMoreStackPath } from "../../utils/mobilePermissions.js";
import {
  notifySeenOwnerKey,
  readNotifySeen,
  saveNotifySeen,
} from "../../lib/notifySeenStore.js";
import {
  useSyncedLoginLang,
  writeLoginLang,
} from "../../lib/loginLang.js";
import {
  THEME_UPDATED_EVENT,
  readLoginTheme,
  writeLoginTheme,
} from "../../lib/loginTheme.js";
import MobileAppBar from "./MobileAppBar.jsx";
import MobileNotifications, { fetchMobileAnnouncements } from "./MobileNotifications.jsx";
import PullRefreshIndicator from "./PullRefreshIndicator.jsx";
import "./mobile-shell.css";

/** Bell badge = announcements not yet seen this session. Seen ids persist in
    localStorage keyed by "<user>:<day>" — the badge reappears on the next
    login / day (PWA webviews never reload, so a module-scope Set would keep
    the badge hidden forever), and clears once the panel has been opened. */

export default function MobileShell({
  children,
  overlay = null,
  stickyBar = null,
  floatingAction = null,
  appBarLeftAction = null,
  onMainScrollStart,
  i18n,
  me,
  onRefresh,
  refreshing = false,
  showBottomNav = true,
  onChromeOpen,
  overlayOpen = false,
}) {
  const { pathname, key: locationKey } = useLocation();
  const navigate = useNavigate();
  const navVisible = showBottomNav && !isMobileMoreStackPath(pathname);
  /** Hub-child pages (opened from More) get a floating Back pill once scrolled. */
  const isSubpage = isMobileMoreStackPath(pathname) && pathname !== "/more";
  const labels = {
    navHome: "Home",
    navReport: "Report",
    navTransaction: "Transaction",
    navAccount: "Account",
    navMore: "More",
    backToTop: "Back to top",
    back: "Back",
    ...(i18n || {}),
  };
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [seenIds, setSeenIds] = useState(() => new Set());
  const seenIdsRef = useRef(new Set());
  const notifyOwnerKeyRef = useRef("");
  const [theme, setTheme] = useState(() => readLoginTheme());
  const [lang, setLang] = useSyncedLoginLang();
  const mainRef = useRef(null);
  const topChromeRef = useRef(null);
  const [topChromeH, setTopChromeH] = useState(118);
  /** Back-to-top appears above the FAB once the page is scrolled well past the top. */
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [stickyScrolled, setStickyScrolled] = useState(false);
  /** Floating Back pill for hub-child pages — thumbs live near the bottom, not the top-left. */
  const [showBackFab, setShowBackFab] = useState(false);

  const scrollTop = useCallback(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goBack = useCallback(() => {
    if (locationKey === "default") {
      navigate("/more");
    } else {
      navigate(-1);
    }
  }, [locationKey, navigate]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const far = el.scrollTop > 240;
      if (floatingAction) setShowScrollTop(far);
      setShowBackFab(isSubpage && far);
      setStickyScrolled(el.scrollTop > 8);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [floatingAction, isSubpage]);

  const refreshPage = useCallback(async () => {
    if (typeof onRefresh === "function") {
      await onRefresh();
      return;
    }
    try {
      const rows = await fetchMobileAnnouncements();
      setAnnouncements(rows);
    } catch {
      /* ignore */
    }
  }, [onRefresh]);

  const { pullPx, progress, phase, active, isAnimating } = usePullToRefresh(mainRef, {
    onRefresh: refreshPage,
    enabled: typeof onRefresh === "function",
    refreshing,
  });
  /** Only gesture-driven pull refresh should show chrome loading UI. */
  const gestureRefreshing = phase === "refreshing";

  const floatingIdleVisible = useScrollIdleVisible(mainRef, {
    idleMs: 320,
    onScrollStart: onMainScrollStart,
  });
  const showFloating = Boolean(floatingAction) && floatingIdleVisible && !overlayOpen;

  useLayoutEffect(() => {
    const el = topChromeRef.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) setTopChromeH(h);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stickyBar, gestureRefreshing]);

  const forceChrome =
    active || isAnimating || overlayOpen || notifyOpen || gestureRefreshing;

  useDirectScrollChrome({
    scrollRef: mainRef,
    topChromeRef,
    maxOffset: Math.max(topChromeH, 1),
    topReveal: 12,
    paused: forceChrome,
  });

  /* Seed seen ids for this login+day: an ownerKey mismatch (next day, other
     user, fresh login after reset) starts empty so the badge reappears. */
  useEffect(() => {
    const ownerKey = me ? notifySeenOwnerKey(me.user_id ?? me.id) : "";
    notifyOwnerKeyRef.current = ownerKey;
    if (!ownerKey) {
      seenIdsRef.current = new Set();
      setSeenIds(seenIdsRef.current);
      return;
    }
    const stored = readNotifySeen();
    seenIdsRef.current = stored.ownerKey === ownerKey ? new Set(stored.ids) : new Set();
    setSeenIds(seenIdsRef.current);
  }, [me]);

  const markAnnouncementsSeen = useCallback((rows) => {
    if (!rows?.length) return;
    const ownerKey = notifyOwnerKeyRef.current;
    if (!ownerKey) return;
    const next = new Set(seenIdsRef.current);
    let changed = false;
    rows.forEach((row) => {
      const id = Number(row?.id);
      if (!Number.isNaN(id) && !next.has(id)) {
        next.add(id);
        changed = true;
      }
    });
    if (!changed) return;
    seenIdsRef.current = next;
    setSeenIds(next);
    saveNotifySeen(ownerKey, next);
  }, []);

  const openNotifications = () => {
    onChromeOpen?.();
    setNotifyOpen(true);
    markAnnouncementsSeen(announcements);
  };

  useEffect(() => {
    if (!overlayOpen) return;
    setNotifyOpen(false);
  }, [overlayOpen]);

  useEffect(() => {
    if (!me) return undefined;
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await fetchMobileAnnouncements(ac.signal);
        if (!ac.signal.aborted) setAnnouncements(rows);
      } catch {
        if (!ac.signal.aborted) setAnnouncements([]);
      }
    })();
    return () => ac.abort();
  }, [me]);
  /** Stay in sync when theme is changed from the Settings page
      (language sync is handled by useSyncedLoginLang). */
  useEffect(() => {
    const onTheme = (e) => setTheme(e?.detail?.theme === "dark" ? "dark" : "light");
    window.addEventListener(THEME_UPDATED_EVENT, onTheme);
    return () => window.removeEventListener(THEME_UPDATED_EVENT, onTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(writeLoginTheme(theme === "dark" ? "light" : "dark"));
  }, [theme]);

  const toggleLang = useCallback(
    (next) => {
      setLang(writeLoginLang(next === "zh" ? "zh" : "en"));
    },
    [],
  );

  useEffect(() => {
    if (!notifyOpen) return undefined;
    setNotifyLoading(true);
    const ac = new AbortController();
    (async () => {
      try {
        const rows = await fetchMobileAnnouncements(ac.signal);
        if (!ac.signal.aborted) {
          setAnnouncements(rows);
          // Panel is in view: treat anything that arrives now as seen.
          markAnnouncementsSeen(rows);
        }
      } catch {
        /* keep previous */
      } finally {
        if (!ac.signal.aborted) setNotifyLoading(false);
      }
    })();
    return () => ac.abort();
  }, [notifyOpen, markAnnouncementsSeen]);

  const contentShift = pullPx > 0.5 ? pullPx : 0;
  const contentTransition = isAnimating && phase !== "pulling" && phase !== "armed";
  const mainPadTop = topChromeH;

  const unreadCount = useMemo(
    () => announcements.filter((row) => !seenIds.has(Number(row?.id))).length,
    [announcements, seenIds],
  );

  const mainPadBottom = navVisible
    ? "var(--m-shell-main-pad-bottom-nav)"
    : floatingAction
      ? "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)"
      : "var(--m-shell-main-pad-bottom)";

  return (
    <div className={`m-shell${navVisible ? "" : " m-shell--no-nav"}`}>
      <div
        ref={topChromeRef}
        className={`m-shell-chrome${stickyScrolled ? " m-shell-chrome--scrolled" : ""}`}
      >
        <MobileAppBar
          i18n={labels}
          notificationCount={unreadCount}
          onOpenNotifications={openNotifications}
          onRefresh={typeof onRefresh === "function" ? refreshPage : undefined}
          refreshing={gestureRefreshing}
          leftAction={appBarLeftAction}
          theme={theme}
          onToggleTheme={toggleTheme}
          lang={lang}
          onLangChange={toggleLang}
        />

        {stickyBar ? (
          <div className="m-shell-sticky-wrap">
            <div className="m-shell-sticky-inner">{stickyBar}</div>
          </div>
        ) : null}
      </div>

      <main
        ref={mainRef}
        className="m-shell-main"
        style={{
          paddingTop: mainPadTop,
          paddingBottom: mainPadBottom,
        }}
      >
        <div
          style={{
            transform: contentShift ? `translate3d(0, ${contentShift}px, 0)` : undefined,
            transition: contentTransition ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
          }}
        >
          <PullRefreshIndicator pullPx={pullPx} progress={progress} phase={phase} labels={labels} />
          <div className={gestureRefreshing ? "m-shell-main--refreshing" : ""}>{children}</div>
        </div>
      </main>

      {isSubpage && showBackFab && !overlayOpen && !notifyOpen && !gestureRefreshing ? (
        <button type="button" onClick={goBack} className="m-shell-back-fab tap-scale" aria-label={labels.back}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
          <span>{labels.back}</span>
        </button>
      ) : null}

      {floatingAction ? (
        <div
          className={`m-shell-fab-slot ${showFloating ? "m-shell-fab-slot--visible" : "m-shell-fab-slot--hidden"}`}
          aria-hidden={!showFloating}
        >
          {showScrollTop ? (
            <button
              type="button"
              onClick={scrollTop}
              className="m-shell-scroll-top tap-scale"
              aria-label={labels.backToTop || "Back to top"}
            >
              <i className="fas fa-arrow-up" aria-hidden="true" />
            </button>
          ) : null}
          {floatingAction}
        </div>
      ) : null}

      {overlay}
      <MobileNotifications
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        i18n={labels}
        items={announcements}
        loading={notifyLoading}
      />
    </div>
  );
}
