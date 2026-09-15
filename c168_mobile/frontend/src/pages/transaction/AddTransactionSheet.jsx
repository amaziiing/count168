import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayLock } from "../../hooks/useOverlayLock.js";
import MoneyDecimal from "../../lib/money/moneyDecimal.js";
import {
  buildClientRequestId,
  countRateDecimalPlaces,
  formatDmy,
  formatRateAmount,
  formatAmountForStore,
  parseRateExpression,
  RATE_STORE_MAX_DECIMALS,
  TX_STORE_MAX_DECIMALS,
} from "../../lib/transactionFormat.js";
import {
  buildRatePayload,
  toNumberLike,
  computeRateMiddlemanProfit,
  parseMiddlemanRateInput,
  parsePositiveAmt,
} from "../../lib/transactionSubmitHelpers.js";
import { formatYmd, parseYmd, formatDisplayDate } from "../../lib/dashboardDateUtils.js";
import "./add-transaction-sheet.css";

const TX_TYPES = ["CONTRA", "PAYMENT", "CLAIM", "PROFIT", "RATE", "ADJUSTMENT", "CLEAR"];

function sanitizeAmountInput(value) {
  const raw = String(value ?? "").replace(/,/g, "");
  if (raw === "") return "";
  const filtered = raw.replace(/[^\d.-]/g, "");
  if (filtered === "") return "";
  const hasLeadingMinus = filtered.startsWith("-");
  let unsigned = filtered.replace(/-/g, "");
  const firstDotIdx = unsigned.indexOf(".");
  if (firstDotIdx !== -1) {
    unsigned = `${unsigned.slice(0, firstDotIdx + 1)}${unsigned.slice(firstDotIdx + 1).replace(/\./g, "")}`;
  }
  return hasLeadingMinus ? `-${unsigned}` : unsigned;
}

/** Desktop Fee: digits only, no minus. */
function sanitizePositiveAmountInput(value) {
  return sanitizeAmountInput(value).replace(/-/g, "");
}

/** Desktop PT-Fee: always show leading minus while typing (absolute subtract). */
function sanitizePlatformFeeInput(value) {
  const digits = sanitizePositiveAmountInput(value);
  return digits ? `-${digits}` : "";
}

/**
 * iOS-safe date control: visible formatted row stays fixed height;
 * native picker is an opacity-0 overlay (avoids type=date blowing the sheet).
 */
function DateTapRow({ label, value, onChange, disabled, badge }) {
  return (
    <label
      className={`m-tx-date-row${disabled ? " m-tx-date-row--disabled" : ""}`}
    >
      <span className="m-tx-date-icon">
        <i className="far fa-calendar" aria-hidden="true" />
      </span>
      <span className="m-tx-date-main">
        <span className="m-tx-date-label">{label}</span>
        <span className="m-tx-date-value-row">
          <span className="m-tx-date-value">{value ? formatDisplayDate(value) : "—"}</span>
          {badge ? <span className="m-tx-date-badge">{badge}</span> : null}
        </span>
      </span>
      <i className="fas fa-chevron-right m-tx-date-chevron" aria-hidden="true" />
      <input
        type="date"
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="m-tx-date-input"
        aria-label={label}
      />
    </label>
  );
}

/**
 * Account field with a searchable list. A native `<select>` cannot filter, and the
 * account list runs long, so tapping the field opens a search + list panel over the
 * sheet (positioned against `.m-add-tx-panel`).
 */
function AccountPicker({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  searchPlaceholder,
  noMatchText,
  closeLabel,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  const rows = useMemo(() => (Array.isArray(options) ? options : []), [options]);
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((o) => {
      const text = String(o.display_text || "").toUpperCase();
      const code = String(o.account_id || "").toUpperCase();
      return text.includes(q) || code.includes(q);
    });
  }, [rows, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Escape closes only this panel; the sheet's own Escape handler must not fire with it.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  const pick = (opt) => {
    onChange(opt);
    close();
  };

  const selectedId = value?.id != null && value.id !== "" ? String(value.id) : "";

  return (
    <div className="m-tx-account-field">
      {label ? <label className="m-tx-form-label">{label}</label> : null}
      <button
        type="button"
        className="m-tx-form-select m-tx-account-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label || placeholder}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
      >
        <span className="m-tx-account-trigger-text">
          {value?.display_text || value?.account_id || placeholder}
        </span>
        <i className="fas fa-chevron-down m-tx-account-trigger-caret" aria-hidden="true" />
      </button>

      {open ? (
        <div className="m-tx-account-picker" role="dialog" aria-modal="true" aria-label={label || placeholder}>
          <div className="m-tx-account-picker-head">
            <span className="m-tx-account-picker-title">{label || placeholder}</span>
            <button
              type="button"
              className="m-tx-account-picker-close tap-scale"
              aria-label={closeLabel}
              onClick={close}
            >
              <i className="fas fa-times" aria-hidden="true" />
            </button>
          </div>

          <label className="m-tx-account-picker-search">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>

          <div className="m-tx-account-picker-list">
            {query.trim() ? null : (
              <button
                type="button"
                className={`m-tx-account-picker-item${selectedId ? "" : " is-selected"}`}
                onClick={() => pick(null)}
              >
                <span className="m-tx-account-picker-text">{placeholder}</span>
                {selectedId ? null : (
                  <i className="fas fa-check m-tx-account-picker-tick" aria-hidden="true" />
                )}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="m-tx-account-picker-empty">{noMatchText}</p>
            ) : (
              filtered.map((o) => {
                const isSelected = selectedId !== "" && String(o.id) === selectedId;
                return (
                  <button
                    type="button"
                    key={String(o.id)}
                    className={`m-tx-account-picker-item${isSelected ? " is-selected" : ""}`}
                    aria-pressed={isSelected}
                    onClick={() => pick(o)}
                  >
                    <span className="m-tx-account-picker-text">{o.display_text || o.account_id}</span>
                    {isSelected ? (
                      <i className="fas fa-check m-tx-account-picker-tick" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AddTransactionSheet({
  open,
  onClose,
  m,
  accountOptions = [],
  currencyOptions = [],
  mutationsBlocked = false,
  onSubmit,
  pushToast,
  onTypeSearch,
  typeSearchActive = false,
  onExitTypeSearch,
  prefill = null,
  onPrefillConsumed,
  entryIntent = "add",
}) {
  const bodyRef = useRef(null);
  const typeBlockRef = useRef(null);
  useOverlayLock(open, onClose);

  const [txType, setTxType] = useState("PAYMENT");
  const [txDateYmd, setTxDateYmd] = useState(formatYmd(new Date()));
  const [txToAccount, setTxToAccount] = useState(null);
  const [txFromAccount, setTxFromAccount] = useState(null);
  const [txCurrency, setTxCurrency] = useState("");
  const [txAmount, setTxAmount] = useState("");
  /** Desktop `txFullAmount` — full precision from balance_full when prefilled. */
  const [txFullAmount, setTxFullAmount] = useState("");
  const [txRemark, setTxRemark] = useState("");
  const [txConfirm, setTxConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [rateToAccount, setRateToAccount] = useState(null);
  const [rateFromAccount, setRateFromAccount] = useState(null);
  const [rateCurrencyFrom, setRateCurrencyFrom] = useState("");
  const [rateCurrencyTo, setRateCurrencyTo] = useState("");
  const [rateCurrencyFromAmount, setRateCurrencyFromAmount] = useState("");
  /** Desktop `rateFullAmount` — full precision from balance_full when prefilled. */
  const [rateFullAmount, setRateFullAmount] = useState("");
  const [rateExchangeRateRaw, setRateExchangeRateRaw] = useState("");
  const [rateCurrencyToAmount, setRateCurrencyToAmount] = useState("");
  const [rateToAmountGrossStr, setRateToAmountGrossStr] = useState("");
  /** Paired with desktop `rateFromAmountGrossStr` for primary Reverse. */
  const [rateFromAmountGrossStr, setRateFromAmountGrossStr] = useState("");
  const [rateMiddlemanAccount, setRateMiddlemanAccount] = useState(null);
  const [rateMiddlemanRate, setRateMiddlemanRate] = useState("");
  const [rateMiddlemanAmount, setRateMiddlemanAmount] = useState("");
  const [rateMiddlemanInputAmount, setRateMiddlemanInputAmount] = useState("");
  const [rateMiddlemanPlatformFee, setRateMiddlemanPlatformFee] = useState("");
  const [rateTransferToAccount, setRateTransferToAccount] = useState(null);
  const [rateTransferFromAccount, setRateTransferFromAccount] = useState(null);

  const todayDmy = useMemo(() => formatDmy(new Date()), []);
  const txDate = useMemo(() => formatDmy(parseYmd(txDateYmd)), [txDateYmd]);
  const rateDate = txDate;

  const needsFromTo = ["CONTRA", "PAYMENT", "CLAIM", "PROFIT", "CLEAR"].includes(txType);
  const isRate = txType === "RATE";
  const isAdjustment = txType === "ADJUSTMENT";

  const pickerLabels = {
    searchPlaceholder: m.searchAccount,
    noMatchText: m.noAccountMatch,
    closeLabel: m.close,
  };
  /** Owner preference: MYR leads whenever the company offers it (same rule as Add Account). */
  const myrAvailable = currencyOptions.includes("MYR");

  const resetForm = useCallback(() => {
    setTxType("PAYMENT");
    setTxDateYmd(formatYmd(new Date()));
    setTxToAccount(null);
    setTxFromAccount(null);
    setTxCurrency("");
    setTxAmount("");
    setTxFullAmount("");
    setTxRemark("");
    setTxConfirm(false);
    setRateToAccount(null);
    setRateFromAccount(null);
    setRateCurrencyFrom("");
    setRateCurrencyTo("");
    setRateCurrencyFromAmount("");
    setRateFullAmount("");
    setRateExchangeRateRaw("");
    setRateCurrencyToAmount("");
    setRateToAmountGrossStr("");
    setRateFromAmountGrossStr("");
    setRateMiddlemanAccount(null);
    setRateMiddlemanRate("");
    setRateMiddlemanAmount("");
    setRateMiddlemanInputAmount("");
    setRateMiddlemanPlatformFee("");
    setRateTransferToAccount(null);
    setRateTransferFromAccount(null);
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open || entryIntent !== "search") return;
    const t = window.setTimeout(() => {
      typeBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, entryIntent]);

  useEffect(() => {
    if (!open || !prefill) return;

    const account = prefill.account || null;
    const amount = prefill.amount != null ? String(prefill.amount) : "";
    const currency = prefill.currency ? String(prefill.currency).toUpperCase() : "";
    const side = prefill.side === "right" ? "right" : "left";
    const fillTo = side === "right";

    const amountFull =
      prefill.amountFull != null && String(prefill.amountFull).trim() !== ""
        ? String(prefill.amountFull).replace(/,/g, "").trim()
        : "";

    if (txType === "RATE") {
      if (fillTo) {
        setRateToAccount(account);
        setRateTransferFromAccount(account);
      } else {
        setRateFromAccount(account);
        setRateTransferToAccount(account);
      }
      if (amount) setRateCurrencyFromAmount(amount);
      setRateFullAmount(amountFull);
      if (currency) setRateCurrencyFrom(currency);
    } else {
      if (fillTo) setTxToAccount(account);
      else setTxFromAccount(account);
      if (amount) setTxAmount(amount);
      setTxFullAmount(amountFull);
      if (currency) setTxCurrency(currency);
    }

    const label = fillTo ? m.toAccount : m.fromAccount;
    const parts = [];
    if (account?.account_id) parts.push(`${label}: ${account.account_id}`);
    if (amount) parts.push(`${m.amount}: ${amount}`);
    if (currency) parts.push(`${m.currency}: ${currency}`);
    if (parts.length) pushToast?.(parts.join(", "), "success");

    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per prefill payload
  }, [open, prefill]);

  useEffect(() => {
    if (!open || !myrAvailable) return;
    // Functional form: a prefill/selection queued in the same commit still wins.
    setTxCurrency((prev) => prev || "MYR");
    if (!isRate) return;
    setRateCurrencyFrom((prev) => prev || "MYR");
    setRateCurrencyTo((prev) => prev || "MYR");
  }, [open, isRate, myrAvailable]);

  useEffect(() => {
    if (!isRate) return;
    const clean = (v) => String(v ?? "").replace(/,/g, "").trim();
    const parsed = parseRateExpression(rateExchangeRateRaw);
    let rateDec = MoneyDecimal.toDecimal("0", 0);
    if (parsed.valid) {
      try {
        rateDec = MoneyDecimal.toDecimal(parsed.value, 0);
      } catch {
        /* ignore */
      }
    }

    // Desktop parity: MM profit = Rate-Mul commission + (Fee − PT); Fee/PT face values ≥ 0.
    const finalFeeDec = computeRateMiddlemanProfit({
      fromAmount: rateCurrencyFromAmount,
      middlemanRate: rateMiddlemanRate,
      feeAmount: rateMiddlemanInputAmount,
      platformFeeAmount: rateMiddlemanPlatformFee,
      exchangeRateRaw: rateExchangeRateRaw,
    });
    let middleStr = "";
    if (!finalFeeDec.isZero()) middleStr = formatRateAmount(finalFeeDec.toString());
    else if (
      finalFeeDec.isZero() &&
      (clean(rateMiddlemanRate) || clean(rateMiddlemanInputAmount) || clean(rateMiddlemanPlatformFee))
    ) {
      middleStr = "0.00";
    }
    setRateMiddlemanAmount(middleStr);

    // Desktop: customer preview = gross − Service Fee only (Rate-Mul / PT do not change form amount).
    const toAmountDeductionDec = parsePositiveAmt(rateMiddlemanInputAmount);

    try {
      const fromDec = MoneyDecimal.toDecimal(clean(rateCurrencyFromAmount) || "0", 0);
      if (!parsed.valid || !fromDec.gt(0) || !rateDec.gt(0)) {
        setRateCurrencyToAmount("");
        setRateToAmountGrossStr("");
        return;
      }
      const baseGross = fromDec.times(rateDec);
      setRateToAmountGrossStr(formatRateAmount(baseGross.toString()));
      let displayVal = baseGross;
      if (!toAmountDeductionDec.isZero()) displayVal = displayVal.minus(toAmountDeductionDec);
      setRateCurrencyToAmount(formatRateAmount(displayVal.toString()));
    } catch {
      setRateCurrencyToAmount("");
      setRateToAmountGrossStr("");
    }
  }, [
    isRate,
    rateCurrencyFromAmount,
    rateExchangeRateRaw,
    rateMiddlemanRate,
    rateMiddlemanInputAmount,
    rateMiddlemanPlatformFee,
  ]);

  const handleSubmit = async () => {
    if (!txConfirm || submitting || mutationsBlocked) return;

    if (isRate) {
      const toId = rateToAccount?.id ? String(rateToAccount.id) : "";
      const fromId = rateFromAccount?.id ? String(rateFromAccount.id) : "";
      if (!toId) return pushToast(m.pleaseSelectToAccount, "error");
      if (!fromId) return pushToast(m.rateTransactionNeedFromAccount, "error");
      if (!rateCurrencyFrom || !rateCurrencyTo) return pushToast(m.pleaseSelectBothCurrencies, "error");
      const fromAmt = toNumberLike(rateCurrencyFromAmount);
      const toGrossRaw = String(rateToAmountGrossStr || "").trim().replace(/,/g, "");
      const toGrossStr = toGrossRaw !== "" ? toGrossRaw : String(rateCurrencyToAmount || "").trim().replace(/,/g, "");
      const grossNum = toNumberLike(toGrossStr);
      if (!Number.isFinite(fromAmt) || fromAmt <= 0 || !Number.isFinite(grossNum) || grossNum <= 0) {
        return pushToast(m.pleaseEnterValidCurrencyAmounts, "error");
      }
      const parsedRate = parseRateExpression(rateExchangeRateRaw);
      if (!parsedRate.valid) return pushToast(m.pleaseEnterValidRateValue, "error");
      if (!rateDate) return pushToast(m.pleaseSelectTransactionDate, "error");
      const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";
      const mmrNorm = String(rateMiddlemanRate ?? "").replace(/,/g, "").trim();
      const mmFeeNorm = String(rateMiddlemanInputAmount ?? "").replace(/,/g, "").trim();
      const mmPlatNorm = String(rateMiddlemanPlatformFee ?? "").replace(/,/g, "").trim();
      const hasMiddleRate = mmrNorm !== "";
      const hasMiddleFee = mmFeeNorm !== "";
      const hasMiddlePlatFee = mmPlatNorm !== "";
      const hasAnyMiddleParam = hasMiddleRate || hasMiddleFee || hasMiddlePlatFee;
      if (hasAnyMiddleParam && !middleId) {
        return pushToast(m.pleaseSelectMiddleManAccount, "error");
      }
      if (middleId && !hasAnyMiddleParam) {
        return pushToast(m.pleaseEnterMiddleManRateOrFee, "error");
      }
      if (hasMiddleRate && !parseMiddlemanRateInput(mmrNorm).valid) {
        return pushToast(m.pleaseEnterMiddleManRate, "error");
      }
      const finalRateAmount = rateFullAmount || rateCurrencyFromAmount;
      if (countRateDecimalPlaces(String(finalRateAmount ?? "").replace(/,/g, "").trim()) > RATE_STORE_MAX_DECIMALS) {
        return pushToast(m.rateAmountMaxDecimals, "error");
      }

      setSubmitting(true);
      try {
        const { payload } = buildRatePayload({
          toId,
          fromId,
          fromAmt: finalRateAmount,
          toGrossStr,
          rateDate,
          txRemark,
          rateCurrencyFrom,
          rateCurrencyTo,
          parsedRateNormalizedStr: parsedRate.value,
          rateMiddlemanRate,
          rateMiddlemanAmount,
          rateMiddlemanAccount,
          rateExchangeRateRaw,
          rateFromAccount,
          rateToAccount,
          rateTransferToAccount,
          rateTransferFromAccount,
          rateMiddlemanInputAmount,
          rateMiddlemanPlatformFee,
        });
        const res = await onSubmit(payload, buildClientRequestId());
        if (res?.success) onClose?.();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const toId = txToAccount?.id ? String(txToAccount.id) : "";
    const fromId = txFromAccount?.id ? String(txFromAccount.id) : "";
    if (!toId) return pushToast(m.pleaseSelectToAccount, "error");
    if (txType === "PROFIT") {
      if (!fromId) return pushToast(m.profitPleaseSelectFromAccount, "error");
      if (toId === fromId) return pushToast(m.profitSameAccountError, "error");
    }
    if (needsFromTo && (!fromId || fromId === toId)) {
      return pushToast(m.paymentContraEtcNeedFromAccount, "error");
    }
    if (!txDate) return pushToast(m.pleaseSelectTransactionDate, "error");

    const finalAmount = txFullAmount || txAmount;
    const cleanedAmt = MoneyDecimal.cleanMoneyInput(finalAmount);
    if (cleanedAmt === "") {
      return pushToast(isAdjustment ? m.pleaseEnterNonZeroAdjustment : m.pleaseEnterValidAmount, "error");
    }
    let amtDec;
    try {
      amtDec = MoneyDecimal.toDecimal(cleanedAmt);
    } catch {
      return pushToast(m.pleaseEnterValidAmount, "error");
    }
    const isProfitTx = txType === "PROFIT";
    if (isAdjustment && amtDec.isZero()) return pushToast(m.pleaseEnterNonZeroAdjustment, "error");
    if (isProfitTx && amtDec.isZero()) return pushToast(m.profitEnterNonZeroAmount, "error");
    if (!isAdjustment && !isProfitTx && amtDec.lt(0)) {
      return pushToast(m.pleaseEnterValidAmountGteZero, "error");
    }
    if (countRateDecimalPlaces(cleanedAmt) > TX_STORE_MAX_DECIMALS) {
      return pushToast(m.amountMaxDecimals, "error");
    }
    if (!txCurrency) return pushToast(m.pleaseSelectCurrency, "error");

    setSubmitting(true);
    try {
      const storeAmt = formatAmountForStore(
        isProfitTx ? amtDec.abs().toString() : cleanedAmt,
        TX_STORE_MAX_DECIMALS,
      );
      const payload = {
        transaction_type: isProfitTx ? (amtDec.lt(0) ? "LOSE" : "WIN") : txType,
        account_id: toId,
        from_account_id: isAdjustment ? "" : fromId || "",
        amount: storeAmt,
        transaction_date: txDate,
        description: "",
        sms: String(txRemark || "").toUpperCase(),
        currency: txCurrency,
      };
      const res = await onSubmit(payload, buildClientRequestId());
      if (res?.success) onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const isSearchMode = entryIntent === "search";
  const sheetTitle = isSearchMode
    ? m.searchTypeTitle || m.fabSearchPayment || m.search
    : m.addTransaction;

  return (
    <div className="m-add-tx-host">
      <button type="button" className="m-add-tx-backdrop" aria-label={m.close} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={sheetTitle} className="m-add-tx-panel">
        <div className="m-add-tx-header">
          <p className="m-add-tx-title">{sheetTitle}</p>
          <button type="button" onClick={onClose} className="m-add-tx-close tap-scale">
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div ref={bodyRef} className="m-add-tx-body">
          <div ref={typeBlockRef}>
            <label className="m-tx-form-label">{m.type}</label>
            <select
              value={txType}
              disabled={mutationsBlocked && !isSearchMode}
              onChange={(e) => {
                setTxType(e.target.value);
              }}
              className="m-tx-form-select m-tx-form-select--bold"
              style={{ marginTop: "0.375rem" }}
            >
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="m-tx-form-actions">
              {isSearchMode ? null : (
                <button
                  type="button"
                  disabled={!txType}
                  onClick={() => onTypeSearch?.(txType)}
                  className="m-tx-form-btn m-tx-form-btn--outline tap-scale"
                >
                  {m.search}
                </button>
              )}
              {typeSearchActive ? (
                <button
                  type="button"
                  onClick={() => onExitTypeSearch?.()}
                  className="m-tx-form-btn m-tx-form-btn--warn tap-scale"
                  title={m.exitTypeSearchAndRefreshTitle}
                >
                  {m.exitTypeSearchAndRefresh}
                </button>
              ) : null}
            </div>
            {isSearchMode ? (
              <p className="m-tx-form-hint">
                {m.fabSearchHint ||
                  "Pick a transaction type, then Search to filter accounts by that type."}
              </p>
            ) : null}
          </div>

          {isSearchMode ? null : (
            <>
          <DateTapRow
            label={isRate ? m.date || m.rateTransactionDate : m.transactionDate}
            value={txDateYmd}
            disabled={mutationsBlocked}
            onChange={setTxDateYmd}
            badge={todayDmy === txDate ? m.today : null}
          />

          {!isRate && (
            <>
              <AccountPicker
                label={m.toAccount}
                placeholder={m.selectToAccount}
                options={accountOptions}
                value={txToAccount}
                onChange={setTxToAccount}
                disabled={mutationsBlocked}
                {...pickerLabels}
              />
              {needsFromTo && (
                <AccountPicker
                  label={m.fromAccount}
                  placeholder={m.selectFromAccount}
                  options={accountOptions}
                  value={txFromAccount}
                  onChange={setTxFromAccount}
                  disabled={mutationsBlocked}
                  {...pickerLabels}
                />
              )}
              <div className="m-tx-form-field">
                <label className="m-tx-form-label">{m.currency}</label>
                <select
                  value={txCurrency}
                  disabled={mutationsBlocked}
                  onChange={(e) => setTxCurrency(e.target.value)}
                  className="m-tx-form-select"
                >
                  <option value="">{m.selectCurrency}</option>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="m-tx-form-field">
                <label className="m-tx-form-label">{m.amount}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={txAmount}
                  disabled={mutationsBlocked}
                  onChange={(e) => {
                    setTxFullAmount("");
                    setTxAmount(sanitizeAmountInput(e.target.value));
                  }}
                  className="m-tx-form-input"
                />
              </div>
            </>
          )}

          {isRate ? (
            <>
              <div className="m-tx-form-section">
                <p className="m-tx-form-label">{m.account}</p>
                <AccountPicker
                  label=""
                  placeholder={m.selectToAccount}
                  options={accountOptions}
                  value={rateToAccount}
                  onChange={setRateToAccount}
                  disabled={mutationsBlocked}
                  {...pickerLabels}
                />
                <AccountPicker
                  label=""
                  placeholder={m.selectFromAccount}
                  options={accountOptions}
                  value={rateFromAccount}
                  onChange={setRateFromAccount}
                  disabled={mutationsBlocked}
                  {...pickerLabels}
                />
                <button
                  type="button"
                  disabled={mutationsBlocked}
                  title={m.reverseAccounts}
                  aria-label={m.reverseAccounts}
                  onClick={() => {
                    setRateToAccount(rateFromAccount);
                    setRateFromAccount(rateToAccount);
                    const tmpAmt = rateCurrencyFromAmount;
                    setRateCurrencyFromAmount(rateCurrencyToAmount);
                    setRateCurrencyToAmount(tmpAmt);
                    const tmpGrossTo = rateToAmountGrossStr;
                    setRateToAmountGrossStr(rateFromAmountGrossStr);
                    setRateFromAmountGrossStr(tmpGrossTo);
                  }}
                  className="m-tx-form-btn m-tx-form-btn--outline tap-scale"
                >
                  {m.reverse}
                </button>
              </div>

              <div className="m-tx-form-section">
                <p className="m-tx-form-label">{m.currency}</p>
                <div className="m-tx-form-grid-2">
                  <select
                    value={rateCurrencyFrom}
                    disabled={mutationsBlocked}
                    onChange={(e) => setRateCurrencyFrom(e.target.value)}
                    className="m-tx-form-select"
                    aria-label={m.from}
                  >
                    <option value="">{m.selectCurrency}</option>
                    {currencyOptions.map((c) => (
                      <option key={`rf-${c}`} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateCurrencyFromAmount}
                    disabled={mutationsBlocked}
                    onChange={(e) => {
                      setRateFullAmount("");
                      setRateCurrencyFromAmount(sanitizeAmountInput(e.target.value));
                    }}
                    placeholder={m.amount}
                    className="m-tx-form-input"
                    aria-label={m.fromAccount}
                  />
                </div>
                {/* text keyboard so `/3.15` division rates work; amount preview follows desktop */}
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={rateExchangeRateRaw}
                  disabled={mutationsBlocked}
                  onChange={(e) => setRateExchangeRateRaw(e.target.value)}
                  placeholder={m.rate}
                  className="m-tx-form-input m-tx-rate-rate-input"
                  aria-label={m.rate}
                />
                <div className="m-tx-form-grid-2">
                  <select
                    value={rateCurrencyTo}
                    disabled={mutationsBlocked}
                    onChange={(e) => setRateCurrencyTo(e.target.value)}
                    className="m-tx-form-select"
                    aria-label={m.to}
                  >
                    <option value="">{m.selectCurrency}</option>
                    {currencyOptions.map((c) => (
                      <option key={`rt-${c}`} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateCurrencyToAmount}
                    readOnly
                    disabled={mutationsBlocked}
                    placeholder={m.amount}
                    className="m-tx-form-input m-tx-form-input--readonly m-tx-rate-amount-display"
                    aria-label={m.toAccount}
                  />
                </div>
              </div>

              <div className="m-tx-form-section">
                <p className="m-tx-form-label">{m.account}</p>
                <AccountPicker
                  label=""
                  placeholder={m.selectToAccount}
                  options={accountOptions}
                  value={rateTransferToAccount}
                  onChange={setRateTransferToAccount}
                  disabled={mutationsBlocked}
                  {...pickerLabels}
                />
                <AccountPicker
                  label=""
                  placeholder={m.selectFromAccount}
                  options={accountOptions}
                  value={rateTransferFromAccount}
                  onChange={setRateTransferFromAccount}
                  disabled={mutationsBlocked}
                  {...pickerLabels}
                />
                <button
                  type="button"
                  disabled={mutationsBlocked}
                  title={m.reverseAccounts}
                  aria-label={m.reverseAccounts}
                  onClick={() => {
                    setRateTransferToAccount(rateTransferFromAccount);
                    setRateTransferFromAccount(rateTransferToAccount);
                  }}
                  className="m-tx-form-btn m-tx-form-btn--outline tap-scale"
                >
                  {m.reverse}
                </button>
              </div>

              <div className="m-tx-form-section">
                <p className="m-tx-form-label">{m.middleMan}</p>
                <AccountPicker
                  label=""
                  placeholder={m.selectMiddleManAccount}
                  options={accountOptions}
                  value={rateMiddlemanAccount}
                  onChange={setRateMiddlemanAccount}
                  disabled={mutationsBlocked}
                  {...pickerLabels}
                />
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={rateMiddlemanRate}
                  disabled={mutationsBlocked}
                  onChange={(e) => setRateMiddlemanRate(e.target.value)}
                  placeholder={m.rateMultiplier}
                  className="m-tx-form-input m-tx-rate-rate-input"
                  aria-label={m.rateMultiplier}
                />
                <div className="m-tx-form-grid-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateMiddlemanInputAmount}
                    disabled={mutationsBlocked}
                    onChange={(e) => setRateMiddlemanInputAmount(sanitizePositiveAmountInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "-" || e.key === "Subtract") e.preventDefault();
                    }}
                    placeholder={m.fee}
                    className="m-tx-form-input"
                    aria-label={m.fee}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rateMiddlemanPlatformFee}
                    disabled={mutationsBlocked}
                    onChange={(e) => setRateMiddlemanPlatformFee(sanitizePlatformFeeInput(e.target.value))}
                    placeholder={m.platformFee}
                    className="m-tx-form-input"
                    aria-label={m.platformFee}
                  />
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateMiddlemanAmount}
                  readOnly
                  disabled={mutationsBlocked}
                  placeholder={m.amount}
                  className="m-tx-form-input m-tx-form-input--readonly m-tx-rate-amount-display"
                  aria-label={m.middleMan}
                />
              </div>
            </>
          ) : null}

          {!isRate ? (
            <div className="m-tx-form-field">
              <label className="m-tx-form-label">{m.remark}</label>
              <textarea
                value={txRemark}
                disabled={mutationsBlocked}
                onChange={(e) => setTxRemark(e.target.value)}
                rows={2}
                className="m-tx-form-textarea"
              />
            </div>
          ) : null}

          <label className="m-tx-form-checkbox">
            <input
              type="checkbox"
              checked={txConfirm}
              disabled={mutationsBlocked}
              onChange={(e) => setTxConfirm(e.target.checked)}
            />
            <span>{m.confirmSubmit}</span>
          </label>
            </>
          )}
        </div>

        {isSearchMode ? (
          <div className="m-add-tx-footer m-add-tx-footer--single">
            <button
              type="button"
              disabled={!txType}
              onClick={() => onTypeSearch?.(txType)}
              className="m-add-tx-submit tap-scale"
            >
              {m.search}
            </button>
          </div>
        ) : (
          <div className="m-add-tx-footer">
            <button
              type="button"
              disabled={!txConfirm || submitting || mutationsBlocked}
              onClick={handleSubmit}
              className="m-add-tx-submit tap-scale"
            >
              {submitting ? m.submitting : m.submit}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
