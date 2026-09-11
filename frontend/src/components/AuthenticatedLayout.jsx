import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { isPaymentHistoryChromelessPath } from "../pages/transaction/lib/transactionPaymentHistoryUrl.js";
import { assetUrl, buildApiUrl, buildSpaPath } from "../utils/core/apiUrl.js";
import { bindMediaQueryChange } from "../utils/dom/bindMediaQueryChange.js";
import { safeLocal, safeSession } from "../utils/storage/safeStorage.js";
import { clearDataCaptureRoundLocalStorage } from "../utils/capture/dataCaptureRoundStorage.js";
import AppBootLoading from "./AppBootLoading.jsx";
import AvatarPickerModal from "./AvatarPickerModal.jsx";
import ConfirmLogoutModal from "./ConfirmLogoutModal.jsx";
import ExpirationReminderModal from "./ExpirationReminderModal.jsx";
import { AuthSessionProvider } from "../context/AuthSessionContext.jsx";
import AppRealtimeBridge from "../lib/realtime/AppRealtimeBridge.jsx";
import SidebarLangSwitch from "./SidebarLangSwitch.jsx";
import SidebarFlyoutSubmenu from "./SidebarFlyoutSubmenu.jsx";
import { dismissAllPortalTooltips } from "./PortalTooltip.jsx";
import { DASHBOARD_I18N } from "../translateFile/shell/dashboardTranslate.js";
import { formatUserRoleDisplay, getUserListText } from "../translateFile/pages/userListTranslate.js";
import { getExpirationReminderText } from "../translateFile/shell/expirationReminderTranslate.js";
import { getAutoRenewText } from "../translateFile/pages/autoRenewTranslate.js";
import {
  AUTO_RENEW_PENDING_CHANGED_EVENT,
  syncAutoRenewPendingCount,
} from "../utils/autoRenew/autoRenewPendingSync.js";
import { useExpirationReminder } from "../hooks/useExpirationReminder.js";
import { applyLoginLang } from "../utils/i18n/useLoginLang.js";
import {
  canAccessDashboard,
  canAccessCaptureMaintenance,
  canAccessFullMaintenance,
  canAccessLimitedMaintenance,
  canAccessPermission,
  canShowReportInSidebar,
  resolveDefaultLandingPath,
  showMaintenanceInSidebar,
} from "../utils/auth/sidebarPermissions.js";
import {
  applyLoginScopeToSessionStorageIfNeeded,
  clearDashboardFilterSession,
  clearOwnerCompaniesCache,
  consumeDashboardFilterNewTabBootstrap,
  DASHBOARD_GROUP_FILTER_EVENT,
  dashboardFilterEventMatchesPersisted,
  dashboardGcFiltersEqual,
  buildDashboardFilterEventDetailFromPersisted,
  DASHBOARD_GC_BOOTSTRAP_READY_EVENT,
  dashboardSidebarFilterSignature,
  isDashboardGroupOnlyMode,
  readPersistedDashboardGcFilter,
  shouldApplySessionToSidebar,
  shouldRefreshExpiryFromSession,
  shouldHideSidebarProcess,
  shouldShowBankprocessMaintenanceInSidebar,
  fetchOwnerCompaniesAll,
  fetchOwnerGroupsAll,
  findOwnerCompanyById,
  resolveSidebarExpirationForFilter,
  resolveGroupCategoryFlagsForSidebar,
  resolveGroupOnlySidebarGambling,
  stashDashboardFilterForNewTab,
} from "../utils/company/sharedCompanyFilter.js";
import { rememberCompanySessionFlags } from "../utils/company/companySessionFlagsCache.js";
import { resolveCompanyCategoryFlags } from "../utils/company/companyCategoryFlags.js";
import { categoryFlagsFromSession } from "../utils/company/sidebarCompanySwitch.js";
import SidebarExpirationCountdown from "./SidebarExpirationCountdown.jsx";
import SidebarMenuTooltip from "./SidebarMenuTooltip.jsx";
import AnimatedOutlet from "./AnimatedOutlet.jsx";
import {
  prefetchAutoRenewList,
  prefetchOwnershipCompanies,
  prefetchRouteModule,
} from "../utils/routing/routePrefetch.js";
import { clearChunkReloadFlag } from "../utils/routing/lazyWithRetry.js";
import {
  canAccessC168AutoRenew,
  canAccessC168DomainPages,
  canUseGroupOnlyMode,
  isCompanyLogin,
  isGroupLogin,
  loginScopeBodyClass,
  patchMeFromCompanyContext,
} from "../utils/company/loginScope.js";
import { pathnameIs, pathnameToPageKey, spaPath } from "../utils/routing/pageRoutes.js";
import { markSidebarPageSoftRefresh } from "../utils/routing/sidebarPageSoftRefresh.js";
import { stripPrivateQueryFromBrowserUrl } from "../utils/routing/privateBrowserUrl.js";
import { resetDashboardSessionCaches } from "../utils/dashboard/dashboardCache.js";
import {
  commitMaintenanceDateRangeToDmy,
  resetMaintenanceCalendarPopupOnNavigation,
} from "../utils/date/dateRangePicker.js";
import { formatDmy } from "../utils/date/dateUtils.js";
import AnnouncementUpdateCard from "./announcements/AnnouncementUpdateCard.jsx";
import {
  publishMaintenanceModeEvent,
  subscribeMaintenanceModeEvent,
} from "../utils/maintenance/maintenanceRealtimeBus.js";
import "../../public/css/modal-close-unified.css";
import "../../public/css/select-unified.css";

function formatSidebarExpirationHint(hint, i18n) {
  if (!hint || hint === "-") return "-";
  if (hint === "No expiration date") return i18n.expNoDate;
  return hint;
}

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "ec_sidebar_collapsed";
/** iPad Air 11" (M2) landscape Safari ≈ 1180px; use 1200px to include that viewport. */
/** Galaxy Tab S7 横屏约 1280px，需纳入平板侧栏逻辑 */
const TABLET_MEDIA_QUERY = "(max-width: 1280px)";

/** Icon-only sidebar: portal tooltip to the right of each nav item. */
function SidebarNavTip({ label, enabled, children, placement = "right" }) {
  return (
    <SidebarMenuTooltip label={label} enabled={enabled} placement={placement}>
      {children}
    </SidebarMenuTooltip>
  );
}

function sidebarWebHref(path) {
  if (typeof window === "undefined") return path;
  const spaPath = buildSpaPath(path);
  return new URL(spaPath, window.location.href).href;
}

function sidebarOpensNewTab(event) {
  return (
    event.button === 1 ||
    (event.button === 0 && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))
  );
}

/** Plain left-click → SPA navigate; middle / modified click → new tab at the route href. */
function handleSidebarSpaLinkClick(event, path, onNavigate) {
  if (event.defaultPrevented) return;
  if (sidebarOpensNewTab(event)) {
    if (event.button === 1) return;
    stashDashboardFilterForNewTab();
    return;
  }
  if (event.button !== 0) return;
  event.preventDefault();
  resetMaintenanceCalendarPopupOnNavigation();
  onNavigate?.();
}

function handleSidebarSpaAuxClick(event, path) {
  if (event.button !== 1) return;
  event.preventDefault();
  stashDashboardFilterForNewTab();
  window.open(buildSpaPath(path), "_blank", "noopener,noreferrer");
}

function SidebarSectionLink({ to, className, prefetchPath, onBeforeNavigate, goTo, children }) {
  return (
    <a
      href={sidebarWebHref(to)}
      className={className}
      data-prefetch-path={prefetchPath ?? to}
      onPointerDown={(event) => {
        if (sidebarOpensNewTab(event)) stashDashboardFilterForNewTab();
      }}
      onAuxClick={(event) => handleSidebarSpaAuxClick(event, to)}
      onClick={(e) =>
        handleSidebarSpaLinkClick(e, to, () => {
          onBeforeNavigate?.();
          goTo(to);
        })
      }
    >
      {children}
    </a>
  );
}

function sidebarSubmenuLinkProps(path, goTo) {
  return {
    href: sidebarWebHref(path),
    onPointerDown: (event) => {
      if (sidebarOpensNewTab(event)) stashDashboardFilterForNewTab();
    },
    onAuxClick: (event) => handleSidebarSpaAuxClick(event, path),
    onClick: (event) => handleSidebarSpaLinkClick(event, path, () => goTo(path)),
  };
}

const AVATAR_MAP = {
  male1: assetUrl("images/avatar1.png"),
  male2: assetUrl("images/avatar2.png"),
  male3: assetUrl("images/avatar3.png"),
  male4: assetUrl("images/avatar4.png"),
  male5: assetUrl("images/avatar5.png"),
  male6: assetUrl("images/avatar6.png"),
  male7: assetUrl("images/avatar7.png"),
  male8: assetUrl("images/avatar8.png"),
  male9: assetUrl("images/avatar9.png"),
  female1: assetUrl("images/female1.png"),
  female2: assetUrl("images/female2.png"),
  female3: assetUrl("images/female3.png"),
  female4: assetUrl("images/female4.png"),
  female5: assetUrl("images/female5.png"),
  female6: assetUrl("images/female6.png"),
  female7: assetUrl("images/female7.png"),
  female8: assetUrl("images/female8.png"),
  female9: assetUrl("images/female9.png"),
};

export default function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const path = location.pathname;
  const pageKey = pathnameToPageKey(path);
  /** Bumped on same-page sidebar re-click so AnimatedOutlet remounts the current page. */
  const [pageRefreshKey, setPageRefreshKey] = useState(0);
  const goTo = useCallback(
    (nextPath) => {
      resetMaintenanceCalendarPopupOnNavigation();
      const targetPath = buildSpaPath(nextPath);
      const targetKey = pathnameToPageKey(targetPath);
      const currentKey = pathnameToPageKey(location.pathname);

      // Already on this sidebar page → soft-reset page state (not a full browser reload).
      if (targetKey && targetKey === currentKey) {
        const cleanPath = spaPath(targetKey);
        const currentFull = `${location.pathname}${location.search}${location.hash}`;
        if (currentFull !== cleanPath) {
          navigate(cleanPath, { replace: true });
        }
        // Capture Date lives in a module singleton — pin to today before remount.
        const today = formatDmy(new Date());
        if (today) commitMaintenanceDateRangeToDmy(today, today, { triggerOnChange: false });
        markSidebarPageSoftRefresh(targetKey);
        setPageRefreshKey((key) => key + 1);
        return;
      }

      startTransition(() => {
        navigate(targetPath);
      });
    },
    [navigate, location.pathname, location.search, location.hash],
  );
  const isDataCaptureSidebarActive =
    pageKey === "datacapture" || pageKey === "datacapturesummary";
  const chromelessPaymentHistory = isPaymentHistoryChromelessPath(path, searchParams);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoverSection, setHoverSection] = useState(null);
  const reportTitleRef = useRef(null);
  const maintenanceTitleRef = useRef(null);
  const submenuCloseTimerRef = useRef(null);
  const menuContentRef = useRef(null);

  useLayoutEffect(() => {
    consumeDashboardFilterNewTabBootstrap();
  }, []);

  useLayoutEffect(() => {
    stripPrivateQueryFromBrowserUrl();
  }, [location.pathname, location.search]);

  // --- Notification Panel State ---
  const [showNotifications, setShowNotifications] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [readAnnouncements, setReadAnnouncements] = useState(new Set());

  // --- Avatar Selector State ---
  const [showAvatarOptions, setShowAvatarOptions] = useState(false);
  const initialAvatarId = readCookie("selectedAvatar") || "male1";
  const [selectedAvatarId, setSelectedAvatarId] = useState(initialAvatarId);
  const [selectedGender, setSelectedGender] = useState(initialAvatarId.startsWith("female") ? "female" : "male");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [lang, setLang] = useState(() => (safeLocal.getItem("login_lang") === "zh" ? "zh" : "en"));
  const [isTabletViewport, setIsTabletViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(TABLET_MEDIA_QUERY).matches : false
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && safeLocal.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1"
  );
  /** Bumps when group/company filter changes so sidebar re-reads sessionStorage (no stale React state). */
  const [sidebarGcTick, setSidebarGcTick] = useState(0);
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);
  const {
    showModal: showExpirationModal,
    dismissModal: dismissExpirationModal,
    modalTitle: expirationModalTitle,
    modalMessage: expirationModalMessage,
    modalI18n: expirationModalI18n,
    mergeAnnouncements,
    hasBellBadge,
    onBellOpen,
  } = useExpirationReminder(me, lang);
  const displayAnnouncements = useMemo(
    () => mergeAnnouncements(announcements),
    [announcements, mergeAnnouncements],
  );
  const showC168DomainPages = useMemo(
    () => canAccessC168DomainPages(me),
    [me, sidebarGcTick],
  );
  const showAutoRenewEntry = useMemo(
    () => canAccessC168AutoRenew(me),
    [me, sidebarGcTick],
  );
  const goAutoRenew = useCallback(() => {
    navigate(spaPath("auto-renew"));
  }, [navigate]);
  const handleExpirationModalSecondary = useCallback(() => {
    dismissExpirationModal();
    navigate(spaPath("auto-renew"));
  }, [dismissExpirationModal, navigate]);
  const sidebarIconOnly = isTabletViewport && sidebarCollapsed;
  const sidebarTabletExpanded = isTabletViewport && !sidebarCollapsed;

  /* Enter dashboard chrome immediately so refresh/route changes never flash login tile bg. */
  useLayoutEffect(() => {
    document.body.classList.remove("bg");
    document.body.classList.add("dashboard-page", "ec-auth-shell");
    return () => {
      document.body.classList.remove("dashboard-page", "ec-auth-shell");
      document.body.classList.add("bg");
    };
  }, []);

  /*
   * Route-level body class pre-toggle:
   * keep overflow policy stable while lazy route chunks are still loading.
   */
  useLayoutEffect(() => {
    const onAccountLike = pathnameIs("account-list", location.pathname) || pathnameIs("deleted-log", location.pathname);
    const onUserLike = pathnameIs("userlist", location.pathname);
    const onAutoRenew = pathnameIs("auto-renew", location.pathname);
    const onAnnouncement = pathnameIs("announcement", location.pathname);

    document.body.classList.toggle("account-page", onAccountLike);
    document.body.classList.toggle("user-page", onUserLike || onAutoRenew);
    document.body.classList.toggle("auto-renew-page-body", onAutoRenew);
    document.body.classList.toggle("announcement-page", onAnnouncement);

    if (onAccountLike || onUserLike || onAutoRenew || onAnnouncement) {
      document.body.classList.remove("bg");
    }

    return () => {
      document.body.classList.remove("account-page", "user-page", "auto-renew-page-body", "announcement-page");
    };
  }, [location.pathname, searchParams]);

  /* Process 路由：父级 layout 阶段即挂上 body class，避免 SPA 切入时 Global Unlock 先撑出双 scrollbar */
  useLayoutEffect(() => {
    if (pathnameIs("bank-process-list", location.pathname)) {
      document.body.classList.remove("dashboard-page");
      document.body.classList.add("process-page", "process-page--bank");
    } else if (
      pathnameIs("process-list", location.pathname) ||
      pathnameIs("games-process-list", location.pathname)
    ) {
      document.body.classList.remove("dashboard-page", "process-page--bank", "process-page--bank-show-all");
      document.body.classList.add("process-page");
    } else {
      document.body.classList.remove(
        "process-page",
        "process-page--bank",
        "process-page--bank-show-all",
        "process-page--show-all",
      );
      document.body.classList.add("dashboard-page");
    }

    return () => {
      document.body.classList.remove(
        "process-page",
        "process-page--bank",
        "process-page--bank-show-all",
        "process-page--show-all",
      );
    };
  }, [location.pathname]);

  /* Transaction Payment / Dashboard：layout 阶段挂 transaction-page，避免 lazy chunk 加载前样式错位 */
  useLayoutEffect(() => {
    const onDashboard = pathnameIs("dashboard", location.pathname);
    const onTransactionPayment =
      pathnameIs("transaction", location.pathname) && !chromelessPaymentHistory;
    document.body.classList.toggle("transaction-page", onTransactionPayment || onDashboard);
    document.body.classList.toggle("dashboard-home-page", onDashboard);
    resetMaintenanceCalendarPopupOnNavigation();

    return () => {
      document.body.classList.remove("transaction-page", "dashboard-home-page");
    };
  }, [location.pathname, chromelessPaymentHistory]);

  useLayoutEffect(() => {
    document.body.classList.toggle("ec-payment-history-chromeless", chromelessPaymentHistory);
    return () => {
      document.body.classList.remove("ec-payment-history-chromeless");
    };
  }, [chromelessPaymentHistory]);

  useLayoutEffect(() => {
    const scopeClass = loginScopeBodyClass(me);
    document.body.classList.toggle("ec-login-scope-group", scopeClass === "ec-login-scope-group");
    document.body.classList.toggle("ec-login-scope-company", scopeClass === "ec-login-scope-company");
    return () => {
      document.body.classList.remove("ec-login-scope-group", "ec-login-scope-company");
    };
  }, [me]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") {
        setLang(e.newValue === "zh" ? "zh" : "en");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("lang-zh", lang === "zh");
    document.body.classList.toggle("lang-en", lang !== "zh");
    return () => {
      document.body.classList.remove("lang-zh", "lang-en");
    };
  }, [lang]);

  useEffect(() => {
    const mq = window.matchMedia(TABLET_MEDIA_QUERY);
    const onChange = () => setIsTabletViewport(mq.matches);
    onChange();
    return bindMediaQueryChange(mq, onChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", sidebarIconOnly);
    document.body.classList.toggle("sidebar-tablet-expanded", sidebarTabletExpanded);
    const t = window.setTimeout(() => {
      window.dispatchEvent(new Event("ec:sidebar-layout-changed"));
    }, 280);
    return () => {
      window.clearTimeout(t);
      document.body.classList.remove("sidebar-collapsed", "sidebar-tablet-expanded");
    };
  }, [sidebarIconOnly, sidebarTabletExpanded]);

  const collapseSidebar = useCallback(() => {
    setSidebarCollapsed(true);
    safeLocal.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarCollapsed(false);
    safeLocal.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "0");
  }, []);

  const onHamburgerClick = (e) => {
    e.stopPropagation();
    if (sidebarCollapsed) expandSidebar();
  };

  const hideProcessWhenGroupOnly = useMemo(
    () => shouldHideSidebarProcess(path, me),
    [path, sidebarGcTick, me],
  );
  const prevPathRef = useRef(path);

  useEffect(() => {
    if (!isTabletViewport || sidebarCollapsed) {
      prevPathRef.current = path;
      return;
    }
    if (prevPathRef.current !== path) collapseSidebar();
    prevPathRef.current = path;
  }, [path, isTabletViewport, sidebarCollapsed, collapseSidebar]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
    const initialPathname = typeof window !== "undefined" ? window.location.pathname : "";
    if (pathnameToPageKey(initialPathname) === "dashboard") {
      prefetchRouteModule(initialPathname);
    }
    (async () => {
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), {
          credentials: "include",
          signal: controller.signal,
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) {
          navigate(spaPath("login"), { replace: true });
          return;
        }
        const u = json.data;
        if (u.user_type === "member") {
          window.location.assign(new URL(spaPath("member"), window.location.origin).href);
          return;
        }
        if (u.needs_owner_secondary) {
          navigate(spaPath("owner-secondary-password"), { replace: true });
          return;
        }
        if (u.needs_user_secondary) {
          navigate(spaPath("user-secondary-password"), { replace: true });
          return;
        }
        applyLoginScopeToSessionStorageIfNeeded(u);
        rememberCompanySessionFlags({
          company_id: u.company_id,
          company_code: u.company_code,
          has_gambling: u.company_has_gambling,
          has_bank: u.company_has_bank,
        });
        setMe(u);
        clearChunkReloadFlag();
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        navigate(spaPath("login"), { replace: true });
      } finally {
        if (!cancelled) {
          window.clearTimeout(timeoutId);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [navigate]);

  useEffect(() => {
    if (loading || !me) return undefined;

    let stopped = false;
    let inFlight = false;
    /** Maintenance probe — keep light; cross-tab bus already broadcasts enable events. */
    const POLL_MS = 30000;

    const tick = async () => {
      if (stopped || inFlight) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const res = await fetch(buildApiUrl("api/session/current_user_api.php"), {
          credentials: "include",
          cache: "no-store",
        });
        let json = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }
        if (!res.ok && !stopped && (json?.maintenance_mode === true || json?.data?.maintenance_mode === true)) {
          if (typeof json?.message === "string" && json.message.trim() !== "") {
            safeSession.setItem("ec_maintenance_notice", json.message.trim());
          }
          // Tell sibling tabs in the same browser profile to logout immediately.
          publishMaintenanceModeEvent({
            enabled: true,
            message: typeof json?.message === "string" ? json.message : "",
          });
          resetDashboardSessionCaches();
          clearDashboardFilterSession();
          clearOwnerCompaniesCache();
          window.location.assign(new URL(spaPath("login"), window.location.origin).href);
        }
      } catch {
        // silent: next tick retries
      } finally {
        inFlight = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };

    // Session was just loaded — do not fire an immediate duplicate request.
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loading, me]);

  useEffect(() => {
    if (loading || !me) return undefined;

    const isItAllowlisted = ["IT_JK", "IT_JS", "IT_MS"].includes(String(me?.login_id || "").trim().toUpperCase());
    if (isItAllowlisted) return undefined;

    return subscribeMaintenanceModeEvent((event) => {
      if (!event?.enabled) return;
      if (typeof event.message === "string" && event.message.trim() !== "") {
        safeSession.setItem("ec_maintenance_notice", event.message.trim());
      }
      resetDashboardSessionCaches();
      clearDashboardFilterSession();
      clearOwnerCompaniesCache();
      window.location.assign(new URL(spaPath("login"), window.location.origin).href);
    });
  }, [loading, me]);

  const refreshSessionDebouncedRef = useRef(null);

  const refreshSession = useCallback(async () => {
    const filterAtStart = readPersistedDashboardGcFilter();
    try {
      const res = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const filterNow = readPersistedDashboardGcFilter();
        if (!dashboardGcFiltersEqual(filterAtStart, filterNow)) return null;
        if (!shouldRefreshExpiryFromSession(json.data, filterNow)) return null;
        applyLoginScopeToSessionStorageIfNeeded(json.data);

        // Pure Group: always Games identity for sidebar (ignore stale PHP subsidiary session).
        if (filterNow.groupOnly && filterNow.selectedGroup) {
          const groupGambling = resolveGroupOnlySidebarGambling(filterNow.selectedGroup);
          const groupExp = resolveSidebarExpirationForFilter({
            selectedGroup: filterNow.selectedGroup,
            companyId: null,
          });
          setMe((prev) => {
            if (!prev) return prev;
            return patchMeFromCompanyContext(prev, {
              companyId: null,
              companyCode: filterNow.selectedGroup,
              hasBank: false,
              forceGroupGamesCategory: true,
              hasGambling: groupGambling != null ? groupGambling : true,
              expirationDate: groupExp !== undefined ? groupExp : null,
            });
          });
          setSidebarGcTick((n) => n + 1);
          return json.data;
        }

        // Subsidiary selected: prefer owner-company row / session-switch cache over payload
        // (Group login historically returned fixed Games and re-showed Report on Bank companies).
        const filterCompanyId =
          filterNow.companyId != null && filterNow.companyId !== ""
            ? Number(filterNow.companyId)
            : null;
        const categoryCompanyId =
          Number.isFinite(filterCompanyId) && filterCompanyId > 0 ? filterCompanyId : null;
        let categoryOverride = null;
        if (categoryCompanyId != null) {
          const row = findOwnerCompanyById(categoryCompanyId);
          categoryOverride =
            resolveCompanyCategoryFlags(row) ?? categoryFlagsFromSession(null, categoryCompanyId);
        }
        const hasGambling =
          categoryOverride != null
            ? Boolean(categoryOverride.hasGambling)
            : Boolean(json.data.company_has_gambling);
        const hasBank =
          categoryOverride != null
            ? Boolean(categoryOverride.hasBank)
            : Boolean(json.data.company_has_bank);

        if (categoryCompanyId != null) {
          rememberCompanySessionFlags({
            company_id: categoryCompanyId,
            company_code: json.data.company_code,
            has_gambling: hasGambling,
            has_bank: hasBank,
          });
        }
        const sessionMe =
          categoryOverride != null
            ? {
                ...json.data,
                company_has_gambling: hasGambling,
                company_has_bank: hasBank,
              }
            : json.data;

        let appliedSessionToSidebar = false;
        setMe((prev) => {
          if (!prev) return sessionMe;
          if (shouldApplySessionToSidebar(json.data, filterNow)) {
            appliedSessionToSidebar = true;
            return sessionMe;
          }
          return {
            ...prev,
            expiration_hint: json.data.expiration_hint,
            expiration_status: json.data.expiration_status,
            expiration_date: json.data.expiration_date,
            days_until_expiration: json.data.days_until_expiration,
            pending_auto_renew_count: Number(json.data.pending_auto_renew_count) || 0,
          };
        });
        if (appliedSessionToSidebar) {
          setSidebarGcTick((n) => n + 1);
        }
        return sessionMe;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  const scheduleRefreshSession = useCallback(() => {
    if (refreshSessionDebouncedRef.current) {
      window.clearTimeout(refreshSessionDebouncedRef.current);
    }
    refreshSessionDebouncedRef.current = window.setTimeout(() => {
      refreshSessionDebouncedRef.current = null;
      void refreshSession();
    }, 0);
  }, [refreshSession]);

  useEffect(
    () => () => {
      if (refreshSessionDebouncedRef.current) {
        window.clearTimeout(refreshSessionDebouncedRef.current);
      }
    },
    [],
  );

  const applySidebarPatch = useCallback((patch) => {
    if (!patch) return;
    setMe((prev) => {
      if (!prev) return prev;
      return patchMeFromCompanyContext(prev, patch);
    });
  }, []);

  const lastSidebarFilterSigRef = useRef("");

  const applySidebarFromFilterDetail = useCallback(
    (detail, options = {}) => {
      if (!detail) {
        applySidebarPatch(null);
        setSidebarGcTick((n) => n + 1);
        scheduleRefreshSession();
        return;
      }
      if (!options.force && !dashboardFilterEventMatchesPersisted(detail)) return;

      let resolved = buildDashboardFilterEventDetailFromPersisted();
      const detailCompanyId =
        detail?.companyId != null && detail.companyId !== ""
          ? Number(detail.companyId)
          : null;
      if (Number.isFinite(detailCompanyId) && detailCompanyId > 0) {
        resolved = {
          ...resolved,
          companyId: detailCompanyId,
          groupAllMode: false,
          companyCode:
            detail.companyCode != null && String(detail.companyCode).trim() !== ""
              ? String(detail.companyCode).trim().toUpperCase()
              : resolved.companyCode,
          ...(detail.hasGambling != null
            ? { hasGambling: Boolean(detail.hasGambling) }
            : {}),
          ...(detail.hasBank != null ? { hasBank: Boolean(detail.hasBank) } : {}),
          ...(detail.expirationDate !== undefined
            ? { expirationDate: detail.expirationDate }
            : {}),
        };
      }
      const sig = dashboardSidebarFilterSignature(resolved);
      if (sig === lastSidebarFilterSigRef.current) return;
      lastSidebarFilterSigRef.current = sig;

      const cid = resolved.companyId;
      const skipRefresh = options.skipSessionRefresh === true || resolved.groupOnly;
      if (cid == null) {
        const patch = { companyId: null, companyCode: resolved.companyCode ?? "" };
        const includeBank = Boolean(resolved.groupAllMode) && !resolved.groupOnly;
        const groupFlags = resolved.selectedGroup
          ? resolveGroupCategoryFlagsForSidebar(resolved.selectedGroup, { includeBank })
          : null;
        if (resolved.groupOnly) {
          // Group tenant contract: always Games identity; never Bank category.
          patch.hasBank = false;
          patch.hasGambling = true;
          patch.forceGroupGamesCategory = true;
        } else {
          if (resolved.hasGambling != null) patch.hasGambling = Boolean(resolved.hasGambling);
          else if (groupFlags) patch.hasGambling = groupFlags.hasGambling;
          if (resolved.hasBank != null) patch.hasBank = Boolean(resolved.hasBank);
          else if (groupFlags) patch.hasBank = groupFlags.hasBank;
        }
        const expirationDate = resolveSidebarExpirationForFilter(resolved);
        patch.expirationDate = expirationDate !== undefined ? expirationDate : null;
        applySidebarPatch(patch);
        setSidebarGcTick((n) => n + 1);
        if (!skipRefresh) scheduleRefreshSession();
        return;
      }
      const row = findOwnerCompanyById(cid);
      const companyCode =
        resolved.companyCode ??
        (row?.company_id ? String(row.company_id).trim().toUpperCase() : null);
      const flags =
        resolved.hasGambling != null || resolved.hasBank != null
          ? {
              hasGambling: Boolean(resolved.hasGambling),
              hasBank: Boolean(resolved.hasBank),
            }
          : categoryFlagsFromSession(null, cid) ?? resolveCompanyCategoryFlags(row);
      const expirationDate = resolveSidebarExpirationForFilter(resolved);
      applySidebarPatch({
        companyId: cid,
        companyCode,
        ...(flags
          ? {
              hasGambling: Boolean(flags.hasGambling),
              hasBank: Boolean(flags.hasBank),
            }
          : {}),
        expirationDate: expirationDate !== undefined ? expirationDate : null,
      });
      setSidebarGcTick((n) => n + 1);
      if (!skipRefresh) scheduleRefreshSession();
    },
    [applySidebarPatch, scheduleRefreshSession],
  );

  const sidebarFilterApplyRafRef = useRef(null);
  const sidebarFilterApplyPendingRef = useRef(null);

  const queueSidebarApplyFromFilterDetail = useCallback(
    (detail, options = {}) => {
      sidebarFilterApplyPendingRef.current = { detail, options };
      if (sidebarFilterApplyRafRef.current != null) return;
      sidebarFilterApplyRafRef.current = requestAnimationFrame(() => {
        sidebarFilterApplyRafRef.current = null;
        const pending = sidebarFilterApplyPendingRef.current;
        sidebarFilterApplyPendingRef.current = null;
        if (pending) applySidebarFromFilterDetail(pending.detail, pending.options);
      });
    },
    [applySidebarFromFilterDetail],
  );

  useEffect(
    () => () => {
      if (sidebarFilterApplyRafRef.current != null) {
        cancelAnimationFrame(sidebarFilterApplyRafRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const onCompanySession = (e) => {
      const data = e?.detail;
      const filter = readPersistedDashboardGcFilter();

      if (filter.groupOnly && filter.selectedGroup) {
        if (data && typeof data === "object" && shouldApplySessionToSidebar(data, filter)) {
          const groupOnlyExp = resolveSidebarExpirationForFilter({
            selectedGroup: filter.selectedGroup,
            companyId: null,
          });
          const groupGambling = resolveGroupOnlySidebarGambling(filter.selectedGroup);
          applySidebarPatch({
            companyId: null,
            companyCode: filter.selectedGroup,
            hasBank: false,
            ...(groupGambling != null ? { hasGambling: groupGambling } : {}),
            ...(groupOnlyExp !== undefined ? { expirationDate: groupOnlyExp } : {}),
          });
        }
        return;
      }

      if (data && typeof data === "object") {
        const sid = Number(data.company_id);
        const row = Number.isFinite(sid) && sid > 0 ? findOwnerCompanyById(sid) : null;
        const expirationDate = row ? row.expiration_date ?? null : undefined;
        if (shouldApplySessionToSidebar(data, filter)) {
          applySidebarPatch({
            companyId: data.company_id,
            companyCode: data.company_code,
            hasGambling: data.has_gambling,
            hasBank: data.has_bank,
            ...(expirationDate !== undefined ? { expirationDate } : {}),
          });
        } else if (expirationDate !== undefined) {
          const expectedId =
            filter.companyId != null && filter.companyId !== ""
              ? Number(filter.companyId)
              : null;
          if (expectedId === sid) {
            applySidebarPatch({ companyId: sid, expirationDate });
          }
        }
      }
      scheduleRefreshSession();
    };
    const onSessionRefresh = () => {
      scheduleRefreshSession();
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    window.addEventListener("eazycount:session-refresh-requested", onSessionRefresh);
    return () => {
      window.removeEventListener("eazycount:company-session-updated", onCompanySession);
      window.removeEventListener("eazycount:session-refresh-requested", onSessionRefresh);
    };
  }, [applySidebarPatch, scheduleRefreshSession]);

  useEffect(() => {
    if (!me?.has_c168_auto_renew_access) return;

    const onPendingChanged = (event) => {
      const count = Number(event.detail?.pendingCount);
      if (!Number.isFinite(count)) return;
      setMe((prev) => {
        if (!prev || prev.pending_auto_renew_count === count) return prev;
        return { ...prev, pending_auto_renew_count: count };
      });
    };

    let cancelled = false;
    const ac = new AbortController();

    const tick = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void syncAutoRenewPendingCount({ signal: ac.signal }).catch(() => {});
    };

    window.addEventListener(AUTO_RENEW_PENDING_CHANGED_EVENT, onPendingChanged);
    document.addEventListener("visibilitychange", tick);
    tick();
    const intervalId = window.setInterval(tick, 45000);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(intervalId);
      window.removeEventListener(AUTO_RENEW_PENDING_CHANGED_EVENT, onPendingChanged);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [me?.has_c168_auto_renew_access]);

  const syncSidebarFromPersistedFilter = useCallback(
    (options = {}) => {
      const detail = buildDashboardFilterEventDetailFromPersisted();
      if (!detail.selectedGroup && detail.companyId == null) return;
      applySidebarFromFilterDetail(detail, {
        force: options.force === true,
        skipSessionRefresh: options.skipSessionRefresh === true,
      });
    },
    [applySidebarFromFilterDetail],
  );

  const initialSidebarSyncRef = useRef(false);

  /** Login: seed filter from login scope, then replay persisted filter once session `me` is available. */
  useLayoutEffect(() => {
    if (loading || !me) return;
    applyLoginScopeToSessionStorageIfNeeded(me);
    if (initialSidebarSyncRef.current) return;
    initialSidebarSyncRef.current = true;
    syncSidebarFromPersistedFilter({ force: true, skipSessionRefresh: true });
  }, [loading, me, syncSidebarFromPersistedFilter]);

  const dashboardSidebarSyncRef = useRef({ path: "", sig: "" });

  /** Re-sync sidebar when entering dashboard so group-only bankprocess rules apply immediately. */
  useLayoutEffect(() => {
    if (pageKey !== "dashboard") {
      dashboardSidebarSyncRef.current = { path: "", sig: "" };
      return;
    }
    if (loading || !me) return;
    const detail = buildDashboardFilterEventDetailFromPersisted();
    const sig = dashboardSidebarFilterSignature(detail);
    const prev = dashboardSidebarSyncRef.current;
    if (prev.path === path && prev.sig === sig) return;
    dashboardSidebarSyncRef.current = { path, sig };
    syncSidebarFromPersistedFilter({ force: true, skipSessionRefresh: true });
  }, [loading, me, path, syncSidebarFromPersistedFilter]);

  useEffect(() => {
    const onBootstrapReady = () => {
      syncSidebarFromPersistedFilter({ force: true, skipSessionRefresh: true });
    };
    window.addEventListener(DASHBOARD_GC_BOOTSTRAP_READY_EVENT, onBootstrapReady);
    return () => window.removeEventListener(DASHBOARD_GC_BOOTSTRAP_READY_EVENT, onBootstrapReady);
  }, [syncSidebarFromPersistedFilter]);

  useEffect(() => {
    const onOwnerGroupsLoaded = () => {
      const filter = readPersistedDashboardGcFilter();
      if (!filter.groupOnly || !filter.selectedGroup) return;
      const expirationDate = resolveSidebarExpirationForFilter({
        selectedGroup: filter.selectedGroup,
        companyId: null,
      });
      const groupFlags = resolveGroupCategoryFlagsForSidebar(filter.selectedGroup, {
        includeBank: false,
      });
      applySidebarPatch({
        companyId: null,
        ...(groupFlags
          ? { hasGambling: groupFlags.hasGambling, hasBank: false }
          : {}),
        ...(expirationDate !== undefined ? { expirationDate } : {}),
      });
      setSidebarGcTick((n) => n + 1);
    };
    window.addEventListener("eazycount:owner-groups-loaded", onOwnerGroupsLoaded);
    return () => window.removeEventListener("eazycount:owner-groups-loaded", onOwnerGroupsLoaded);
  }, [applySidebarPatch]);

  useLayoutEffect(() => {
    const onFilterChange = (e) => queueSidebarApplyFromFilterDetail(e?.detail ?? null);
    window.addEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChange);
    return () => window.removeEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilterChange);
  }, [queueSidebarApplyFromFilterDetail]);

  useEffect(() => {
    setHoverSection(null);
  }, [location.pathname]);

  useEffect(() => {
    if (loading || !me) return;

    if (pathnameIs("transaction", path)) {
      void import("../pages/transaction/transactionRoutePrefetch.js").then(({ warmTransactionRouteCache }) => {
        warmTransactionRouteCache({ me });
      });
    }

    prefetchRouteModule(path);
    /* Warm persisted dashboard scope on every authenticated idle — including Home landing —
     * so sibling company/currency page warm can reuse the same session cache sooner. */
    if (canAccessPermission(me, "home")) {
      if (pageKey !== "dashboard") {
        prefetchRouteModule(spaPath("dashboard"));
      }
      void import("../pages/dashboard/dashboardRoutePrefetch.js").then(({ warmDashboardRouteCache }) => {
        warmDashboardRouteCache({ me });
      });
    }

    const processListSpaPath =
      me?.company_has_bank && !me?.company_has_gambling
        ? spaPath("bank-process-list")
        : spaPath("process-list");

    const runCompanies = () => {
      void fetchOwnerCompaniesAll({ me });
      void fetchOwnerGroupsAll(me);
    };

    const runAccountListWarm = () => {
      const { selectedGroup, companyId } = readPersistedDashboardGcFilter();
      const groupOnly = isDashboardGroupOnlyMode();
      void import("../pages/account/accountRoutePrefetch.js").then(({ warmAccountListRouteCache }) => {
        warmAccountListRouteCache({
          companyId: groupOnly ? null : companyId,
          groupId: groupOnly ? selectedGroup : null,
        });
      });
    };

    const runProcessListWarm = () => {
      if (!me?.company_id) return;
      void import("../pages/processlist/processRoutePrefetch.js").then((mod) => {
        if (me.company_has_bank && !me.company_has_gambling) {
          mod.warmBankProcessListRouteCache(me.company_id);
        } else {
          mod.warmProcessListRouteCache(me.company_id);
        }
      });
    };

    // Eager Acc→Process: prefetch Process chunk + warm list as soon as Acc is open (not only idle).
    if (pathnameIs("account-list", path) || pathnameIs("add-account", path)) {
      prefetchRouteModule(processListSpaPath);
      runProcessListWarm();
    }

    const runTransactionWarm = () => {
      void import("../pages/transaction/transactionRoutePrefetch.js").then(({ warmTransactionRouteCache }) => {
        warmTransactionRouteCache({ me });
      });
    };

    const runIdleWarm = () => {
      if (pageKey === "dashboard") return;
      runCompanies();
      runProcessListWarm();
      if (pathnameIs("account-list", path) || pathnameIs("add-account", path)) {
        prefetchRouteModule(processListSpaPath);
        runAccountListWarm();
      } else if (pathnameIs("dashboard", path)) {
        runAccountListWarm();
      }
      if (pathnameIs("transaction", path)) {
        runTransactionWarm();
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(runIdleWarm, { timeout: 5000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timerId = window.setTimeout(runIdleWarm, 2000);
    return () => window.clearTimeout(timerId);
  }, [loading, me, pageKey, path]);

  useEffect(() => {
    const warmRoute = (event) => {
      const target = event.target.closest("[data-prefetch-path]");
      if (!target) return;
      const menuRoot = menuContentRef.current;
      const inMenu = menuRoot?.contains(target);
      const inFlyout = target.closest("#report-submenu, #maintenance-submenu");
      if (!inMenu && !inFlyout) return;

      const routePath = target.dataset.prefetchPath;
      const routePageKey = routePath ? pathnameToPageKey(routePath) : null;
      if (routePath) {
        prefetchRouteModule(routePath);
        if (routePageKey === "auto-renew" && me?.has_c168_auto_renew_access) prefetchAutoRenewList();
        if (routePageKey === "ownership") prefetchOwnershipCompanies();
        if (
          (routePageKey === "process-list" || routePageKey === "games-process-list") &&
          me?.company_id
        ) {
          void import("../pages/processlist/processRoutePrefetch.js").then(({ warmProcessListRouteCache }) => {
            warmProcessListRouteCache(me.company_id);
          });
        }
        if (routePageKey === "bank-process-list" && me?.company_id) {
          void import("../pages/processlist/processRoutePrefetch.js").then(({ warmBankProcessListRouteCache }) => {
            warmBankProcessListRouteCache(me.company_id);
          });
        }
        if (routePageKey === "account-list") {
          const { selectedGroup, companyId } = readPersistedDashboardGcFilter();
          const groupOnly = isDashboardGroupOnlyMode();
          void import("../pages/account/accountRoutePrefetch.js").then(({ warmAccountListRouteCache }) => {
            warmAccountListRouteCache({
              companyId: groupOnly ? null : companyId,
              groupId: groupOnly ? selectedGroup : null,
            });
          });
        }
        if (routePageKey === "transaction" && me) {
          void import("../pages/transaction/transactionRoutePrefetch.js").then(({ warmTransactionRouteCache }) => {
            warmTransactionRouteCache({ me });
          });
        }
      }
    };
    document.addEventListener("pointerdown", warmRoute, { capture: true });
    document.addEventListener("mouseover", warmRoute);
    document.addEventListener("focusin", warmRoute);
    return () => {
      document.removeEventListener("pointerdown", warmRoute, { capture: true });
      document.removeEventListener("mouseover", warmRoute);
      document.removeEventListener("focusin", warmRoute);
    };
  }, [me]);

  // --- Notification Logic ---
  const toggleNotifications = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!showNotifications) {
      onBellOpen();
      setShowNotifications(true);
      setAnnouncementsLoading(true);
      try {
        const res = await fetch(buildApiUrl("api/announcements/announcement_get_dashboard_api.php"), { credentials: "include" });
        const json = await res.json();
        if (json.success && json.data) {
          setAnnouncements(json.data);
        } else {
          setAnnouncements([]);
        }
      } catch {
        setAnnouncements([]);
      } finally {
        setAnnouncementsLoading(false);
      }
    } else {
      setShowNotifications(false);
    }
  };

  const markAnnouncementRead = (id) => {
    setReadAnnouncements(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  // --- Avatar Logic ---
  const handleSelectAvatar = (avatarId) => {
    setSelectedAvatarId(avatarId);
    setShowAvatarOptions(false);
    try {
      safeLocal.setItem("selectedAvatar", avatarId);
    } catch (e) {
      /* ignore */
    }
    document.cookie = `selectedAvatar=${encodeURIComponent(avatarId)}; path=/; max-age=31536000; SameSite=Lax`;
  };

  const canAccess = (key) => canAccessPermission(me, key);
  const showFullMaintenanceMenu = canAccessFullMaintenance(me);
  const showLimitedMaintenanceMenu = canAccessLimitedMaintenance(me);
  const showMaintenanceMenu = showMaintenanceInSidebar(me);
  const isBankOnlyCategory = Boolean(me?.company_has_bank) && !me?.company_has_gambling;
  const showCaptureMaintenance = useMemo(() => {
    void sidebarGcTick;
    return canAccessCaptureMaintenance(me);
  }, [me, sidebarGcTick]);
  const showBankprocessMaintenance = useMemo(() => {
    void sidebarGcTick;
    return shouldShowBankprocessMaintenanceInSidebar(me);
  }, [me, sidebarGcTick]);
  
  const avatarSrc = useMemo(() => AVATAR_MAP[selectedAvatarId] || AVATAR_MAP.male1, [selectedAvatarId]);
  const roleLabel = useMemo(() => {
    if (!me?.role) return "";
    const t = (key) => getUserListText(lang, key);
    return formatUserRoleDisplay(t, me.role);
  }, [lang, me?.role]);
  const processSpaPath =
    me?.company_has_bank && !me?.company_has_gambling ? spaPath("bank-process-list") : spaPath("process-list");
  const performLogout = async () => {
    if (logoutLoading) return;
    setLogoutLoading(true);
    try {
      safeSession.setItem("ec_skip_session_bootstrap", "1");
      await fetch(buildApiUrl("api/session/logout_api.php"), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Even if request fails, clear client route to login.
    } finally {
      resetDashboardSessionCaches();
      clearDashboardFilterSession();
      clearOwnerCompaniesCache();
      setLogoutLoading(false);
      setShowLogoutConfirm(false);
      window.location.assign(new URL(spaPath("login"), window.location.origin).href);
    }
  };
  const isProcessPage = pathnameIs("process-list", path) || pathnameIs("bank-process-list", path);
  const applyLanguage = (nextLang) => {
    const normalized = nextLang === "zh" ? "zh" : "en";
    setLang(normalized);
    applyLoginLang(normalized);
  };
  const openHoverSubmenu = (section) => {
    if (submenuCloseTimerRef.current) {
      clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
    dismissAllPortalTooltips();
    setHoverSection(section);
  };

  const scheduleCloseHoverSubmenu = useCallback(() => {
    if (submenuCloseTimerRef.current) clearTimeout(submenuCloseTimerRef.current);
    submenuCloseTimerRef.current = window.setTimeout(() => {
      setHoverSection(null);
      submenuCloseTimerRef.current = null;
    }, 160);
  }, []);

  const cancelCloseHoverSubmenu = useCallback(() => {
    if (submenuCloseTimerRef.current) {
      clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
  }, []);

  const sessionContextValue = useMemo(
    () => ({
      me,
      sessionReady: !loading && Boolean(me),
      refreshSession,
      lang,
      isGroupLogin: isGroupLogin(me),
      isCompanyLogin: isCompanyLogin(me),
      canUseGroupOnlyMode: canUseGroupOnlyMode(me),
    }),
    [me, loading, refreshSession, lang]
  );

  if (loading) return <AppBootLoading label={lang === "zh" ? "正在加载…" : "Loading…"} />;
  if (!me) return <Navigate to={spaPath("login")} replace />;

  if (pageKey === "dashboard" && !canAccessDashboard(me)) {
    const fallback = resolveDefaultLandingPath(me);
    if (fallback) return <Navigate to={fallback} replace />;
  }

  /* Numbered sidebar menu: permissions hide items per user, so numbers must follow
     the items actually visible. They are assigned while the JSX below evaluates in
     visual order — each visible top-level item calls sidebarSeqLabel, and its flyout
     children call sidebarSubSeqLabel with the same key. */
  const sidebarSeqState = { top: 0, sub: {} };
  const sidebarSeqLabel = (key, label) => {
    sidebarSeqState.top += 1;
    sidebarSeqState[key] = sidebarSeqState.top;
    sidebarSeqState.sub[key] = 0;
    return `${sidebarSeqState.top}. ${label}`;
  };
  const sidebarSubSeqLabel = (key, label) => {
    const parentNo = sidebarSeqState[key];
    if (!parentNo) return label;
    sidebarSeqState.sub[key] += 1;
    return `${parentNo}.${sidebarSeqState.sub[key]} ${label}`;
  };

  return (
    <AuthSessionProvider value={sessionContextValue}>
    <>
      <AppRealtimeBridge />
      {!chromelessPaymentHistory ? (
      <>
      <div
        className={`informationmenu-overlay sidebar-dismiss-overlay${sidebarTabletExpanded ? " show" : ""}`}
        onClick={collapseSidebar}
        aria-hidden={!sidebarTabletExpanded}
      />
      <div className={`informationmenu${sidebarIconOnly ? " is-collapsed" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="informationmenu-header">
          <div className="header-logo-section">
            {isTabletViewport && sidebarCollapsed && (
              <SidebarMenuTooltip label={i18n.sidebarExpand} enabled={sidebarIconOnly}>
                <button
                  type="button"
                  className="sidebar-hamburger-toggle"
                  onClick={onHamburgerClick}
                  aria-label={i18n.sidebarExpand}
                  aria-expanded={false}
                >
                  <span className="sidebar-hamburger-box" aria-hidden="true">
                    <span className="sidebar-hamburger-line" />
                    <span className="sidebar-hamburger-line" />
                    <span className="sidebar-hamburger-line" />
                  </span>
                </button>
              </SidebarMenuTooltip>
            )}
            <img src={assetUrl("images/count_whitelogo.png")} alt="EAZYCOUNT" className="header-logo" />
            <div className={`notification-bell${hasBellBadge ? " has-unread" : ""}`} onClick={toggleNotifications}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C10.34 2 9 3.34 9 5V5.29C6.72 6.15 5.12 8.39 5.01 11L5 11V16L3 18V19H21V18L19 16V11C18.88 8.39 17.28 6.15 15 5.29V5C15 3.34 13.66 2 12 2ZM12 22C10.9 22 10 21.1 10 20H14C14 21.1 13.1 22 12 22Z" />
                </svg>
            </div>
          </div>
          <div className="user-info-container">
            <div className="avatar-selector-container">
              <button
                type="button"
                className="current-avatar"
                aria-label={i18n.chooseAvatar}
                onClick={() => setShowAvatarOptions(true)}
              >
                <img className="current-avatar-img" src={avatarSrc} alt="" width={36} height={36} />
              </button>
            </div>
            
            <div className="user-info">
              <div className="user-name" title={me?.name || me?.login_id || undefined}>
                {me?.name || me?.login_id || "-"}
              </div>
              <div className="user-role" title={roleLabel || i18n.user || undefined}>
                {roleLabel || i18n.user}
              </div>
            </div>
          </div>
          <SidebarLangSwitch lang={lang} onLanguageChange={applyLanguage} ariaLabel={i18n.switchLanguage} />
        </div>

        <div className="sidebar-scroll-clip">
        <div className="sidebar-scroll" ref={menuContentRef}>
        <div className="informationmenu-content">
          <div className="content-separator" />
          {canAccess("home") && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarHome} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/dashboard"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "dashboard" ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("home", i18n.sidebarHome)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {showC168DomainPages && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarDomain} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/domain"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "domain" ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm6.93 8h-3.46c-.14-2.01-.5-3.88-1.06-5.38 2.16.76 3.76 2.62 4.52 5.38zm-6.93 0h-4.9c.13-1.78.58-3.51 1.28-4.9.53-1.04 1.16-1.79 1.78-2.21.6-.41.98-.46 1.84-.46v7.57zm0 2v7.57c-.86 0-1.24-.05-1.84-.46-.62-.43-1.25-1.17-1.78-2.21-.7-1.39-1.15-3.12-1.28-4.9h4.9zm2 7.43V12h4.9c-.13 1.78-.58 3.51-1.28 4.9-.53 1.04-1.16 1.79-1.78 2.21-.6.41-.98.46-1.84.46zm0-9.43V4.43c.86 0 1.24.05 1.84.46.62.43 1.25 1.17 1.78 2.21.7 1.39 1.15 3.12 1.28 4.9h-4.9zM5.07 12h3.46c.14 2.01.5 3.88 1.06 5.38-2.16-.76-3.76-2.62-4.52-5.38z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("domain", i18n.sidebarDomain)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {showC168DomainPages && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarAnnouncement} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/announcement"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "announcement" ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("announcement", i18n.sidebarAnnouncement)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {showAutoRenewEntry && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarAutoRenew} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/auto-renew"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "auto-renew" ? "current-page" : "account-direct"}${me?.pending_auto_renew_count > 0 ? " has-sidebar-pending-badge" : ""}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
                  </svg>
                  <span className="sidebar-menu-label-wrap">
                    <span className="sidebar-menu-label">{sidebarSeqLabel("autoRenew", i18n.sidebarAutoRenew)}</span>
                    {me?.pending_auto_renew_count > 0 ? (
                      <span className="sidebar-pending-badge" aria-label={`${me.pending_auto_renew_count} pending`}>
                        {me.pending_auto_renew_count}
                      </span>
                    ) : null}
                  </span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {canAccess("admin") && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarAdmin} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/userlist"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "userlist" ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("admin", i18n.sidebarAdmin)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {canAccess("account") && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarAccount} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/account-list"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "account-list" ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("account", i18n.sidebarAccount)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {canAccess("ownership") && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarOwnership} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/ownership"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "ownership" ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("ownership", i18n.sidebarOwnership)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {canAccess("process") && !hideProcessWhenGroupOnly && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarProcess} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to={processSpaPath}
                  goTo={goTo}
                  prefetchPath={processSpaPath}
                  className={`informationmenu-section-title ${isProcessPage ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("process", i18n.sidebarProcess)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {canAccess("datacapture") && (me?.company_has_gambling || me?.company_has_bank) && (
            <div className="informationmenu-section">
              <SidebarNavTip label={i18n.sidebarDataCapture} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/datacapture"
                  goTo={goTo}
                  onBeforeNavigate={() => {
                    if (pageKey === "datacapturesummary") {
                      clearDataCaptureRoundLocalStorage();
                    }
                  }}
                  className={`informationmenu-section-title ${isDataCaptureSidebarActive ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("datacapture", i18n.sidebarDataCapture)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {canAccess("payment") && (
            <div className="informationmenu-section informationmenu-section--transaction-payment">
              <SidebarNavTip label={i18n.sidebarTransactionPayment} enabled={sidebarIconOnly}>
                <SidebarSectionLink
                  to="/transaction"
                  goTo={goTo}
                  className={`informationmenu-section-title ${pageKey === "transaction" ? "current-page" : "account-direct"}`}
                >
                  <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
                  </svg>
                  <span className="sidebar-menu-label">{sidebarSeqLabel("payment", i18n.sidebarTransactionPayment)}</span>
                </SidebarSectionLink>
              </SidebarNavTip>
            </div>
          )}
          {canShowReportInSidebar(me) && (
            <div className="informationmenu-section">
              <div className="menu-item-wrapper" onMouseLeave={scheduleCloseHoverSubmenu}>
                <SidebarNavTip label={i18n.sidebarReport} enabled={sidebarIconOnly} placement="top">
                  <div
                    ref={reportTitleRef}
                    className={`informationmenu-section-title ${pageKey === "customer-report" || pageKey === "domain-report" ? "active" : ""}`}
                    data-section="report"
                    aria-expanded={hoverSection === "report"}
                    aria-controls="report-submenu"
                    aria-haspopup="menu"
                    onMouseEnter={() => {
                      cancelCloseHoverSubmenu();
                      openHoverSubmenu("report");
                    }}
                  >
                    <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                    </svg>
                    <span className="sidebar-menu-label">{sidebarSeqLabel("report", i18n.sidebarReport)}</span>
                    <span className="section-arrow">▶</span>
                  </div>
                </SidebarNavTip>
                <SidebarFlyoutSubmenu
                  id="report-submenu"
                  open={hoverSection === "report"}
                  anchorRef={reportTitleRef}
                  onMouseEnter={() => {
                    cancelCloseHoverSubmenu();
                    setHoverSection("report");
                  }}
                  onMouseLeave={scheduleCloseHoverSubmenu}
                >
                  <a
                    {...sidebarSubmenuLinkProps("/customer-report", goTo)}
                    className={`submenu-item ${pageKey === "customer-report" ? "current-page" : ""}`}
                    data-prefetch-path="/customer-report"
                  >
                    <span>{sidebarSubSeqLabel("report", i18n.sidebarCustomerReport)}</span>
                  </a>
                  <a
                    {...sidebarSubmenuLinkProps("/domain-report", goTo)}
                    className={`submenu-item ${pageKey === "domain-report" ? "current-page" : ""}`}
                    data-prefetch-path="/domain-report"
                  >
                    <span>{sidebarSubSeqLabel("report", i18n.sidebarDomainReport)}</span>
                  </a>
                </SidebarFlyoutSubmenu>
              </div>
            </div>
          )}
          {showMaintenanceMenu && (
            <div className="informationmenu-section">
              <div className="menu-item-wrapper" onMouseLeave={scheduleCloseHoverSubmenu}>
                <SidebarNavTip label={i18n.sidebarMaintenance} enabled={sidebarIconOnly} placement="top">
                  <div
                    ref={maintenanceTitleRef}
                    className={`informationmenu-section-title ${(["payment-maintenance", "capture-maintenance", "transaction-maintenance", "formula-maintenance", "bankprocess-maintenance"].includes(pageKey)) ? "active" : ""}`}
                    data-section="maintenance"
                    aria-expanded={hoverSection === "maintenance"}
                    aria-controls="maintenance-submenu"
                    aria-haspopup="menu"
                    onMouseEnter={() => {
                      cancelCloseHoverSubmenu();
                      openHoverSubmenu("maintenance");
                    }}
                  >
                    <svg className="section-icon" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z" />
                    </svg>
                    <span className="sidebar-menu-label">{sidebarSeqLabel("maintenance", i18n.sidebarMaintenance)}</span>
                    <span className="section-arrow">▶</span>
                  </div>
                </SidebarNavTip>
                <SidebarFlyoutSubmenu
                  id="maintenance-submenu"
                  open={hoverSection === "maintenance"}
                  anchorRef={maintenanceTitleRef}
                  onMouseEnter={() => {
                    cancelCloseHoverSubmenu();
                    setHoverSection("maintenance");
                  }}
                  onMouseLeave={scheduleCloseHoverSubmenu}
                >
                    {showCaptureMaintenance && (
                      <a
                        {...sidebarSubmenuLinkProps("/capture-maintenance", goTo)}
                        className={`submenu-item ${pageKey === "capture-maintenance" ? "current-page" : ""}`}
                        data-prefetch-path="/capture-maintenance"
                      >
                        <span>{sidebarSubSeqLabel("maintenance", i18n.sidebarDataCapture)}</span>
                      </a>
                    )}
                    {(me?.company_has_gambling || me?.company_has_bank) &&
                      (showFullMaintenanceMenu || showLimitedMaintenanceMenu) &&
                      !isBankOnlyCategory && (
                      <a
                        {...sidebarSubmenuLinkProps("/transaction-maintenance", goTo)}
                        className={`submenu-item ${pageKey === "transaction-maintenance" ? "current-page" : ""}`}
                        data-prefetch-path="/transaction-maintenance"
                      >
                        <span>{sidebarSubSeqLabel("maintenance", i18n.sidebarTransaction)}</span>
                      </a>
                    )}
                    {showFullMaintenanceMenu && (me?.company_has_gambling || me?.company_has_bank) && (
                      <a
                        {...sidebarSubmenuLinkProps("/payment-maintenance", goTo)}
                        className={`submenu-item ${pageKey === "payment-maintenance" ? "current-page" : ""}`}
                        data-prefetch-path="/payment-maintenance"
                      >
                        <span>{sidebarSubSeqLabel("maintenance", i18n.sidebarPayment)}</span>
                      </a>
                    )}
                    {(me?.company_has_gambling || me?.company_has_bank) &&
                      (showFullMaintenanceMenu || showLimitedMaintenanceMenu) &&
                      !isBankOnlyCategory && (
                      <a
                        {...sidebarSubmenuLinkProps("/formula-maintenance", goTo)}
                        className={`submenu-item ${pageKey === "formula-maintenance" ? "current-page" : ""}`}
                        data-prefetch-path="/formula-maintenance"
                      >
                        <span>{sidebarSubSeqLabel("maintenance", i18n.sidebarFormula)}</span>
                      </a>
                    )}
                    {showFullMaintenanceMenu && showBankprocessMaintenance && (
                      <a
                        {...sidebarSubmenuLinkProps("/bankprocess-maintenance", goTo)}
                        className={`submenu-item ${pageKey === "bankprocess-maintenance" ? "current-page" : ""}`}
                        data-prefetch-path="/bankprocess-maintenance"
                      >
                        <span>{sidebarSubSeqLabel("maintenance", i18n.sidebarBankProcess)}</span>
                      </a>
                    )}
                </SidebarFlyoutSubmenu>
              </div>
            </div>
          )}
        </div>
        </div>
        </div>

        <div className="informationmenu-footer">
          <SidebarExpirationCountdown
            status={me?.expiration_status || "normal"}
            label={i18n.exp}
            hint={formatSidebarExpirationHint(me?.expiration_hint, i18n)}
            clickable={showAutoRenewEntry}
            title={showAutoRenewEntry ? getAutoRenewText(lang, "manageAutoRenew") : undefined}
            onClick={showAutoRenewEntry ? goAutoRenew : undefined}
            onKeyDown={
              showAutoRenewEntry
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goAutoRenew();
                    }
                  }
                : undefined
            }
          />
          <SidebarNavTip label={i18n.logout} enabled={sidebarIconOnly}>
            <button
              type="button"
              className="btn logout-btn"
              onClick={() => setShowLogoutConfirm(true)}
            >
              {sidebarIconOnly ? (
                <svg className="logout-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="16 17 21 12 16 7" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="21" y1="12" x2="9" y2="12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i18n.logout
              )}
            </button>
          </SidebarNavTip>
        </div>
      </div>

      <div className={`notification-overlay ${showNotifications ? "show" : ""}`} id="notificationOverlay" onClick={toggleNotifications}></div>
      </>
      ) : null}
      {!chromelessPaymentHistory ? (
      <div className={`notification-panel ${showNotifications ? "show" : ""}`} id="notificationPanel">
        <div className="notification-header">
            <h2>{i18n.announcements}</h2>
            <button className="notification-close" onClick={toggleNotifications} title={i18n.close}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        <div className="notification-content" id="notificationContent">
          {announcementsLoading ? (
            <div className="notification-empty"><p>{i18n.loadingAnnouncements}</p></div>
          ) : displayAnnouncements.length > 0 ? (
            displayAnnouncements.map((announcement, index) => (
              <AnnouncementUpdateCard
                key={announcement.id ?? index}
                announcement={announcement}
                labels={{
                  updateIncludes: i18n.updateIncludes,
                  versionUpdated: i18n.versionUpdated,
                  teamName: i18n.announcementTeam,
                }}
                className={`notification-item ${announcement.isExpirationReminder || !readAnnouncements.has(index) ? "unread" : ""}${announcement.isExpirationReminder ? " expiration-reminder-item" : ""}`}
                onClick={() => markAnnouncementRead(index)}
              />
            ))
          ) : (
            <div className="notification-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
              </svg>
              <p>{i18n.noAnnouncements}</p>
            </div>
          )}
        </div>
      </div>
      ) : null}

      <ExpirationReminderModal
        open={showExpirationModal}
        title={expirationModalTitle}
        message={expirationModalMessage}
        confirmLabel={expirationModalI18n.confirm}
        onConfirm={dismissExpirationModal}
        secondaryLabel={showAutoRenewEntry ? getExpirationReminderText(lang, "expReminderAutoRenew") : undefined}
        onSecondary={showAutoRenewEntry ? handleExpirationModalSecondary : undefined}
      />

      <AvatarPickerModal
        open={showAvatarOptions}
        onClose={() => setShowAvatarOptions(false)}
        selectedAvatarId={selectedAvatarId}
        selectedGender={selectedGender}
        onGenderChange={setSelectedGender}
        onSelect={handleSelectAvatar}
        title={i18n.chooseAvatar}
        maleLabel={i18n.male}
        femaleLabel={i18n.female}
        cancelLabel={i18n.cancel}
      />

      <ConfirmLogoutModal
        open={showLogoutConfirm}
        loading={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={performLogout}
        i18n={i18n}
      />

      <AnimatedOutlet pageRefreshKey={pageRefreshKey} />
    </>
    </AuthSessionProvider>
  );
}
