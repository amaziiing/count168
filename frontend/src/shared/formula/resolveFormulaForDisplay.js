import {
  parseTrailingSourceParenValue,
  removeTrailingSourcePercentExpression,
} from "./removeTrailingSourcePercent.js";
import { formatSourcePercent } from "./formatSourcePercent.js";
import {
  isDuplicateCoefficientAsSource,
  isMisplacedCommission,
  isSourceOne,
} from "./isMisplacedCommission.js";
import {
  mergeFormulaOperatorsWithResolvedTail,
  shouldMergeRowTailFromResolvedSources,
} from "./mergeFormulaTail.js";
import {
  buildFormulaDisplayParenFromParts,
  buildFormulaEditFromParts,
} from "./buildFormulaDisplay.js";

function parseNumeric(value) {
  const num = Number(String(value ?? "").trim().replace(/%/g, ""));
  return Number.isFinite(num) ? num : NaN;
}

function isValidEffectiveSourceFromParen(parenValue, formulaText = "") {
  if (parenValue == null || String(parenValue).trim() === "") return false;
  const num = parseNumeric(parenValue);
  if (!Number.isFinite(num)) return false;
  if (isSourceOne(num)) return false;
  if (isDuplicateCoefficientAsSource(num, formulaText)) return false;
  return true;
}

/**
 * Resolve effective Source for a DB row.
 * Priority: formula_display *(source) → last_source_value *(source) → misplaced commission → DB field.
 */
export function resolveEffectiveSourcePercentForRow(row) {
  const enableDb = Number(row?.enable_source_percent ?? 0) ? 1 : 0;

  const formulaDisplay = String(row?.formula_display ?? "");
  const fromDisplay = parseTrailingSourceParenValue(formulaDisplay);
  if (isValidEffectiveSourceFromParen(fromDisplay, formulaDisplay)) {
    return { source: formatSourcePercent(fromDisplay), enable: enableDb || 1 };
  }

  const lastSourceValue = String(row?.last_source_value ?? "");
  const fromLsv = parseTrailingSourceParenValue(lastSourceValue);
  if (isValidEffectiveSourceFromParen(fromLsv, lastSourceValue)) {
    return { source: formatSourcePercent(fromLsv), enable: enableDb || 1 };
  }

  const formulaBody =
    String(row?.formula_operators ?? "").trim() || lastSourceValue.trim();
  const dbPctRaw = String(row?.source_percent ?? "").trim();
  if (dbPctRaw !== "" && isMisplacedCommission(dbPctRaw, formulaBody)) {
    return { source: "1", enable: enableDb };
  }

  if (dbPctRaw !== "") {
    // Keep the raw DB value as-is (e.g. "0.1/2") — this is the canonical
    // source used to rebuild row state, re-populate the Edit Formula form,
    // and re-save. formatSourcePercent() evaluates expressions and must only
    // be used for pure UI display (see formatSourcePercentForDisplay call
    // sites), never here — otherwise the original expression is permanently
    // replaced by its evaluated value on the next reload/save.
    return { source: dbPctRaw, enable: enableDb || 1 };
  }

  return { source: "1", enable: 0 };
}

/**
 * Resolve formula base + source + enable from a DB template row.
 */
export function resolveTemplateFormulaBaseAndPercent(row) {
  const { source, enable } = resolveEffectiveSourcePercentForRow(row);

  let raw = String(row?.formula_operators ?? "").trim();
  if (!raw) {
    raw = String(row?.formula_display ?? "").trim();
  }

  let base = removeTrailingSourcePercentExpression(raw, source);

  const displayMisplaced = parseTrailingSourceParenValue(row?.formula_display);
  if (
    displayMisplaced != null &&
    isDuplicateCoefficientAsSource(displayMisplaced, row?.formula_display)
  ) {
    // Trailing *(0.9) on display duplicates body *0.9 — not Source; base already stripped via removeTrailing
  }

  if (shouldMergeRowTailFromResolvedSources(source)) {
    base = mergeFormulaOperatorsWithResolvedTail(
      base,
      row?.last_source_value,
      removeTrailingSourcePercentExpression(row?.formula_display ?? "", source)
    );
  }

  return [base, source, enable];
}

export function buildFormulaDisplayParenFromRow(row) {
  const [base, source, enable] = resolveTemplateFormulaBaseAndPercent(row);
  return buildFormulaDisplayParenFromParts(base, source, enable);
}

export function buildFormulaEditFromRow(row) {
  const [base] = resolveTemplateFormulaBaseAndPercent(row);
  return buildFormulaEditFromParts(base);
}

export function resolveRowForMaintenanceDisplay(row) {
  const [base, source, enable] = resolveTemplateFormulaBaseAndPercent(row);
  return {
    base,
    source,
    enable,
    sourceDisplay: formatSourcePercent(source),
    formulaDisplay: buildFormulaDisplayParenFromParts(base, source, enable),
    formulaEdit: base,
  };
}
