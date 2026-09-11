<?php
/**
 * Maintenance - Formula 与 data_capture_templates 的 formula / source_percent 字段约定
 * 与 frontend/src/shared/formula 对齐
 */

function removeTrailingSourcePercentSuffix($formulaText) {
    if ($formulaText === null || $formulaText === '') {
        return '';
    }
    $result = trim((string) $formulaText);
    $previous = '';
    while ($result !== '' && $previous !== $result) {
        $previous = $result;
        $lastStarIndex = strrpos($result, '*');
        if ($lastStarIndex === false) {
            break;
        }
        $beforeStar = substr($result, 0, $lastStarIndex);
        $afterStar = substr($result, $lastStarIndex);
        $openParens = substr_count($beforeStar, '(');
        $closeParens = substr_count($beforeStar, ')');
        $isStarInsideParens = $openParens > $closeParens;
        if (!$isStarInsideParens && preg_match('/^\*\s*\(([0-9.\+\-*\/\s]+)\)\s*$/u', $afterStar)) {
            $result = trim($beforeStar);
            continue;
        }
        break;
    }
    return $result;
}

function parseTrailingSourceParenValuePhp($formulaText) {
    if ($formulaText === null || trim((string) $formulaText) === '') {
        return null;
    }
    $trimmed = trim((string) $formulaText);
    $lastStar = strrpos($trimmed, '*');
    if ($lastStar === false) {
        return null;
    }
    $beforeStar = substr($trimmed, 0, $lastStar);
    $afterStar = substr($trimmed, $lastStar);
    if (substr_count($beforeStar, '(') > substr_count($beforeStar, ')')) {
        return null;
    }
    if (preg_match('/^\*\s*\(([0-9.\+\-*\/\s]+)\)\s*$/u', $afterStar, $m)) {
        return trim($m[1]);
    }
    return null;
}

function isMisplacedCommissionRangePhp($value) {
    if ($value === null || $value === '') {
        return false;
    }
    if (!is_numeric($value)) {
        $value = str_replace([' ', '%'], '', (string) $value);
        if (!is_numeric($value)) {
            return false;
        }
    }
    $num = (float) $value;
    return $num > 0.85 && $num < 1 - 1e-9;
}

function isDuplicateCoefficientAsSourcePhp($value, $formulaText) {
    if (!isMisplacedCommissionRangePhp($value)) {
        return false;
    }
    if ($formulaText === null || trim((string) $formulaText) === '') {
        return false;
    }
    $tail = extractRowCoefficientTailPhp($formulaText);
    if ($tail === null) {
        return false;
    }
    $tailNum = (float) substr($tail, 1);
    $valNum = is_numeric($value) ? (float) $value : (float) str_replace([' ', '%'], '', (string) $value);
    return abs($tailNum - $valNum) < 1e-9;
}

function isMisplacedCommissionPhp($value, $formulaBody = '') {
    return isDuplicateCoefficientAsSourcePhp($value, $formulaBody);
}

function isSourceOnePhp($value) {
    if ($value === null || trim((string) $value) === '') {
        return true;
    }
    $valueStr = trim(str_replace('%', '', (string) $value));
    if (!is_numeric($valueStr)) {
        return false;
    }
    return abs((float) $valueStr - 1) < 1e-9;
}

function extractRowCoefficientTailPhp($formulaText) {
    if ($formulaText === null || trim((string) $formulaText) === '') {
        return null;
    }
    $s = removeTrailingSourcePercentSuffix($formulaText);
    if (!preg_match('/^(.*)\*([0-9.]+)\s*$/u', $s, $m)) {
        return null;
    }
    $tail = trim($m[2]);
    if ($tail === '' || strpos($tail, '$') !== false) {
        return null;
    }
    return '*' . $tail;
}

function hasRowCoefficientTailPhp($formulaText) {
    return extractRowCoefficientTailPhp($formulaText) !== null;
}

function mergeFormulaOperatorsWithResolvedTailPhp($body, ...$resolvedSources) {
    $base = trim((string) $body);
    if ($base === '' || hasRowCoefficientTailPhp($base)) {
        return $base;
    }
    foreach ($resolvedSources as $src) {
        if ($src === null || trim((string) $src) === '') {
            continue;
        }
        $tail = extractRowCoefficientTailPhp($src);
        if ($tail !== null) {
            return $base . $tail;
        }
    }
    return $base;
}

function shouldMergeRowTailFromResolvedSourcesPhp($effectiveSource) {
    if ($effectiveSource === null || trim((string) $effectiveSource) === '') {
        return true;
    }
    return isSourceOnePhp($effectiveSource);
}

/**
 * A trailing "* (X)" is only a genuine Source coefficient when X is a plain numeric literal
 * (e.g. "0.95", "1.71625"). Formulas whose own last term is a parenthesized sub-expression
 * (e.g. "3232*(5555/3232-0.0025)") also match the trailing-paren regex, but X there is an
 * unevaluated expression, not a coefficient - accepting it would eval the formula's own
 * arithmetic and misreport its result as "Source". Mirrors JS's isValidEffectiveSourceFromParen,
 * which relies on Number()/isFinite() to reject non-literal expressions the same way.
 */
function isPlainNumericSourceValuePhp($value) {
    if ($value === null) {
        return false;
    }
    $v = trim(str_replace('%', '', (string) $value));

    return $v !== '' && is_numeric($v);
}

function resolveEffectiveSourcePercentForRow(array $row) {
    $enableDb = isset($row['enable_source_percent']) ? (int) $row['enable_source_percent'] : 0;

    $formulaDisplay = isset($row['formula_display']) ? (string) $row['formula_display'] : '';
    $fromDisplay = parseTrailingSourceParenValuePhp($formulaDisplay);
    if ($fromDisplay !== null && isPlainNumericSourceValuePhp($fromDisplay) && !isSourceOnePhp($fromDisplay) && !isDuplicateCoefficientAsSourcePhp($fromDisplay, $formulaDisplay)) {
        return [
            'source' => formatSourcePercentForMaintenanceList($fromDisplay),
            'enable' => $enableDb ? 1 : 1,
        ];
    }

    $lastSourceValue = isset($row['last_source_value']) ? (string) $row['last_source_value'] : '';
    $fromLsv = parseTrailingSourceParenValuePhp($lastSourceValue);
    if ($fromLsv !== null && isPlainNumericSourceValuePhp($fromLsv) && !isSourceOnePhp($fromLsv) && !isDuplicateCoefficientAsSourcePhp($fromLsv, $lastSourceValue)) {
        return [
            'source' => formatSourcePercentForMaintenanceList($fromLsv),
            'enable' => $enableDb ? 1 : 1,
        ];
    }

    $formulaBody = trim((string) ($row['formula_operators'] ?? ''));
    if ($formulaBody === '') {
        $formulaBody = trim($lastSourceValue);
    }
    $dbPctRaw = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    if ($dbPctRaw !== '' && isMisplacedCommissionPhp($dbPctRaw, $formulaBody)) {
        return ['source' => '1', 'enable' => $enableDb];
    }

    if ($dbPctRaw !== '') {
        // Keep the raw DB value as-is (e.g. "0.1/2") — this is the canonical
        // source used to rebuild formula_edit/formula base and to re-populate
        // the Edit form. formatSourcePercentForMaintenanceList() evaluates
        // expressions and must only be used for pure list-display text (see
        // list_api.php's $sourceDisplay), never here — otherwise the original
        // expression is permanently replaced by its evaluated value the next
        // time this row is saved (even from an edit that never touched Source).
        return [
            'source' => $dbPctRaw,
            'enable' => $enableDb ? 1 : 1,
        ];
    }

    return ['source' => '1', 'enable' => 0];
}

function resolveTemplateFormulaBaseAndPercent(array $row) {
    $resolved = resolveEffectiveSourcePercentForRow($row);
    $source = $resolved['source'];
    $enable = $resolved['enable'];

    $raw = isset($row['formula_operators']) ? trim((string) $row['formula_operators']) : '';
    if ($raw === '') {
        $raw = isset($row['formula_display']) ? trim((string) $row['formula_display']) : '';
    }

    $base = removeTrailingSourcePercentSuffix($raw);

    return [$base, $source, $enable];
}

function buildFormulaDisplayParenFromParts($base, $sourcePercent, $enableSourcePercent) {
    $b = trim((string) $base);
    $pct = trim((string) $sourcePercent);
    $en = (int) $enableSourcePercent;
    if ($b === '') {
        return '';
    }
    if (!$en || $pct === '' || isSourceOnePhp($pct)) {
        return $b;
    }
    return $b . ' * (' . formatSourcePercentForMaintenanceList($pct) . ')';
}

/** Edit box: formula base only, no Source suffix. */
function buildFormulaEditFromParts($base, $sourcePercent = null, $enableSourcePercent = null) {
    return trim((string) $base);
}

function buildFormulaDisplayParenFromRow(array $row) {
    list($base, $pct, $en) = resolveTemplateFormulaBaseAndPercent($row);
    return buildFormulaDisplayParenFromParts($base, $pct, $en);
}

function buildFormulaEditFromRow(array $row) {
    list($base, $pct, $en) = resolveTemplateFormulaBaseAndPercent($row);
    return buildFormulaEditFromParts($base, $pct, $en);
}

/**
 * Maintenance 保存：从用户输入剥 *(source)，base 独立存 formula_operators。
 */
function parseMaintenanceFormulaInput($raw) {
    $s = trim((string) $raw);
    if ($s === '') {
        return ['base' => '', 'source_percent' => null, 'enable_source_percent' => null];
    }
    $base = removeTrailingSourcePercentSuffix($s);
    return ['base' => $base, 'source_percent' => null, 'enable_source_percent' => null];
}

function scoreTemplateRowForMaintenanceDedup(array $row) {
    list($base, $source) = resolveTemplateFormulaBaseAndPercent($row);
    $score = strlen($base);
    if (hasRowCoefficientTailPhp($base)) {
        $score += 100;
    }
    $formulaBody = trim((string) ($row['formula_operators'] ?? ''));
    if ($formulaBody === '') {
        $formulaBody = trim((string) ($row['last_source_value'] ?? ''));
    }
    if ($source !== '' && $source !== '1' && !isMisplacedCommissionPhp($source, $formulaBody)) {
        $score += 200;
    }
    $displayMisplaced = parseTrailingSourceParenValuePhp($row['formula_display'] ?? '');
    if ($displayMisplaced !== null && isMisplacedCommissionPhp($displayMisplaced, $row['formula_display'] ?? '')) {
        $score -= 200;
    }
    $dbPct = isset($row['source_percent']) ? trim((string) $row['source_percent']) : '';
    if ($dbPct !== '' && isMisplacedCommissionPhp($dbPct, $formulaBody)) {
        $score -= 150;
    }
    return $score;
}

function buildMaintenanceDedupKeyPhp(array $row, $processDisplay, $accountDisplay, $currencyDisplay) {
    $product = $row['id_product'] ?? '';
    $productType = $row['product_type'] ?? 'main';
    $descriptionKey = strtolower(trim((string) ($row['description'] ?? '')));
    return implode('|', [
        strtolower(trim((string) $processDisplay)),
        strtolower(trim((string) $accountDisplay)),
        strtolower(trim((string) $currencyDisplay)),
        strtolower(trim((string) $product)),
        $productType,
        $descriptionKey,
    ]);
}

function formulaCoreWithoutTailPhp($base) {
    $tail = extractRowCoefficientTailPhp($base);
    if ($tail === null) {
        return trim((string) $base);
    }
    return trim(substr($base, 0, -strlen($tail)));
}

function peerGroupKeyPhp(array $displayRow, array $rawRow) {
    $process = strtolower(trim((string) ($displayRow['process'] ?? '')));
    $currency = strtolower(trim((string) ($displayRow['currency'] ?? '')));
    $product = strtolower(trim((string) ($displayRow['product'] ?? '')));
    list($base) = resolveTemplateFormulaBaseAndPercent($rawRow);
    $core = strtolower(formulaCoreWithoutTailPhp($base));
    return $process . '|' . $currency . '|' . $product . '|' . $core;
}

function applyPeerRowCoefficientInferencePhp(array $displayRows, array $rawById) {
    $tailByKey = [];
    foreach ($displayRows as $idx => $displayRow) {
        $raw = $rawById[(int) ($displayRow['id'] ?? 0)] ?? [];
        if (empty($raw)) {
            continue;
        }
        list($base) = resolveTemplateFormulaBaseAndPercent($raw);
        $tail = extractRowCoefficientTailPhp($base);
        if ($tail !== null) {
            $tailByKey[peerGroupKeyPhp($displayRow, $raw)] = $tail;
        }
    }

    foreach ($displayRows as $idx => $displayRow) {
        $raw = $rawById[(int) ($displayRow['id'] ?? 0)] ?? [];
        if (empty($raw)) {
            continue;
        }
        list($base, $source, $enable) = resolveTemplateFormulaBaseAndPercent($raw);
        if (hasRowCoefficientTailPhp($base)) {
            continue;
        }
        $key = peerGroupKeyPhp($displayRow, $raw);
        if (!isset($tailByKey[$key])) {
            continue;
        }
        $patchedBase = $base . $tailByKey[$key];
        $displayRows[$idx]['formula'] = buildFormulaDisplayParenFromParts($patchedBase, $source, $enable);
        $displayRows[$idx]['formula_edit'] = $patchedBase;
        $displayRows[$idx]['source'] = formatSourcePercentForMaintenanceList($source);
    }
    return $displayRows;
}

/**
 * 与 js/datacapturesummary.js 中 formatSourcePercentForDisplay 对齐
 */
function formatSourcePercentForMaintenanceList($value) {
    if ($value === null || $value === false) {
        return '1';
    }
    $valueStr = trim(str_replace('%', '', (string) $value));
    if ($valueStr === '') {
        return '1';
    }
    if (preg_match('/[+\-*\/]/', $valueStr)) {
        if (!preg_match('/^[0-9.+\-*\/()\s]+$/', $valueStr)) {
            return $valueStr;
        }
        $result = @eval('return (' . $valueStr . ');');
        if (!is_numeric($result)) {
            return $valueStr;
        }
        $num = (float) $result;
    } else {
        if (!is_numeric($valueStr)) {
            return $valueStr;
        }
        $num = (float) $valueStr;
    }
    if (!is_finite($num)) {
        return $valueStr;
    }
    if (abs($num - round($num)) < 1e-9) {
        return (string) (int) round($num);
    }
    $s = number_format($num, 6, '.', '');
    $s = rtrim(rtrim($s, '0'), '.');
    return $s !== '' ? $s : '0';
}
