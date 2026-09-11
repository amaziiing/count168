import { useEffect, useRef } from "react";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import "../../../../public/css/date-range-picker.css";

export function useTransactionDateRange({
  loading,
  forbidden,
  filterSnapshot,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  todayDmy,
  txDate,
  setTxDate,
  rateDate,
  setRateDate,
}) {
  const txDateRangePickerReadyRef = useRef(false);

  /** Hidden #date_from/#date_to must stay in sync for MaintenanceDateRangePicker (writes DOM directly). */
  useEffect(() => {
    const df = document.getElementById("date_from");
    const dt = document.getElementById("date_to");
    if (!df || !dt) return;
    const f = dateFrom || todayDmy;
    const t = dateTo || todayDmy;
    if (df.value !== f) df.value = f;
    if (dt.value !== t) dt.value = t;
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: "date_from",
      dateToId: "date_to",
      displayId: "date-range-display",
    });
  }, [dateFrom, dateTo, todayDmy]);

  /** Load shared date-range-picker (same as transaction.php) + init Capture Date popup. */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;

    let cancelled = false;
    let observer = null;

    const tryInit = () => {
      if (cancelled || txDateRangePickerReadyRef.current) return true;
      ensureMaintenanceDateRangePicker();
      if (!window.MaintenanceDateRangePicker?.init) return false;
      if (!document.getElementById("calendar-popup")) return false;
      // TransactionSearchSection (the trigger pill + its display span) is held back
      // behind `surfaceReady` (waits for GC package data) and mounts later than
      // #calendar-popup, which renders unconditionally — without this check, init()
      // can fire while the trigger doesn't exist yet, silently binding nothing and
      // leaving the display text blank with no later retry (surfaceReady flipping
      // true doesn't re-run this effect).
      if (!document.getElementById("date-range-picker")) return false;

      window.MaintenanceDateRangePicker.init({
        onChange: () => {
          const b = window.MaintenanceDateRangePicker.getActiveRangeBinding?.() || {};
          const fid = b.dateFromId;
          if (fid === "add_tx_date_from") {
            const from = document.getElementById("add_tx_date_from")?.value?.trim() || "";
            setTxDate(from || todayDmy);
          } else if (fid === "rate_tx_date_from") {
            const from = document.getElementById("rate_tx_date_from")?.value?.trim() || "";
            setRateDate(from || todayDmy);
          } else {
            const from = document.getElementById("date_from")?.value || "";
            const to = document.getElementById("date_to")?.value || "";
            setDateFrom(from);
            setDateTo(to);
          }
          /* 搜索由 useTransactionSearch 在 dateFrom/dateTo 写入 state 后的 effect 触发，避免 queueMicrotask 读到旧 effectiveDate */
        },
      });
      window.MaintenanceDateRangePicker.refreshInputsDisplay?.({
        dateFromId: "date_from",
        dateToId: "date_to",
        displayId: "date-range-display",
      });
      txDateRangePickerReadyRef.current = true;
      return true;
    };

    if (!tryInit()) {
      /* #calendar-popup / #date-range-picker can lose the mount race right after login
       * → first SPA route into this page: AuthenticatedLayout/AnimatedOutlet may still be
       * resolving, and TransactionSearchSection additionally waits on `surfaceReady`
       * (no sticky sessionStorage currency-rows cache from a prior visit ⇒ slower GC
       * package load). Unlike a hard refresh, which always commits the whole page in one
       * go, these can genuinely not exist yet. Watch the DOM and retry once everything
       * needed is there, instead of giving up silently (was: permanently broken/blank
       * Capture Date until a manual page reload). */
      observer = new MutationObserver(() => {
        if (tryInit() && observer) {
          observer.disconnect();
          observer = null;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      txDateRangePickerReadyRef.current = false;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }, [loading, forbidden, filterSnapshot?.companyId, setDateFrom, setDateTo, setTxDate, setRateDate, todayDmy]);

  /** Keep add-form hidden range + label in sync with txDate */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    ensureMaintenanceDateRangePicker();
    const f = document.getElementById("add_tx_date_from");
    const t = document.getElementById("add_tx_date_to");
    if (!f || !t) return;
    const td = (txDate || todayDmy).trim();
    if (f.value !== td) f.value = td;
    if (t.value !== td) t.value = td;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: "add_tx_date_from",
      dateToId: "add_tx_date_to",
      displayId: "add-tx-date-range-display",
    });
  }, [txDate, todayDmy, loading, forbidden, filterSnapshot?.companyId]);

  /** RATE: same UX — MaintenanceDateRangePicker; submit uses range start via existing rateDate */
  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    ensureMaintenanceDateRangePicker();
    const f = document.getElementById("rate_tx_date_from");
    const t = document.getElementById("rate_tx_date_to");
    if (!f || !t) return;
    const rd = (rateDate || todayDmy).trim();
    if (f.value !== rd) f.value = rd;
    if (t.value !== rd) t.value = rd;
    window.MaintenanceDateRangePicker?.refreshInputsDisplay?.({
      dateFromId: "rate_tx_date_from",
      dateToId: "rate_tx_date_to",
      displayId: "rate-tx-date-range-display",
    });
  }, [rateDate, todayDmy, loading, forbidden, filterSnapshot?.companyId]);
}
