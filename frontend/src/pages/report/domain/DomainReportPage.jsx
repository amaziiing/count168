import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { spaPath } from "../../../utils/routing/pageRoutes.js";
import { canShowReportInSidebar } from "../../../utils/auth/sidebarPermissions.js";
import {
  getCachedOwnerCompanies,
  DASHBOARD_GROUP_FILTER_KEY,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  resolveBootCompanyId,
  resolveGcFilterBootCompanyId,
  readPersistedDashboardGcFilter,
  readDashboardSelectedCompanyId,
  companiesInGroupList,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
  fetchOwnerCompaniesAll,
  fetchOwnerGroupsAll,
} from "../../../utils/company/sharedCompanyFilter.js";
import {
  isGroupLedgerDeniedError,
  persistReportCompaniesCache,
  readReportCompaniesCache,
  resolveReportCompanyWhenClosingGroup,
  resolveReportGroupOnlyBoot,
} from "../shared/reportGcBoot.js";
import { useReportGroupCompanyFilter } from "../shared/useReportGroupCompanyFilter.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/domain_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/maintenance_notifications.css";
import { fetchDomainReport, fetchProcesses } from "./domainReportApi.js";
import {
  isDomainGroupProcessSelection,
  mapDomainGroupProcesses,
} from "./domainReportGroupProcesses.js";
import {
  fetchCompanyPermissions,
  isBankOnlyCategoryCompany,
} from "../shared/reportCompanyApi.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { getReportText, REPORT_I18N } from "../../../translateFile/pages/reportTranslate.js";
import DomainReportFilters from "./DomainReportFilters.jsx";
import DomainReportTable from "./DomainReportTable.jsx";
import { reportToastMaintenanceVariant } from "../shared/reportAmountFormat.js";
import { useRealtimeDomain } from "../../../lib/realtime/useRealtimeDomain.js";
import { REALTIME_DOMAINS } from "../../../lib/realtime/realtimeEvents.js";
import {
  buildReportSnapshotKey,
  getReportSnapshot,
  setReportSnapshot,
} from "../shared/reportPageSnapshotCache.js";
import { useReportAbortSeq } from "../shared/useReportAbortSeq.js";
import { customerReportScopeCacheKey } from "../shared/reportScope.js";
import {
  domainReportScopeIsReady,
  domainReportUsesSalaryBonusProcesses,
  resolveDomainReportScope,
} from "./domainReportScope.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import { syncCompanySessionInBackground } from "../../../utils/company/companySessionSwitchCore.js";

const REPORT_PAGE_KEY = "domain";
const REPORT_FETCH_DEBOUNCE_MS = 150;

function resolveReportBootCompanyId() {
  const cached = getCachedOwnerCompanies() || readReportCompaniesCache();
  const url = new URL(window.location.href);
  const queryCompany = url.searchParams.get("company_id");
  return resolveBootCompanyId({
    urlCompanyId: queryCompany,
    defaultRowId: cached?.[0]?.id,
  });
}

export default function DomainReportPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getReportText(lang, key, params), [lang]);
  const r = useMemo(() => REPORT_I18N[lang] || REPORT_I18N.en, [lang]);

  const [companies, setCompanies] = useState(
    () => getCachedOwnerCompanies() || readReportCompaniesCache() || [],
  );

  const [companyId, setCompanyId] = useState(resolveReportBootCompanyId);
  const [selectedGroup, setSelectedGroup] = useState(() => {
    const g = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
    return g ? String(g).trim().toUpperCase() : null;
  });
  const companySessionAbortRef = useRef(null);
  const [processId, setProcessId] = useState("");
  const [metaReady, setMetaReady] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  const [processes, setProcesses] = useState([]);
  const [reportData, setReportData] = useState(null);
  const reportDataRef = useRef(null);
  const [reportSyncing, setReportSyncing] = useState(false);
  const [error, setError] = useState("");

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const { begin: beginReportFetch, invalidate: invalidateReportFetch, isCurrent: isReportFetchCurrent } =
    useReportAbortSeq();
  const { begin: beginMetaFetch, invalidate: invalidateMetaFetch, isCurrent: isMetaFetchCurrent } =
    useReportAbortSeq();
  const pageBootOnceRef = useRef(false);
  const prevCompanyIdRef = useRef(null);
  const prevScopeKeyRef = useRef(null);
  useEffect(() => {
    reportDataRef.current = reportData;
  }, [reportData]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];
    for (const href of links) {
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }

    return () => {
      document.body.classList.remove("report-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!me || companyId != null) return;
    const cached = getCachedOwnerCompanies();
    const url = new URL(window.location.href);
    const queryCompany = url.searchParams.get("company_id");
    const effective = resolveBootCompanyId({
      urlCompanyId: queryCompany,
      sessionCompanyId: me.company_id,
      defaultRowId: cached?.[0]?.id,
    });
    if (isDashboardGroupOnlyMode()) return;
    if (effective != null) setCompanyId(effective);
  }, [me, companyId]);

  useEffect(() => {
    if (!sessionReady || !me) return;
    if (pageBootOnceRef.current) return;
    pageBootOnceRef.current = true;

    const u = me;
    if (!canShowReportInSidebar(u)) {
      navigate(spaPath("dashboard"), { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchOwnerCompaniesAll({ me: u });
        await fetchOwnerGroupsAll(u).catch(() => null);
        if (cancelled) return;
        setCompanies(rows);
        persistReportCompaniesCache(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const persistedGc = readPersistedDashboardGcFilter();
        const savedCompanyId = readDashboardSelectedCompanyId();
        const bootGc = resolveGcFilterBootCompanyId({
          urlCompanyId: queryCompany,
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });
        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
        let bootGroup = groupFilterOptOut
          ? null
          : persistedGc.selectedGroup ||
            bootGc.selectedGroup ||
            resolveInitialSelectedGroupFromSession(rows, null, u);
        const groupOnlyBoot = groupFilterOptOut
          ? false
          : resolveReportGroupOnlyBoot(u, bootGc, persistedGc, bootGroup);
        // A saved company selection always wins over the group-only guess — group-only boot
        // only applies when there is genuinely no company to restore.
        let nextCompanyId = companyId != null ? companyId : bootGc.companyId;
        if (groupFilterOptOut && nextCompanyId == null) {
          const pick = resolveReportCompanyWhenClosingGroup(
            u,
            rows,
            null,
            sortedUniqueGroupIds(rows),
          );
          if (pick?.id != null) nextCompanyId = Number(pick.id);
        }
        if (nextCompanyId == null && savedCompanyId != null && bootGroup) {
          const inGroup = companiesInGroupList(rows, bootGroup).some(
            (c) => Number(c.id) === Number(savedCompanyId),
          );
          if (inGroup) nextCompanyId = savedCompanyId;
        }
        if (nextCompanyId != null) {
          persistDashboardGroupOnlyMode(false);
          if (bootGroup) {
            persistDashboardFilterState(bootGroup, nextCompanyId, { allowGroupOnly: false });
          }
        } else if (groupOnlyBoot) {
          persistDashboardGroupOnlyMode(true);
        }
        const row =
          nextCompanyId != null
            ? rows.find((c) => Number(c.id) === Number(nextCompanyId)) || null
            : null;
        if (!groupFilterOptOut) {
          bootGroup = resolveInitialSelectedGroupFromSession(rows, row, u) || bootGroup;
        }
        setCompanyId((prev) => (prev != null ? prev : nextCompanyId));
        setSelectedGroup(groupFilterOptOut ? null : bootGroup);
        if (nextCompanyId != null) void checkBankOnly(nextCompanyId);
      } catch {
        if (!cancelled) navigate(spaPath("login"), { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate, companyId]);

  useEffect(() => {
    if (!companies.length) return;
    const groupFilterOptOut =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
    if (groupFilterOptOut) {
      setSelectedGroup((prev) => (prev == null ? prev : null));
      return;
    }
    const row =
      companyId != null
        ? companies.find((c) => Number(c.id) === Number(companyId)) || null
        : null;
    setSelectedGroup((prev) => {
      const resolved = resolveInitialSelectedGroupFromSession(companies, row, me);
      if (resolved) return resolved;
      const g = prev ? String(prev).trim().toUpperCase() : "";
      if (g && sortedUniqueGroupIds(companies).includes(g)) return g;
      return prev;
    });
  }, [companies, companyId, me]);

  const checkBankOnly = useCallback(async (compId) => {
    if (!compId) return;
    try {
      const comp = companies.find(c => Number(c.id) === Number(compId));
      const perms = await fetchCompanyPermissions(comp?.company_id || "");
      if (isBankOnlyCategoryCompany(perms)) {
        // Bank-only companies use Bank Process UI, not Games process-list.
        navigate(spaPath("bank-process-list"), { replace: true });
      }
    } catch (err) {
      console.error("Bank only check error:", err);
    }
  }, [companies, navigate]);

  const handleClearCompany = useCallback(
    (groupForScope) => {
      const groupKey = String(groupForScope || selectedGroup || "")
        .trim()
        .toUpperCase();
      persistDashboardFilterState(groupKey || null, null);
      invalidateReportFetch();
      flushSync(() => setCompanyId(null));
      setError("");
      setProcessId("");
      if (reportDataRef.current != null) setReportSyncing(true);
      setMetaReady(false);
    },
    [invalidateReportFetch, selectedGroup],
  );

  const onPrepareCompanySelect = useCallback((c) => {
    const nextId = Number(c?.id);
    if (!nextId) return;
    const fromRow = c?.group_id ? String(c.group_id).trim().toUpperCase() : "";
    const fromSel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
    const groupForPersist = fromRow || fromSel || null;
    persistDashboardFilterState(groupForPersist, nextId, { allowGroupOnly: false });
    persistDashboardGroupOnlyMode(false);
    flushSync(() => {
      if (groupForPersist) setSelectedGroup(groupForPersist);
      setCompanyId(nextId);
    });
    if (reportDataRef.current != null) setReportSyncing(true);
    startTransition(() => {
      setProcessId("");
      setMetaReady(false);
    });
  }, [selectedGroup]);

  const onSwitchCompany = useCallback(
    async (c) => {
      if (!c?.id) return;
      const nextId = Number(c.id);
      const previousCompanyId = companyId;
      void checkBankOnly(nextId);

      companySessionAbortRef.current?.abort();
      const ac = new AbortController();
      companySessionAbortRef.current = ac;

      const ok = await syncCompanySessionInBackground({
        companyId: nextId,
        sessionCompanyId: me?.company_id,
        signal: ac.signal,
        layoutSilent: true,
        onFailure: () => {
          if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
            flushSync(() => setCompanyId(previousCompanyId));
          }
          setReportSyncing(false);
          notify(t("switchFailed"), "danger");
        },
      });
      if (!ok) return;
    },
    [checkBankOnly, companyId, me?.company_id, notify, t],
  );

  const {
    groupIds,
    companiesForPicker: companyButtons,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup,
    handlePickCompany,
    allowClearCompany,
  } = useReportGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onPrepareCompanySelect,
    onSelectCompany: onSwitchCompany,
    onClearCompany: handleClearCompany,
    switchingCompany: false,
    preferredCompanyId: companyId,
  });

  const scopeCompanyId = useMemo(() => {
    if (companyId == null) return null;
    const cid = Number(companyId);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    if (!companyButtons.some((c) => Number(c.id) === cid)) return null;
    return cid;
  }, [companyId, companyButtons]);

  useEffect(() => {
    if (companyId == null) return;
    if (scopeCompanyId != null) return;
    handleClearCompany(selectedGroup);
  }, [companyId, scopeCompanyId, selectedGroup, handleClearCompany]);

  const reportScope = useMemo(
    () =>
      resolveDomainReportScope({
        companies,
        selectedGroup,
        companyId: scopeCompanyId,
        groupsAllMode,
        groupAllMode,
        me,
      }),
    [companies, selectedGroup, scopeCompanyId, groupsAllMode, groupAllMode, me],
  );

  const isGroupScope = domainReportUsesSalaryBonusProcesses(reportScope);

  /**
   * Frontend's group-only pre-check can wrongly allow entering a group ledger the session
   * isn't actually assigned to; when the backend rejects it, fall back to a reportable
   * subsidiary instead of leaving the page stuck in an unusable single-group state.
   * On a cold page load `companies` may still be empty at the moment the request fails
   * (nothing cached yet) — `groupLedgerDenied` remembers to retry once it arrives.
   */
  const [groupLedgerDenied, setGroupLedgerDenied] = useState(false);

  const tryRecoverFromGroupLedgerDenied = useCallback(() => {
    if (companyId != null) return false;
    const pick = resolveReportCompanyWhenClosingGroup(me, companies, companyId, groupIds);
    if (!pick?.id) return false;
    setGroupLedgerDenied(false);
    onPrepareCompanySelect(pick);
    return true;
  }, [companyId, companies, me, groupIds, onPrepareCompanySelect]);

  useEffect(() => {
    if (!groupLedgerDenied || companyId != null || !companies.length) return;
    tryRecoverFromGroupLedgerDenied();
  }, [groupLedgerDenied, companies, companyId, tryRecoverFromGroupLedgerDenied]);

  const reportParams = useMemo(
    () => ({
      processId,
      dateFrom,
      dateTo,
      reportScope,
      showAllCurrencies: true,
      scopeKey: customerReportScopeCacheKey(reportScope),
    }),
    [processId, dateFrom, dateTo, reportScope],
  );

  const loadReport = useCallback(async () => {
    if (!domainReportScopeIsReady(reportScope) || !dateFrom || !dateTo) return;
    const { signal, seq } = beginReportFetch();
    const quietRefresh = reportDataRef.current != null;
    if (quietRefresh) setReportSyncing(true);
    setError("");
    try {
      const data = await fetchDomainReport(reportParams, { signal });
      if (!isReportFetchCurrent(seq)) return;
      if (!quietRefresh && !data?.data?.length) {
        notify(t("noDataAdjustSearch"), "info");
      }
      startTransition(() => {
        setReportData(data);
      });
      setReportSnapshot(REPORT_PAGE_KEY, buildReportSnapshotKey(reportParams), data);
    } catch (err) {
      if (err?.name === "AbortError" || !isReportFetchCurrent(seq)) return;
      if (isGroupLedgerDeniedError(err)) {
        if (tryRecoverFromGroupLedgerDenied()) return;
        setGroupLedgerDenied(true);
      }
      const msg = err.message || t("loadReportFailed");
      setError(msg);
      notify(msg, "error");
      startTransition(() => {
        setReportData(null);
      });
    } finally {
      if (isReportFetchCurrent(seq)) {
        setReportSyncing(false);
      }
    }
  }, [
    reportScope,
    dateFrom,
    dateTo,
    reportParams,
    beginReportFetch,
    isReportFetchCurrent,
    t,
    notify,
    tryRecoverFromGroupLedgerDenied,
  ]);

  useRealtimeDomain(REALTIME_DOMAINS.LEDGER, () => {
    void loadReport();
  }, { enabled: domainReportScopeIsReady(reportScope) && metaReady });

  const loadMetaData = useCallback(async () => {
    if (!domainReportScopeIsReady(reportScope)) return;
    const { signal, seq } = beginMetaFetch();
    try {
      const procsRaw = await fetchProcesses(reportScope, { signal });
      if (!isMetaFetchCurrent(seq)) return;
      const procs = isGroupScope ? mapDomainGroupProcesses(procsRaw) : procsRaw;
      setProcesses(procs);
      if (isGroupScope && !isDomainGroupProcessSelection(processId, procs)) {
        setProcessId("");
      }
    } catch (err) {
      if (err?.name === "AbortError" || !isMetaFetchCurrent(seq)) return;
      console.error("Meta data load error:", err);
    } finally {
      if (isMetaFetchCurrent(seq)) {
        setMetaReady(true);
      }
    }
  }, [reportScope, isGroupScope, processId, beginMetaFetch, isMetaFetchCurrent]);

  useEffect(() => {
    if (!companyId) return;
    const prev = prevCompanyIdRef.current;
    if (prev != null && Number(prev) !== Number(companyId)) {
      invalidateReportFetch();
      setReportSyncing(false);
      setMetaReady(false);
      setProcessId("");
      if (reportDataRef.current != null) setReportSyncing(true);
    }
    prevCompanyIdRef.current = companyId;
  }, [companyId, invalidateReportFetch]);

  useEffect(() => {
    if (!metaReady) {
      invalidateReportFetch();
      setReportSyncing(false);
    }
  }, [metaReady, invalidateReportFetch]);

  useEffect(() => {
    if (!domainReportScopeIsReady(reportScope)) {
      setMetaReady(false);
      return;
    }
    setMetaReady(false);
    loadMetaData();
  }, [reportScope, loadMetaData]);

  useEffect(() => {
    const scopeKey = customerReportScopeCacheKey(reportScope);
    const prev = prevScopeKeyRef.current;
    if (prev != null && prev !== scopeKey) {
      invalidateReportFetch();
      setError("");
      setProcessId("");
    }
    prevScopeKeyRef.current = scopeKey || null;
  }, [reportScope, invalidateReportFetch]);

  useEffect(() => {
    if (!domainReportScopeIsReady(reportScope) || !metaReady) return undefined;
    const handler = window.setTimeout(() => {
      loadReport();
    }, REPORT_FETCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handler);
      invalidateReportFetch();
    };
  }, [reportScope, metaReady, loadReport, invalidateReportFetch]);

  useEffect(() => {
    if (!domainReportScopeIsReady(reportScope) || !metaReady) return;
    const key = buildReportSnapshotKey(reportParams);
    const snap = getReportSnapshot(REPORT_PAGE_KEY);
    if (snap?.key === key && snap.data && reportDataRef.current == null) {
      reportDataRef.current = snap.data;
      startTransition(() => {
        setReportData(snap.data);
      });
    }
  }, [reportScope, metaReady, reportParams]);

  return (
    <div className="container">
      <div className="content">
        <DomainReportFilters
          companyId={scopeCompanyId}
          highlightCompanyId={scopeCompanyId}
          onSwitchCompany={handlePickCompany}
          onClearCompany={handleClearCompany}
          allowClearCompany={allowClearCompany}
          groupIds={groupIds}
          selectedGroup={selectedGroup}
          onPickGroup={handlePickGroup}
          onPickAllGroups={handlePickAllGroups}
          onPickAllInGroup={handlePickAllInGroup}
          groupsAllMode={groupsAllMode}
          groupAllMode={groupAllMode}
          companyButtons={companyButtons}
          processId={processId}
          setProcessId={setProcessId}
          processes={processes}
          isGroupScope={isGroupScope}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
          t={t}
          monthLabels={r.monthsShort}
          weekdaysShort={r.weekdaysShort}
        />

        <div className="domain-report-table-region">
          {reportSyncing && reportData != null && (
            <div className="domain-report-sync-track" aria-hidden>
              <div className="domain-report-sync-bar" />
            </div>
          )}
          <DomainReportTable
            reportData={reportData}
            reportSyncing={reportSyncing}
            error={error}
            isGroupScope={isGroupScope}
            t={t}
          />
        </div>
      </div>

      {toast && (
        <div id="domainReportNotificationContainer" className="maintenance-notification-container">
          <div className={`maintenance-notification maintenance-notification-${reportToastMaintenanceVariant(toast.type)} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
