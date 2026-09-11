import {
  formatAmountForStore,
  RATE_STORE_MAX_DECIMALS,
  parseRateExpression,
} from "./transactionFormat.js";
import MoneyDecimal from "../../../utils/money/moneyDecimal.js";

export function toNumberLike(raw) {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function cleanAmt(raw) {
  return String(raw ?? "")
    .replace(/,/g, "")
    .trim();
}

export function parsePositiveAmt(raw) {
  try {
    const inputStr = cleanAmt(raw);
    if (!inputStr) return MoneyDecimal.toDecimal("0", 0);
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    return dec.gt(0) ? dec : MoneyDecimal.toDecimal("0", 0);
  } catch {
    return MoneyDecimal.toDecimal("0", 0);
  }
}

/** PT-Fee magnitude regardless of stored sign (UI auto-displays it as negative). */
function parseAbsAmt(raw) {
  try {
    const inputStr = cleanAmt(raw);
    if (!inputStr) return MoneyDecimal.toDecimal("0", 0);
    return MoneyDecimal.toDecimal(inputStr, 0).abs();
  } catch {
    return MoneyDecimal.toDecimal("0", 0);
  }
}

/** FX Rate `/1.71` → divisor Decimal; otherwise null (multiply / compound forms). */
export function parseSimpleDivisionRateDivisor(raw) {
  const normalized = String(raw ?? "")
    .trim()
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");
  if (!/^\/\d*\.?\d+$/.test(normalized)) return null;
  try {
    const divisor = MoneyDecimal.toDecimal(normalized.slice(1), 0);
    return divisor.gt(0) ? divisor : null;
  } catch {
    return null;
  }
}

/**
 * Rate-Mul input: two mutually exclusive shapes.
 * - `/1.55` (simple division, same grammar as FX Rate divisor) → "divide" mode.
 *   The parsed divisor IS the effective divisor already — no further adjustment.
 * - Plain positive number (e.g. `0.05`) → "multiply" mode (points).
 * Negative plain numbers and any other expression are invalid.
 */
export function parseMiddlemanRateInput(raw) {
  const cleaned = cleanAmt(raw);
  if (!cleaned) return { valid: false, mode: null };

  const divisor = parseSimpleDivisionRateDivisor(cleaned);
  if (divisor) return { valid: true, mode: "divide", divisor };

  if (/[*/÷]/.test(cleaned)) return { valid: false, mode: null };
  if (!/^\+?\d*\.?\d+$/.test(cleaned) || cleaned === "." || cleaned === "+" || cleaned === "+.") {
    return { valid: false, mode: null };
  }
  try {
    const value = MoneyDecimal.toDecimal(cleaned, 0);
    if (value.lte(0)) return { valid: false, mode: null };
    return { valid: true, mode: "multiply", value };
  } catch {
    return { valid: false, mode: null };
  }
}

/**
 * Rate-Mul commission in second-currency units (full precision; caller stores at 6dp).
 * 顾客金额固定按 FX Rate（base）计算，不再受 Rate-Mul 影响；
 * - "divide" mode（Rate-Mul 输入 `/newDivisor`，只在 FX Rate 本身也是 `/divisor` 时生效）：
 *   rateMulCommission = from/divisor − from/newDivisor（顾客固定金额 − 用 Rate-Mul 重新算出来的值）。
 *   除数越大，客人拿到的越少，Middle-Man 抽得越多，所以要 newDivisor > divisor 才是抽成（正数）——
 *   跟 multiply 模式方向相反：multiply 是「新汇率越小抽得越多」，divide 是「新除数越大抽得越多」。
 * - "multiply" mode（Rate-Mul 输入纯正数）：
 *   - FX Rate 本身也是 `/divisor`：点数直接用，rateMulCommission = mul × 1000（独立玩法，不套用上面公式）
 *   - FX Rate 本身是乘法写法：Rate-Mul 当作「新汇率」，
 *     rateMulCommission = (原汇率 − mul) × fromAmount（乘法与除法方向一致：输入越小，拿的越多）
 *     结果为负属于「倒贴」情形，仍允许；FX Rate 无法解析时：忽略（0）
 */
export function computeRateMulCommission({ fromAmount, middlemanRate, exchangeRateRaw }) {
  const fromDec = parsePositiveAmt(fromAmount);
  if (fromDec.lte(0)) return MoneyDecimal.toDecimal("0", 0);

  const parsed = parseMiddlemanRateInput(middlemanRate);
  if (!parsed.valid) return MoneyDecimal.toDecimal("0", 0);

  const baseDivisor = parseSimpleDivisionRateDivisor(exchangeRateRaw);

  if (parsed.mode === "divide") {
    if (!baseDivisor) return MoneyDecimal.toDecimal("0", 0);
    const base = fromDec.div(baseDivisor);
    const adjusted = fromDec.div(parsed.divisor);
    return base.minus(adjusted);
  }

  // parsed.mode === "multiply"
  if (baseDivisor) {
    return parsed.value.times(1000);
  }
  const baseRate = parseRateExpression(exchangeRateRaw);
  if (!baseRate.valid) return MoneyDecimal.toDecimal("0", 0);
  const baseRateDec = MoneyDecimal.toDecimal(baseRate.value, 0);
  const rateDiff = baseRateDec.minus(parsed.value);
  return fromDec.times(rateDiff);
}

/** RATE Service Fee remark / desc：charge {第二币种} {用户输入} Service Fees */
export function buildRateServiceFeeRemark(currencyTo, middlemanInputAmount) {
  const inputStr = cleanAmt(middlemanInputAmount);
  if (!inputStr) return "";
  try {
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    if (dec.lte(0)) return "";
  } catch {
    return "";
  }
  const currency = String(currencyTo ?? "").trim().toUpperCase();
  if (!currency) return "";
  return `charge ${currency} ${inputStr} Service Fees`;
}

/** RATE Platform Fee desc：charge {第二币种} {用户输入} PlatForm Fee */
export function buildRatePlatformFeeRemark(currencyTo, platformFeeAmount) {
  const inputStr = cleanAmt(platformFeeAmount);
  if (!inputStr) return "";
  let displayAmount;
  try {
    const dec = MoneyDecimal.toDecimal(inputStr, 0);
    if (dec.isZero()) return "";
    displayAmount = dec.abs().toString();
  } catch {
    return "";
  }
  const currency = String(currencyTo ?? "").trim().toUpperCase();
  if (!currency) return "";
  return `charge ${currency} ${displayAmount} PlatForm Fee`;
}

/**
 * Middle-Man profit: rate-mul commission + Platform Fee mix (desktop).
 * - Fee is face value, always ≥ 0.
 * - PT-Fee input is always ≥ 0 and always means subtraction: Fee − PT.
 * Fee / Platform Fee are face values (no FX multiply).
 * Pass `exchangeRateRaw` so negative Rate-Mul can use the division-rate profit path.
 */
export function computeRateMiddlemanProfit({
  fromAmount,
  middlemanRate,
  feeAmount,
  platformFeeAmount,
  exchangeRateRaw,
}) {
  const rateMulDec = computeRateMulCommission({
    fromAmount,
    middlemanRate,
    exchangeRateRaw,
  });
  const feeDec = parsePositiveAmt(feeAmount);
  const platformDec = parseAbsAmt(platformFeeAmount);
  const feeNet = feeDec.minus(platformDec);
  return rateMulDec.plus(feeNet);
}

/**
 * RATE submit payload aligned with `js/transaction.js` submitAction + `api/transactions/submit_api.php` expectations.
 * Amounts are truncated to 6dp for storage (no round-2). `formatRateAmount` is display-only elsewhere.
 * `toGrossStr` is a fallback when rate/from cannot rebuild gross (e.g. missing rate).
 */
export function buildRatePayload({
  toId,
  fromId,
  fromAmt,
  toGrossStr,
  rateDate,
  txRemark,
  rateCurrencyFrom,
  rateCurrencyTo,
  parsedRateNormalizedStr,
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
}) {
  const transferToId = rateTransferToAccount?.id ? String(rateTransferToAccount.id) : "";
  const transferFromId = rateTransferFromAccount?.id ? String(rateTransferFromAccount.id) : "";
  const middleId = rateMiddlemanAccount?.id ? String(rateMiddlemanAccount.id) : "";
  const store = (v) => formatAmountForStore(v, RATE_STORE_MAX_DECIMALS);

  const fromDec = MoneyDecimal.toDecimal(cleanAmt(fromAmt) || "0", 0);

  // Rebuild gross at full precision (UI may have rounded toGrossStr to 2dp for display).
  let grossDec;
  try {
    const rateDec = MoneyDecimal.toDecimal(cleanAmt(parsedRateNormalizedStr) || "0", 0);
    if (fromDec.gt(0) && rateDec.gt(0)) {
      grossDec = fromDec.times(rateDec);
    } else {
      grossDec = MoneyDecimal.toDecimal(cleanAmt(toGrossStr) || "0", 0);
    }
  } catch {
    grossDec = MoneyDecimal.toDecimal(cleanAmt(toGrossStr) || "0", 0);
  }

  // Prefer recomputed middleman profit so store precision is not lost to display round-2.
  let middleDec = computeRateMiddlemanProfit({
    fromAmount: fromAmt,
    middlemanRate: rateMiddlemanRate,
    feeAmount: rateMiddlemanInputAmount,
    platformFeeAmount: rateMiddlemanPlatformFee,
    exchangeRateRaw: rateExchangeRateRaw,
  });
  if (middleDec.isZero() && cleanAmt(rateMiddlemanAmount)) {
    try {
      middleDec = MoneyDecimal.toDecimal(cleanAmt(rateMiddlemanAmount) || "0", 0);
    } catch {
      middleDec = MoneyDecimal.toDecimal("0", 0);
    }
  }

  const platformInputDec = parseAbsAmt(rateMiddlemanPlatformFee);

  // Rate-mul commission only (excludes fee / platform fee).
  const rateMulDec = computeRateMulCommission({
    fromAmount: fromAmt,
    middlemanRate: rateMiddlemanRate,
    exchangeRateRaw: rateExchangeRateRaw,
  });

  const fromCode = rateFromAccount?.account_id || "";
  const toCode = rateToAccount?.account_id || "";
  const fromDesc = `Transaction to ${toCode} (Rate: ${rateExchangeRateRaw})`;
  const toDesc = `Transaction from ${fromCode} (Rate: ${rateExchangeRateRaw})`;

  const transferFromCode = rateTransferFromAccount?.account_id || "";
  const transferToCode = rateTransferToAccount?.account_id || "";
  // payload 命名与 UI 交叉：rate_transfer_from_account_id 实际存的是 UI"To Account"(transferToId)，
  // rate_transfer_to_account_id 实际存的是 UI"From Account"(transferFromId)。
  // transferFromDesc 配的是 rate_transfer_from_description（即 UI To Account 的记录），
  // 所以要引用对方——UI From Account(transferFromCode)；
  // transferToDesc 配的是 rate_transfer_to_description（即 UI From Account 的记录），
  // 所以要引用对方——UI To Account(transferToCode)。与 leg1 的互相指涉逻辑保持一致。
  const transferFromDesc = `Transaction from ${transferFromCode} (Rate: ${rateExchangeRateRaw})`;
  const transferToDesc = `Transaction to ${transferToCode} (Rate: ${rateExchangeRateRaw})`;

  // "divide" 模式（Rate-Mul 输入 `/1.55`）不能原样送 rate_middleman_rate 给后端——
  // 后端用 money_normalize 校验该字段，遇到带 "/" 的字符串会直接抛异常，所以这里只存除数本身。
  const middlemanRateParsed = parseMiddlemanRateInput(rateMiddlemanRate);
  const middlemanRateForStore =
    middlemanRateParsed.valid && middlemanRateParsed.mode === "divide"
      ? middlemanRateParsed.divisor.toString()
      : cleanAmt(rateMiddlemanRate);
  const middlemanRateDesc =
    middlemanRateParsed.valid && middlemanRateParsed.mode === "divide"
      ? `/${middlemanRateParsed.divisor.toString()}`
      : `x${rateMiddlemanRate}`;

  const middleDesc =
    middleId && !middleDec.isZero()
      ? `Rate charge (${middlemanRateDesc}) from ${rateCurrencyFrom} ${MoneyDecimal.formatFixed(fromDec.toString(), 2)}`
      : "";

  const platformFeeRemark = buildRatePlatformFeeRemark(rateCurrencyTo, rateMiddlemanPlatformFee);
  // Service Fee → embedded in To/From amounts (desktop skips From RATE_FEE + sms).
  const sms = String(txRemark || "").toUpperCase();

  const storeFrom = store(fromDec.toString());
  const storeGross = store(grossDec.toString());

  const payload = {
    transaction_type: "RATE",
    account_id: toId,
    from_account_id: fromId,
    amount: storeFrom,
    transaction_date: rateDate,
    description: "",
    sms,
    currency: rateCurrencyFrom,

    rate_from_account_id: fromId,
    rate_from_currency: rateCurrencyFrom,
    rate_from_amount: storeFrom,
    rate_from_description: fromDesc,

    rate_to_account_id: toId,
    rate_to_currency: rateCurrencyTo,
    rate_to_amount: storeGross,
    rate_to_description: toDesc,

    rate_currency_from: rateCurrencyFrom,
    rate_currency_from_amount: storeFrom,
    rate_currency_to: rateCurrencyTo,
    rate_currency_to_amount: storeGross,
    rate_exchange_rate: String(parsedRateNormalizedStr ?? ""),

    rate_middleman_rate: middlemanRateForStore,
    rate_middleman_amount: !middleDec.isZero() ? store(middleDec.toString()) : "",
    rate_middleman_account: middleId,
    rate_middleman_input_amount: rateMiddlemanInputAmount ? cleanAmt(rateMiddlemanInputAmount) : "",
    rate_middleman_platform_fee: rateMiddlemanPlatformFee ? cleanAmt(rateMiddlemanPlatformFee) : "",

    rate_transfer_amount: "",
    rate_account_from_amount: "",
    rate_account_to_amount: "",
  };

  if (transferToId && transferFromId) {
    // To = full gross（已含 Service Fee 口径，不另扣）
    // From RATE = gross − rateMul − Service Fee（PT-Fee 不动 From RATE，改由 PLATFORM_FEE 行体现）
    const transferBase = grossDec;
    const serviceFeeDec = parsePositiveAmt(rateMiddlemanInputAmount);
    const transferToSide = transferBase;
    let transferFromSide = transferBase;
    if (middleId && rateMulDec.gt(0)) {
      transferFromSide = transferBase.minus(rateMulDec);
    }
    if (serviceFeeDec.gt(0)) {
      transferFromSide = transferFromSide.minus(serviceFeeDec);
    }

    payload.rate_transfer_from_account_id = transferToId;
    payload.rate_transfer_from_currency = rateCurrencyTo;
    payload.rate_transfer_from_amount = store(transferToSide.toString());
    payload.rate_transfer_from_description = transferFromDesc;

    payload.rate_transfer_to_account_id = transferFromId;
    payload.rate_transfer_to_currency = rateCurrencyTo;
    payload.rate_transfer_to_amount = store(transferFromSide.toString());
    payload.rate_transfer_to_description = transferToDesc;

    payload.rate_transfer_from_account = transferToId;
    payload.rate_transfer_to_account = transferFromId;

    if (middleId) {
      payload.rate_middleman_account_id = middleId;
      payload.rate_middleman_currency = rateCurrencyTo;
      payload.rate_middleman_amount = store(middleDec.toString());
      payload.rate_middleman_description = middleDesc;
    }

    // PT-Fee > 0 → History Fee 行 (+PT) on From；表单金额不预加。
    if (platformInputDec.gt(0)) {
      payload.rate_platform_fee_amount = store(platformInputDec.toString());
      payload.rate_platform_fee_description =
        platformFeeRemark ||
        `charge ${String(rateCurrencyTo ?? "").trim().toUpperCase()} ${store(platformInputDec.toString())} PlatForm Fee`;
      payload.rate_platform_fee_from_credit = "1";
    }
  }

  // Ensure skip flag survives even if transfer block early-returned somehow.
  payload.rate_skip_from_service_fee = "1";

  return { payload, middleId };
}

/** Account DB ids involved in a submit — used for post-submit focused list (To + From, RATE legs, etc.). */
export function collectSubmitFocusAccountIds({
  txType,
  toAccountId,
  fromAccountId,
  isAdjustment = false,
  rateToAccountId,
  rateFromAccountId,
  rateTransferToAccountId,
  rateTransferFromAccountId,
  rateMiddlemanAccountId,
} = {}) {
  const ids = new Set();
  const add = (id) => {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) ids.add(n);
  };

  const type = String(txType || "").toUpperCase().trim();
  if (type === "RATE") {
    add(rateToAccountId);
    add(rateFromAccountId);
    add(rateTransferToAccountId);
    add(rateTransferFromAccountId);
    add(rateMiddlemanAccountId);
    return [...ids];
  }

  add(toAccountId);
  if (!isAdjustment) add(fromAccountId);
  return [...ids];
}

/**
 * Cr/Dr (or Win/Loss) deltas for optimistic list update after approved submit.
 * CONTRA/PAYMENT/CLAIM/CLEAR/RECEIVE: To −amount, From +amount.
 * ADJUSTMENT: To += signed amount.
 * WIN/LOSE: amounts go to win_loss (To/From signs per period search).
 */
export function buildOptimisticSubmitDeltas({
  txType,
  amount,
  toAccountId,
  fromAccountId,
} = {}) {
  const type = String(txType || "").toUpperCase().trim();
  if (!type || type === "RATE") return [];

  let amtStr;
  try {
    const cleaned = MoneyDecimal.cleanMoneyInput(amount);
    if (!cleaned) return [];
    amtStr = MoneyDecimal.toDecimal(cleaned).toString();
  } catch {
    return [];
  }

  const toId = Number(toAccountId);
  const fromId = Number(fromAccountId);
  const deltas = [];
  const push = (id, patch) => {
    if (Number.isFinite(id) && id > 0) deltas.push({ accountDbId: id, ...patch });
  };

  if (type === "ADJUSTMENT") {
    push(toId, { crDrDelta: amtStr });
    return deltas;
  }

  if (type === "WIN" || type === "LOSE") {
    const absAmt = MoneyDecimal.abs(amtStr).toString();
    // Period search: To WIN −amount / LOSE +amount; From WIN +amount / LOSE −amount.
    if (type === "WIN") {
      push(toId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
      push(fromId, { winLossDelta: absAmt });
    } else {
      push(toId, { winLossDelta: absAmt });
      push(fromId, { winLossDelta: MoneyDecimal.sub("0", absAmt).toString() });
    }
    return deltas;
  }

  if (["CONTRA", "PAYMENT", "CLAIM", "CLEAR", "RECEIVE"].includes(type)) {
    push(toId, { crDrDelta: MoneyDecimal.sub("0", amtStr).toString() });
    push(fromId, { crDrDelta: amtStr });
  }

  return deltas;
}
