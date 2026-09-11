<?php
/**
 * Process Accounting Inbox API
 * 返回「当天需要算账」的 Bank Process 列表（用于 Process List 标题旁的“需要算账”Inbox）
 * 规则：
 * - 1st of Every Month：首笔整月账单起，「何时出现在待算账」取 max(当月1号, dts_created)，避免 day_start 早于创建日时提前出现（旧数据不拿）；新建流程在「创建月」内且创建日晚于当月1号时，金额从创建日比例摊到当月末（忽略早于创建日的整月锚点）。Resend（accounting_resend_relax_created_floor）仍按应付日（1号）起算比例，与旧版一致。
 * - Maintenance 删交易后 Resend 成功：bank_process.accounting_resend_relax_created_floor=1 期间，上述「创建日门槛」与 day_start 取较早者，便于用户修正 day_start 后仍进 Accounting Due；从 Accounting Due 入账成功后清零。
 * - Week / 1st of Every Month / Monthly prepaid / Day：截至今日所有已到期且未入账（未跳过）的账期各列一行，无需等前一期入账后才展示下一期。Day 自 max(day_start, 当月1号) 起至今日每个自然日一行（当月之前不补列；Resend 单期指定日除外）。
 * - Resend（accounting_resend_relax_created_floor）与日常流程均适用上述多期并列规则。
 * - Day start 为当月1号且与创建同月：仍自 day_start 当日起可入账（与上条后续整月不同）。
 * - 非1号 day_start：首月按比例从 day_start 起算；若创建日晚于该自然月末则整段跳过（旧数据不拿）；出现日 max(day_start, 创建日)。
 * - 合同 N 个月（N MONTHS，active）：起租自然月单独首段/首月不计入 N；N 个月从「次月」起计——1st 为次月起连续 N 个自然月 1 号锚点，monthly 为次月起首应付日起连续 N 期；与入账、process_post 合同边界一致。
 * - Bank 表单 Day end 仅由前端 contractBillingEndYmdForBankForm 自动填（1 号起租=起租+N 月；非 1 号=起租+N 月再减一天）；入账与 isWithinRecurringBillingWindow 仍以本文件 PHP 为准。
 * - Monthly（先付）= 链式月付：首期应付 day_start，服务 [应付日, 应付日+1月-1日]（如 5/22→5/22–6/21）；下一期应付 = 上期末日（6/21→6/21–7/21）；Billing Date 展示应付日。
 * - 逾期未入账：若仅在「算账日当天」才显示，用户错过后列表会空白；改为「已过应付日且该自然月尚未 monthly 入账/跳过」则一直显示到该月结清。
 * - day_end_tail（1st_of_every_month + 有 day_end_monthly_cap_enabled 列且开关 ON）：尾段区间为 max(合同 exclusiveEnd, day_end 所在月 1 号)～day_end（含），与 prorateInclusiveDateRange 旧算法一致；$today 达 tail 起点即入列。开关 OFF 时不排尾段。
 * - 同上开关 ON 时，每一期 regular monthly（1st_of_every_month）若 day_end 落在该账单自然月内，该期金额按「该月 1 号～day_end」自然天比例折算（非仅合同尾段）；开关 OFF 则该期仍为整自然月价。
 * - 无 day_end_monthly_cap_enabled 列或非 1st 频率：仍为「day_end ≥ exclusiveEnd」时 exclusiveEnd～day_end 尾段（与旧版一致）；无列时仍排尾段。
 * - Resend 弹窗同时填 day_start 与 day_end（仅 relax 暂存）：Accounting Due 只列一行，金额按自然月切段 [day_start, day_end] 合并（与 process_post 的 resend_consolidated_range 一致）；不影响非 Resend 的 addprocess。
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../../includes/group_company_access.php';
require_once __DIR__ . '/../bankprocess_maintenance/maintenance_accounting_resend_lib.php';
require_once __DIR__ . '/../includes/money_decimal.php';
require_once __DIR__ . '/../includes/ensure_bank_process_day_end_monthly_cap_column.php';
require_once __DIR__ . '/../includes/ensure_bank_process_billing_extension_columns.php';
require_once __DIR__ . '/contract_billing_addon.php';

if (isset($pdo) && $pdo instanceof PDO) {
    ensureBankProcessDayEndMonthlyCapEnabledColumn($pdo);
    ensureBankProcessBillingExtensionColumns($pdo);
}

/** 统一 JSON 响应 */
function jsonResponse(bool $success, string $message = '', $data = null): void
{
    $payload = ['success' => $success, 'message' => $message];
    if ($data !== null) {
        $payload['data'] = $data;
    }
    echo json_encode($payload);
}

function tableHasColumn(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    return $stmt->rowCount() > 0;
}

/**
 * 与 process_post_to_transaction_api::bankProcessDateFieldToYmd 一致：优先 d/m/Y，避免 01/04/2026 被 strtotime 当成美式 1 月 4 日，
 * 从而导致「day_start 在 1 号」分支永远不命中、Resend 后当月进不了 Accounting Due。
 */
function inboxBankProcessDateFieldToYmd($raw): ?string
{
    return bmp_bankProcessDateFieldToYmd($raw);
}

/** Pro-rated cost/price/profit for partial first month: day_start to end of that month */
function partialFirstMonthAmounts(string $dayStart, string $cost, string $price, string $profit): array
{
    $norm = inboxBankProcessDateFieldToYmd($dayStart);
    $ts = $norm !== null ? strtotime($norm) : strtotime($dayStart);
    if ($ts === false) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    $daysRemaining = $daysInMonth - $dayOfMonth + 1;
    if ($daysInMonth <= 0) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $ratio = money_div((string) $daysRemaining, (string) $daysInMonth, MONEY_CALC_SCALE);
    return [
        'cost' => money_mul($cost, $ratio, MONEY_TX_STORE_SCALE),
        'price' => money_mul($price, $ratio, MONEY_TX_STORE_SCALE),
        'profit' => money_mul($profit, $ratio, MONEY_TX_STORE_SCALE),
    ];
}

/** Pro-rated amounts from $startYmd (inclusive) to end of that month (inclusive). */
function prorateToMonthEndFromStart(string $startYmd, string $cost, string $price, string $profit): array
{
    $ts = strtotime($startYmd);
    if ($ts === false) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysInMonth = (int) date('t', $ts);
    $dayOfMonth = (int) date('j', $ts);
    if ($daysInMonth <= 0) {
        return ['cost' => $cost, 'price' => $price, 'profit' => $profit];
    }
    $daysRemaining = $daysInMonth - $dayOfMonth + 1;
    $daysRemaining = max(0, $daysRemaining);
    $ratio = money_div((string) $daysRemaining, (string) $daysInMonth, MONEY_CALC_SCALE);
    return [
        'cost' => money_mul($cost, $ratio, MONEY_TX_STORE_SCALE),
        'price' => money_mul($price, $ratio, MONEY_TX_STORE_SCALE),
        'profit' => money_mul($profit, $ratio, MONEY_TX_STORE_SCALE),
    ];
}

/** 检查 bank_process 表是否有 day_start_frequency 列 */
function hasBankProcessFrequencyColumn(PDO $pdo): bool
{
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM bank_process LIKE 'day_start_frequency'");
        return $stmt && $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function getBankProcessIssueFlagSql(string $tableAlias, bool $hasIssueFlagColumn, bool $hasFlagColumn): string
{
    if ($hasIssueFlagColumn && $hasFlagColumn) {
        return "COALESCE(NULLIF($tableAlias.`flag`, ''), NULLIF($tableAlias.`issue_flag`, ''))";
    }
    if ($hasFlagColumn) return "$tableAlias.`flag`";
    if ($hasIssueFlagColumn) return "$tableAlias.`issue_flag`";
    return "NULL";
}

function normalizedBankIssueFlagSql(string $columnRef): string
{
    return "LOWER(REPLACE(REPLACE(TRIM(COALESCE($columnRef, '')), '-', '_'), ' ', '_'))";
}

/** active regular billing 的合同月数：1+N 仅计 1 个月（N 月走 manual_inactive 赔付）；未知则 null（不截断） */
function getBillingTermMonthsFromContract(?string $contract): ?int
{
    if ($contract === null || trim($contract) === '') {
        return null;
    }
    $c = trim($contract);
    if (preg_match('/^1\+(\d+)$/i', $c, $m)) {
        return 1;
    }
    if (preg_match('/^(\d+)\s*MONTHS?$/i', $c, $m)) {
        return max(1, (int) $m[1]);
    }
    return null;
}

/**
 * 1st of Every Month + day_start 非1号：次月1号起的「整月」锚点月份个数上限 = N（起租当月 partial 不计入合同 N 个月）。
 */
function inboxAnchorMonthCapAfterPartialFirst(?string $contract, int $startDayOfMonth): ?int
{
    if ($startDayOfMonth === 1) {
        return null;
    }
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) {
        return null;
    }
    return max(0, $term);
}

function billingContractExclusiveEndYmd(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        return (new DateTimeImmutable($dayStartYmd))->modify("+{$termMonths} months")->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * 每月1号算账 + day_start 非1号：首自然月 partial 不计入合同 N 个月；合同 N 个月从「次月1号」起连续 N 个整月锚点，exclusive = firstAnchor + N 月。
 * day_start 在1号时与 billingContractExclusiveEndYmd 从当月起计 N 月相同。
 */
function billingContractExclusiveEndYmdFirstOfMonth(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        $start = new DateTimeImmutable($dayStartYmd);
        if ((int) $start->format('j') === 1) {
            return $start->modify("+{$termMonths} months")->format('Y-m-d');
        }
        $firstAnchor = $start->modify('first day of next month');
        return $firstAnchor->modify("+{$termMonths} months")->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * monthly + day_start 非1号：起租首段不计入合同 N 个月；N 个月从「首段末日（链式次期应付）」起计，exclusive = 该应付日 + N 月。
 * day_start 在1号时与 billingContractExclusiveEndYmd 相同。
 */
function billingContractExclusiveEndYmdMonthlyAfterPartialFirst(string $dayStartYmd, int $termMonths): ?string
{
    if ($termMonths < 1) {
        return null;
    }
    try {
        $start = new DateTimeImmutable($dayStartYmd);
        if ((int) $start->format('j') === 1) {
            return billingContractExclusiveEndYmd($dayStartYmd, $termMonths);
        }
        $firstContractDue = billingMonthlyFirstContractDueAfterPartialFirst($dayStartYmd);
        if ($firstContractDue === null) {
            return null;
        }

        return (new DateTimeImmutable($firstContractDue))->modify("+{$termMonths} months")->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

function contractExclusiveEndYmdForFrequency(string $startYmd, ?string $contract, ?string $frequency): ?string
{
    $term = getBillingTermMonthsFromContract($contract);
    if ($term === null || $term < 1) {
        return null;
    }
    if ($frequency === 'monthly') {
        return billingContractExclusiveEndYmdMonthlyAfterPartialFirst($startYmd, $term);
    }
    return billingContractExclusiveEndYmdFirstOfMonth($startYmd, $term);
}

/**
 * 合同自然结束 + day_end：day_end 为最后一天计入（可长于合同自然结束）；与 day_end 尾段账单一致。
 */
/**
 * @param bool $unlimitedWindow Feature 2: plain-active row (no issue_flag) with day_end 旁开关 OFF —
 *        contract/day_end no longer caps recurring billing; only the pre-start gate still applies.
 *        See bmpRowUnlimitedWindow().
 */
function isWithinRecurringBillingWindow(string $todayYmd, ?string $dayStartYmd, ?string $contract, ?string $dayEndYmd, ?string $frequency = null, bool $bypassPreStartGate = false, bool $ignoreContractEndForResendSingle = false, bool $unlimitedWindow = false): bool
{
    if ($dayStartYmd === null || trim($dayStartYmd) === '') {
        return true;
    }
    $normStart = inboxBankProcessDateFieldToYmd($dayStartYmd);
    if ($normStart !== null) {
        $start = $normStart;
    } else {
        $ts0 = strtotime($dayStartYmd);
        if ($ts0 === false) {
            return true;
        }
        $start = date('Y-m-d', $ts0);
    }
    if (!$bypassPreStartGate && $todayYmd < $start) {
        return false;
    }
    // Resend 弹窗指定单期：允许「今天」已超过合同最后一天时仍补历史那一期，不按整份合同窗口拦截。
    if ($ignoreContractEndForResendSingle) {
        return true;
    }
    if ($unlimitedWindow) {
        return true;
    }

    $freq = ($frequency === 'monthly') ? 'monthly' : '1st_of_every_month';
    $exclusiveFirstDayAfter = contractExclusiveEndYmdForFrequency($start, $contract, $freq);

    $contractLastInclusive = null;
    if ($exclusiveFirstDayAfter !== null) {
        try {
            $contractLastInclusive = (new DateTimeImmutable($exclusiveFirstDayAfter))->modify('-1 day')->format('Y-m-d');
        } catch (Throwable $e) {
            $contractLastInclusive = null;
        }
    }

    $dayEndInc = null;
    if ($dayEndYmd !== null && $dayEndYmd !== '' && strtotime($dayEndYmd) !== false) {
        $dayEndInc = date('Y-m-d', strtotime($dayEndYmd));
    }

    if ($contractLastInclusive === null && $dayEndInc === null) {
        return true;
    }
    if ($contractLastInclusive !== null && $dayEndInc === null) {
        return $todayYmd <= $contractLastInclusive;
    }
    if ($contractLastInclusive === null) {
        return $todayYmd <= $dayEndInc;
    }
    if ($dayEndInc > $contractLastInclusive) {
        return $todayYmd <= $dayEndInc;
    }
    return $todayYmd <= min($contractLastInclusive, $dayEndInc);
}

/** $fromYmd、$toYmd 均含当日；各段按当月天数比例分摊整月金额。 */
function prorateInclusiveDateRange(string $fromYmd, string $toYmd, string $cost, string $price, string $profit): array
{
    $zero = money_normalize('0', MONEY_TX_STORE_SCALE);
    if ($fromYmd > $toYmd) {
        return ['cost' => $zero, 'price' => $zero, 'profit' => $zero];
    }
    try {
        $cur = new DateTimeImmutable($fromYmd);
        $end = new DateTimeImmutable($toYmd);
    } catch (Throwable $e) {
        return ['cost' => $zero, 'price' => $zero, 'profit' => $zero];
    }
    $tc = '0';
    $tp = '0';
    $tf = '0';
    while ($cur <= $end) {
        $dim = (int) $cur->format('t');
        $monthEnd = $cur->modify('last day of this month');
        $chunkEnd = $monthEnd <= $end ? $monthEnd : $end;
        $d0 = (int) $cur->format('j');
        $d1 = (int) $chunkEnd->format('j');
        $chunkDays = $d1 - $d0 + 1;
        if ($dim > 0 && $chunkDays > 0) {
            $ratio = money_div((string) $chunkDays, (string) $dim, MONEY_CALC_SCALE);
            $tc = money_add($tc, money_mul($cost, $ratio, MONEY_CALC_SCALE), MONEY_CALC_SCALE);
            $tp = money_add($tp, money_mul($price, $ratio, MONEY_CALC_SCALE), MONEY_CALC_SCALE);
            $tf = money_add($tf, money_mul($profit, $ratio, MONEY_CALC_SCALE), MONEY_CALC_SCALE);
        }
        $cur = $chunkEnd->modify('+1 day');
    }
    return [
        'cost' => money_normalize($tc, MONEY_TX_STORE_SCALE),
        'price' => money_normalize($tp, MONEY_TX_STORE_SCALE),
        'profit' => money_normalize($tf, MONEY_TX_STORE_SCALE),
    ];
}

function isDayEndTailAlreadyPosted(PDO $pdo, int $companyId, int $processId): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND period_type IN ('day_end_tail','day_end_tail_skipped') LIMIT 1");
    $stmt->execute([$companyId, $processId]);
    return (bool) $stmt->fetch();
}

function isResendConsolidatedAlreadyPosted(PDO $pdo, int $companyId, int $processId, ?string $anchorYmd = null): bool
{
    try {
        if ($anchorYmd !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $anchorYmd)) {
            // 使用 DATE(posted_date)：列可能为 DATETIME，与 dismiss 写入的 Y-m-d 锚点须一致，否则已 *_skipped 仍出现在 Accounting Due。
            $stmt = $pdo->prepare(
                "SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ?
                 AND period_type IN ('resend_consolidated_range','resend_consolidated_range_skipped')
                 AND DATE(posted_date) = ? LIMIT 1"
            );
            $stmt->execute([$companyId, $processId, $anchorYmd]);
            if ((bool) $stmt->fetch()) {
                return true;
            }
        }
        // 仅按当前锚日判断；Due Delete 的 *_skipped 若锚点一致由 Resend 清除，不在此兜底整 process 封死。
        return false;
    } catch (Throwable $e) {
        // 兼容极旧库（无 period_type）：退化为同 process 同锚点日期存在 posted 即视为已处理。
        if ($anchorYmd !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $anchorYmd)) {
            return hasLegacyPostedOnDate($pdo, $companyId, $processId, $anchorYmd);
        }
        return false;
    }
}

function isBillingCompleteBeforeDayEndTail(PDO $pdo, int $companyId, int $processId, string $exclusiveEndYmd, string $startDate, int $startDayOfMonth, bool $hasPeriodType, ?string $createdYmd = null, ?string $frequency = null): bool
{
    if (!$hasPeriodType) {
        return true;
    }
    try {
        $lastInclusive = (new DateTimeImmutable($exclusiveEndYmd))->modify('-1 day');
        // 新建流程在合同常规账期结束后才创建时，旧账期本就不会进入 Accounting Due，
        // 不应再强制要求“最后常规月已入账/跳过”，否则 day_end_tail 永远不会出现。
        if ($createdYmd !== null && $createdYmd !== '' && $createdYmd > $lastInclusive->format('Y-m-d')) {
            return true;
        }
        $freq = ($frequency === 'monthly') ? 'monthly' : '1st_of_every_month';
        if ($freq === 'monthly') {
            try {
                $lastDue = (new DateTimeImmutable($exclusiveEndYmd))->modify('-1 month')->format('Y-m-d');

                return bmp_hasMonthlyPostedOrSkippedForDueYmd($pdo, $companyId, $processId, $lastDue);
            } catch (Throwable $e) {
                return false;
            }
        }
        $ref = $lastInclusive;
        $y = (int) $ref->format('Y');
        $mo = (int) $ref->format('n');
        $lastYm = $ref->format('Y-n');
        $startYm = (new DateTimeImmutable($startDate))->format('Y-n');
        if ($startDayOfMonth !== 1 && $startYm === $lastYm) {
            return isPartialFirstMonthAlreadyPosted($pdo, $companyId, $processId);
        }
        return hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $companyId, $processId, $y, $mo);
    } catch (Throwable $e) {
        return false;
    }
}

/** dts_created 的日历日（仅用于少数「与创建月」相关的展示判断；算账锚点一律为 day_start）。 */
function createdYmdOrFallbackToday(array $processRow, string $todayYmd): string
{
    $raw = $processRow['dts_created'] ?? null;
    $base = $todayYmd;
    if ($raw !== null && trim((string) $raw) !== '') {
        $ts = strtotime((string) $raw);
        if ($ts !== false) {
            $base = date('Y-m-d', $ts);
        }
    }
    // Feature 3: inactive -> active 重新激活后，跳过空档不补，从重新激活当月 1 号起算——
    // 用「创建日」这条已有的门槛机制承载，与 day_start/week/monthly 各处理路径天然一致。
    $floorRaw = $processRow['accounting_reactivated_floor_ymd'] ?? null;
    if ($floorRaw !== null && trim((string) $floorRaw) !== '') {
        $floorTs = strtotime((string) $floorRaw);
        if ($floorTs !== false) {
            $floorYmd = date('Y-m-d', $floorTs);
            if ($floorYmd > $base) {
                $base = $floorYmd;
            }
        }
    }
    return $base;
}

/** Resend 后：旧数据不拿的创建日门槛用 bmp_inboxEffectiveCreatedYmd 放宽。 */
function inboxEffectiveCreatedYmdForProcess(array $processRow, string $todayYmd, ?string $parsedDayStartYmd): string
{
    $base = createdYmdOrFallbackToday($processRow, $todayYmd);
    $relax = !empty($processRow['accounting_resend_relax_created_floor']);
    return bmp_inboxEffectiveCreatedYmd($base, $parsedDayStartYmd, $relax);
}

function maxYmd(string $a, string $b): string
{
    return ($a >= $b) ? $a : $b;
}

/** Resend 后多账期：去重并按时间排序（Y-n 或 Y-m-d） */
function inboxUniqueSortedBillingMonths(array $months): array
{
    $months = array_values(array_unique(array_filter(array_map('strval', $months))));
    usort($months, static function ($a, $b) {
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $a) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $b)) {
            return strcmp($a, $b);
        }
        if (!preg_match('/^(\d{4})-(\d{1,2})$/', $a, $ma) || !preg_match('/^(\d{4})-(\d{1,2})$/', $b, $mb)) {
            return strcmp($a, $b);
        }
        $ta = (int) $ma[1] * 100 + (int) $ma[2];
        $tb = (int) $mb[1] * 100 + (int) $mb[2];
        return $ta <=> $tb;
    });
    return $months;
}

/** Day end 旁开关：有库列且 frequency=1st_of_every_month 时 OFF 不排尾段；无列或非 1st 不按此开关过滤。无列时 1st 仍走旧尾段条件。 */
function inboxDayEndTailSwitchOn(bool $hasDayEndMonthlyCapCol, array $row): bool
{
    if (!$hasDayEndMonthlyCapCol) {
        return true;
    }
    $enabledRaw = $row['day_end_monthly_cap_enabled'] ?? null;
    return in_array((string) $enabledRaw, ['1', 'true', 'TRUE'], true) || $enabledRaw === 1 || $enabledRaw === true;
}

/** Official / E-Invoice / Block 三种状态标记（与 bank_process_list.js isBankInactiveLike 一致的取值范围）。 */
function bmpIssueFlagIsLocking(?string $normalizedFlag): bool
{
    return in_array($normalizedFlag, ['official', 'e_invoice', 'block'], true);
}

/**
 * Feature 2：纯 Active（无 issue_flag）且 day_end 旁开关 OFF 时，合同/day_end 到期后不再停止出账，
 * 直到用户手动 inactive 为止。该开关仅对 1st_of_every_month 可编辑，其余 frequency 恒为 OFF
 * （前端表单已保证），因此本判断天然对所有 frequency 生效。
 * 不再区分「建档时合同是否已过期」——旧版曾对事后补录的记录用途合同维持「到期即停」，
 * 现按需求统一取消该限制：只要是纯 Active 合同，到期后一律持续出账。
 */
function bmpRowUnlimitedWindow(?string $normalizedFlag, bool $hasDayEndMonthlyCapCol, array $row): bool
{
    if (bmpIssueFlagIsLocking($normalizedFlag)) {
        return false;
    }
    if (inboxDayEndTailSwitchOn($hasDayEndMonthlyCapCol, $row)) {
        return false;
    }
    return true;
}

/**
 * 合同/day_end 到期截止日（含当日）。与 isWithinRecurringBillingWindow 内部算法一致，
 * 但只算截止日不算布尔——用于 Feature 1 首次侦测到「已到期」时把该日期冻结下来。
 */
function bmpRecurringBillingWindowEndYmd(?string $dayStartYmd, ?string $contract, ?string $dayEndYmd, ?string $frequency): ?string
{
    if ($dayStartYmd === null || trim($dayStartYmd) === '') {
        return null;
    }
    $normStart = inboxBankProcessDateFieldToYmd($dayStartYmd);
    if ($normStart === null) {
        $ts0 = strtotime($dayStartYmd);
        if ($ts0 === false) {
            return null;
        }
        $normStart = date('Y-m-d', $ts0);
    }
    $freq = ($frequency === 'monthly') ? 'monthly' : '1st_of_every_month';
    $exclusiveFirstDayAfter = contractExclusiveEndYmdForFrequency($normStart, $contract, $freq);
    $contractLastInclusive = null;
    if ($exclusiveFirstDayAfter !== null) {
        try {
            $contractLastInclusive = (new DateTimeImmutable($exclusiveFirstDayAfter))->modify('-1 day')->format('Y-m-d');
        } catch (Throwable $e) {
            $contractLastInclusive = null;
        }
    }
    $dayEndInc = null;
    if ($dayEndYmd !== null && $dayEndYmd !== '' && strtotime($dayEndYmd) !== false) {
        $dayEndInc = date('Y-m-d', strtotime($dayEndYmd));
    }
    if ($contractLastInclusive === null && $dayEndInc === null) {
        return null;
    }
    if ($contractLastInclusive !== null && $dayEndInc === null) {
        return $contractLastInclusive;
    }
    if ($contractLastInclusive === null) {
        return $dayEndInc;
    }
    return max($contractLastInclusive, $dayEndInc);
}

/**
 * Feature 1：Official / E-Invoice / Block 到期即停（不再限定 1+1/1+2/1+3），且到期后拉长 day_end 无效。
 * 首次侦测到「今天已过合同/day_end 截止日」时把截止日冻结进 issue_flag_locked_end_ymd；此后一律用冻结值代替
 * 实时 day_end 参与后续所有算账判断，因此调用方只需在拿到 $rows 后调用本函数一次，后续逻辑不必改动。
 * 未到期、或没有可算的截止日（无合同也无 day_end）时不冻结，维持“未到期正常出账”。
 */
function bmpApplyIssueFlagBillingLock(PDO $pdo, array &$row, int $companyId, string $today, bool $hasLockCol): void
{
    if (!$hasLockCol) {
        return;
    }
    $normalizedFlag = normalizeBankIssueFlagValueForInbox($row['issue_flag'] ?? null);
    if (!bmpIssueFlagIsLocking($normalizedFlag)) {
        return;
    }
    $existingLock = $row['issue_flag_locked_end_ymd'] ?? null;
    if ($existingLock !== null && trim((string) $existingLock) !== '') {
        $lockTs = strtotime((string) $existingLock);
        if ($lockTs !== false) {
            $row['day_end'] = date('Y-m-d', $lockTs);
        }
        return;
    }
    $frequency = $row['day_start_frequency'] ?? '1st_of_every_month';
    $cutoff = bmpRecurringBillingWindowEndYmd($row['day_start'] ?? null, $row['contract'] ?? null, $row['day_end'] ?? null, $frequency);
    if ($cutoff === null || $today <= $cutoff) {
        return;
    }
    // 已过截止日：冻结这一次算出的截止日，之后无论 day_end 怎么改都不再生效。
    try {
        $stmt = $pdo->prepare('UPDATE bank_process SET issue_flag_locked_end_ymd = ? WHERE id = ? AND company_id = ?');
        $stmt->execute([$cutoff, (int) ($row['id'] ?? 0), $companyId]);
    } catch (Throwable $e) {
        // 冻结失败不影响本次仍按已算出的截止日出最后一笔尾款
    }
    $row['day_end'] = $cutoff;
}

/** issue_flag / flag 归一化（与 bankProcessHelpers.js normalizeBankIssueFlag 一致）。 */
function normalizeBankIssueFlagValueForInbox($raw): string
{
    $s = strtolower(trim((string) $raw));
    $s = str_replace([' ', '-'], '_', $s);
    if ($s === '') {
        return '';
    }
    if (strpos($s, 'e_invoice') !== false) {
        return 'e_invoice';
    }
    if (strpos($s, 'official') !== false) {
        return 'official';
    }
    if (strpos($s, 'block') !== false) {
        return 'block';
    }
    return '';
}

/**
 * 1st_of_every_month + Day end 旁开关 ON：若 day_end 落在账单自然月 $billYear-$billMonth 内，则该期按 prorateInclusiveDateRange(月初, day_end) 用 process 整月价折算；否则返回 null（保持调用方已有金额）。
 */
function inboxTryDayEndMonthlyCapAmounts1stOfMonth(array $r, bool $hasDayEndMonthlyCapCol, string $frequency, int $billYear, int $billMonth): ?array
{
    if (!$hasDayEndMonthlyCapCol || $frequency !== '1st_of_every_month' || !inboxDayEndTailSwitchOn($hasDayEndMonthlyCapCol, $r)) {
        return null;
    }
    if (function_exists('bmp_shouldSkipDayEndMonthlyCapForResendCrossMonthRange') && bmp_shouldSkipDayEndMonthlyCapForResendCrossMonthRange($r)) {
        return null;
    }
    $dayEndYmd = inboxBankProcessDateFieldToYmd($r['day_end'] ?? null);
    if ($dayEndYmd === null || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayEndYmd)) {
        return null;
    }
    $tsM = mktime(0, 0, 0, $billMonth, 1, $billYear);
    if ($tsM === false) {
        return null;
    }
    $monthFirst = sprintf('%04d-%02d-01', $billYear, $billMonth);
    $monthLast = date('Y-m-t', $tsM);
    if ($dayEndYmd < $monthFirst || $dayEndYmd > $monthLast) {
        return null;
    }
    $bc = money_normalize($r['cost'] ?? '0');
    $bp = money_normalize($r['price'] ?? '0');
    $bf = money_normalize($r['profit'] ?? '0');

    return prorateInclusiveDateRange($monthFirst, $dayEndYmd, $bc, $bp, $bf);
}

/**
 * 追加一条 monthly 型 Accounting Due 行。frequency=monthly 时按「对日对月」服务区间比例（与 process_post 一致），不使用自然月末截断。
 *
 * @param '1st_of_every_month'|'monthly' $frequency
 */
function inboxAppendMonthlyNeedToday(
    array &$needToday,
    array $r,
    string $monthlyBillingMonth,
    string $frequency,
    string $createdYmd,
    $startTs,
    string $startDate,
    string $cost,
    string $price,
    string $profit,
    bool $hasDayEndMonthlyCapCol = false
): void {
    // Resend 补账行与「正常流程」补偿行各自独立计算锚点：当 Resend 选的日期撞上 process 自身
    // 持久化的 day_start 时，两边会算出同一个 monthly_billing_month，需在此去重，避免 Accounting Due 出现两条相同账单。
    $processIdForDedupe = (int) ($r['id'] ?? 0);
    foreach ($needToday as $existing) {
        if (($existing['id'] ?? null) === $processIdForDedupe
            && ($existing['monthly_billing_month'] ?? null) === $monthlyBillingMonth) {
            return;
        }
    }
    $prorationRatio = null;
    try {
        $createdDt = new DateTimeImmutable($createdYmd);
        $billY = null;
        $billMo = null;
        $dueAnchorYmd = null;
        if ($monthlyBillingMonth !== '' && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', (string) $monthlyBillingMonth, $md)) {
            $billY = (int) $md[1];
            $billMo = (int) $md[2];
            $dueAnchorYmd = sprintf('%04d-%02d-%02d', $billY, $billMo, (int) $md[3]);
        } elseif ($monthlyBillingMonth !== '' && preg_match('/^(\d{4})-(\d{1,2})$/', (string) $monthlyBillingMonth, $m)) {
            $billY = (int) $m[1];
            $billMo = (int) $m[2];
        }
        $isResendReopenLine = (
            !empty($r['accounting_resend_relax_created_floor'])
            && !empty($r['accounting_resend_single_period_from_schedule'])
            && $monthlyBillingMonth !== ''
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $monthlyBillingMonth)
        );
        if ($billY !== null && $billMo !== null) {
            $createdYm = $createdDt->format('Y-n');
            $billYm = sprintf('%04d-%d', $billY, $billMo);
            if ($isResendReopenLine && $frequency === '1st_of_every_month' && $dueAnchorYmd !== null) {
                $pr = prorateToMonthEndFromStart($dueAnchorYmd, $cost, $price, $profit);
                $cost = $pr['cost'];
                $price = $pr['price'];
                $profit = $pr['profit'];
            } elseif ($isResendReopenLine && $frequency === 'monthly' && $dueAnchorYmd !== null) {
                [$p0, $p1] = billingMonthlyAnniversaryInclusiveRangeFromDue($dueAnchorYmd, $dueAnchorYmd);
                $pr = prorateMonthlyAnniversaryPeriodLinear($p0, $p1, $p0, $cost, $price, $profit);
                $cost = $pr['cost'];
                $price = $pr['price'];
                $profit = $pr['profit'];
            } elseif ($frequency === 'monthly' && $startTs !== false && $startDate !== '') {
                $dueYmd = $dueAnchorYmd ?? bmp_monthlyDueYmdFromBillingAnchor(
                    $monthlyBillingMonth,
                    $startDate,
                    'monthly'
                );
                if ($dueYmd === null && $billY !== null && $billMo !== null) {
                    $startDay = (int) date('j', $startTs);
                    $dueYmd = billingCalendarMonthDueYmd($billY, $billMo, $startDay);
                    if ((new DateTimeImmutable($startDate))->format('Y-n') === $billYm) {
                        $dueYmd = $startDate;
                    }
                }
                if ($dueYmd === null) {
                    $dueYmd = $startDate;
                }
                [$p0, $p1] = billingMonthlyChainedInclusiveRangeFromDue($dueYmd, $startDate);
                $from = $p0;
                // Resend：用户主动补该期整月金额，不按创建日截断服务区间（否则会出现 1111→1096.66 等短天比例）。
                if (empty($r['accounting_resend_relax_created_floor']) && $createdYmd > $from) {
                    $from = $createdYmd;
                }
                if ($from <= $p1) {
                    $pr = prorateMonthlyAnniversaryPeriodLinear($p0, $p1, $from, $cost, $price, $profit);
                    $cost = $pr['cost'];
                    $price = $pr['price'];
                    $profit = $pr['profit'];
                } else {
                    $cost = '0.00000000';
                    $price = '0.00000000';
                    $profit = '0.00000000';
                }
            } elseif ($createdYm === $billYm) {
                $dueYmd = null;
                $shouldProrateMonthlyByCreatedFloor = true;
                if ($frequency === '1st_of_every_month') {
                    $dueYmd = sprintf('%04d-%02d-01', $billY, $billMo);
                    // 1st_of_every_month：始终按自然月1号起算，不按创建日截断。
                    $shouldProrateMonthlyByCreatedFloor = false;
                }
                if ($dueYmd !== null && $createdYmd > $dueYmd && $shouldProrateMonthlyByCreatedFloor) {
                    $prorateFrom = $dueYmd;
                    if ($frequency === '1st_of_every_month' && empty($r['accounting_resend_relax_created_floor'])) {
                        $prorateFrom = $createdYmd;
                    }
                    $prorationRatio = ratioRemainingDaysInMonthFromStartYmd($prorateFrom);
                    $pr = prorateToMonthEndFromStart($prorateFrom, $cost, $price, $profit);
                    $cost = $pr['cost'];
                    $price = $pr['price'];
                    $profit = $pr['profit'];
                }
            }
        }
    } catch (Throwable $e) {
        // keep base amounts
    }
    if ($monthlyBillingMonth !== '' && preg_match('/^(\d{4})-(\d{1,2})$/', (string) $monthlyBillingMonth, $mmCap)) {
        $capTry = inboxTryDayEndMonthlyCapAmounts1stOfMonth($r, $hasDayEndMonthlyCapCol, $frequency, (int) $mmCap[1], (int) $mmCap[2]);
        if ($capTry !== null) {
            $cost = $capTry['cost'];
            $price = $capTry['price'];
            $profit = $capTry['profit'];
        }
    }
    $needToday[] = [
        'id' => (int) $r['id'],
        'name' => $r['name'] ?? '',
        'bank' => $r['bank'] ?? '',
        'country' => $r['country'] ?? '',
        'day_start' => $r['day_start'] ?? null,
        'bank_process_stored_day_start' => $r['bank_process_stored_day_start'] ?? null,
        'bank_process_stored_day_end' => $r['bank_process_stored_day_end'] ?? null,
        'contract' => $r['contract'] ?? '',
        'cost' => $cost,
        'price' => $price,
        'profit' => $profit,
        'already_posted_today' => false,
        'is_partial_first_month' => false,
        'is_manual_inactive' => false,
        'is_resend_monthly_reopen' => (
            !empty($r['accounting_resend_relax_created_floor'])
            && !empty($r['accounting_resend_single_period_from_schedule'])
            && ($frequency === 'monthly' || $frequency === '1st_of_every_month')
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $monthlyBillingMonth)
        ),
        'frequency' => $frequency,
        'monthly_billing_month' => $monthlyBillingMonth,
    ];
}

/** 收费周期是否与指定自然月有日期重叠。 */
function weekPeriodOverlapsCalendarMonth(string $periodStartYmd, string $periodEndYmd, int $year, int $month): bool
{
    if ($month < 1 || $month > 12 || $year < 1970) {
        return false;
    }
    try {
        $monthStart = sprintf('%04d-%02d-01', $year, $month);
        $monthEnd = (new DateTimeImmutable($monthStart))->modify('last day of this month')->format('Y-m-d');
        return $periodStartYmd <= $monthEnd && $periodEndYmd >= $monthStart;
    } catch (Throwable $e) {
        return false;
    }
}

/** 该周收费周期（以 periodStart 为锚）是否已入账或已跳过。 */
function hasWeeklyPostedForPeriodStart(PDO $pdo, int $companyId, int $processId, string $periodStartYmd): bool
{
    try {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted
             WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?)
               AND period_type IN ('weekly','weekly_skipped')
             LIMIT 1"
        );
        $stmt->execute([$companyId, $processId, $periodStartYmd]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

function inboxAppendWeeklyNeedToday(
    array &$needToday,
    array $r,
    string $weeklyBillingStart,
    string $cost,
    string $price,
    string $profit
): void {
    $needToday[] = [
        'id' => (int) $r['id'],
        'name' => $r['name'] ?? '',
        'bank' => $r['bank'] ?? '',
        'country' => $r['country'] ?? '',
        'day_start' => $r['day_start'] ?? null,
        'contract' => 'WEEK',
        'cost' => $cost,
        'price' => $price,
        'profit' => $profit,
        'already_posted_today' => false,
        'is_partial_first_month' => false,
        'is_manual_inactive' => false,
        'is_weekly' => true,
        'weekly_billing_start' => $weeklyBillingStart,
        'monthly_billing_month' => $weeklyBillingStart,
    ];
}

/** @return string[] */
function inboxUniqueSortedWeeklyStarts(array $starts): array
{
    $uniq = array_values(array_unique(array_filter(array_map('strval', $starts))));
    sort($uniq);
    return $uniq;
}

/** 该自然日是否已入账或已从 Due 跳过（daily）。 */
function hasDailyPostedOrSkippedForDay(PDO $pdo, int $companyId, int $processId, string $dayYmd): bool
{
    try {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted
             WHERE company_id = ? AND process_id = ? AND DATE(posted_date) = DATE(?)
               AND period_type IN ('daily','daily_skipped')
             LIMIT 1"
        );
        $stmt->execute([$companyId, $processId, $dayYmd]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/** 当前自然月是否已有任意 daily 入账/跳过（用于判断是否仍可用首次合并账）。 */
function hasAnyDailyPostedInCalendarMonth(PDO $pdo, int $companyId, int $processId, int $year, int $month): bool
{
    try {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted
             WHERE company_id = ? AND process_id = ?
               AND YEAR(posted_date) = ? AND MONTH(posted_date) = ?
               AND period_type IN ('daily','daily_skipped')
             LIMIT 1"
        );
        $stmt->execute([$companyId, $processId, $year, $month]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * @return string[] 区间内尚未入账/跳过的自然日（Y-m-d，升序）。
 * Day frequency：仅按 [rangeStart, rangeEnd] 与 PAP 判断；不按 dts_created 截断当月天数
 * （「当月之前不算」已由 effectiveStart = max(day_start, 当月1号) 保证）。
 */
function dailyCollectUnpostedDaysInRange(
    PDO $pdo,
    int $companyId,
    int $processId,
    string $rangeStartYmd,
    string $rangeEndYmd
): array {
    $days = [];
    $d = $rangeStartYmd;
    while ($d !== '' && $d <= $rangeEndYmd) {
        if (!hasDailyPostedOrSkippedForDay($pdo, $companyId, $processId, $d)) {
            $days[] = $d;
        }
        $next = dailyNextDayYmd($d);
        if ($next === null) {
            break;
        }
        $d = $next;
    }
    return $days;
}

/**
 * Accounting Due 行计算服务区间时用的 frequency。
 * Resend relax 期间：Resend 行用弹窗 frequency；正常流程行用 item / 库里 stored frequency，避免 merge 后的 process frequency 污染展示。
 */
function inboxEffectiveFrequencyForBillingPeriodItem(array $item, array $process, bool $hasFrequency): string
{
    if (!$hasFrequency) {
        return '1st_of_every_month';
    }
    if (!empty($item['is_resend_monthly_reopen'])) {
        $fq = strtolower(trim((string) ($item['frequency'] ?? '')));
        if (in_array($fq, ['1st_of_every_month', 'monthly'], true)) {
            return $fq;
        }

        return (string) ($process['day_start_frequency'] ?? '1st_of_every_month');
    }
    if (!empty($item['is_weekly'])) {
        return 'week';
    }
    if (!empty($item['is_daily']) || !empty($item['is_daily_consolidated'])) {
        return 'day';
    }
    if (!empty($item['is_once_one_off'])) {
        return 'once';
    }
    $itemFq = strtolower(trim((string) ($item['frequency'] ?? '')));
    if (in_array($itemFq, ['1st_of_every_month', 'monthly', 'week', 'day', 'once'], true)) {
        return $itemFq;
    }
    if (!empty($process['accounting_resend_relax_created_floor'])) {
        $storedFq = strtolower(trim((string) (
            $process['bank_process_stored_day_start_frequency']
            ?? $item['bank_process_stored_day_start_frequency']
            ?? ''
        )));
        if (in_array($storedFq, ['1st_of_every_month', 'monthly', 'week', 'day', 'once'], true)) {
            return $storedFq;
        }
    }

    return (string) ($process['day_start_frequency'] ?? '1st_of_every_month');
}

/**
 * Accounting Due 行：计算本笔账单服务区间（含首尾日，Y-m-d）。
 *
 * @return array{0:?string,1:?string}
 */
function inboxComputeBillingPeriodRangeForItem(array $item, array $process, bool $hasDayEndMonthlyCapCol, bool $hasFrequency): array
{
    $freq = inboxEffectiveFrequencyForBillingPeriodItem($item, $process, $hasFrequency);

    if (!empty($item['is_resend_monthly_reopen'])) {
        $bmResend = trim((string) ($item['monthly_billing_month'] ?? ''));
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $bmResend)) {
            $resendFreq = (string) ($item['frequency'] ?? $freq);
            if ($resendFreq === 'monthly') {
                [, $p1] = billingMonthlyAnniversaryInclusiveRangeFromDue($bmResend, $bmResend);

                return [$bmResend, $p1];
            }
            try {
                $monthEnd = (new DateTimeImmutable($bmResend))->modify('last day of this month')->format('Y-m-d');

                return [$bmResend, $monthEnd];
            } catch (Throwable $e) {
                return [$bmResend, $bmResend];
            }
        }
    }

    $dayStartYmd = inboxBankProcessDateFieldToYmd($item['day_start'] ?? $process['day_start'] ?? null);
    $dayEndYmd = !empty($item['is_resend_consolidated_range'])
        ? inboxBankProcessDateFieldToYmd($item['day_end'] ?? $process['day_end'] ?? null)
        : inboxBankProcessDateFieldToYmd($process['day_end'] ?? null);
    if (!empty($process['accounting_resend_relax_created_floor'])
        && empty($item['is_resend_monthly_reopen'])
        && empty($item['is_resend_consolidated_range'])) {
        $storedStart = inboxBankProcessDateFieldToYmd($process['bank_process_stored_day_start'] ?? $item['bank_process_stored_day_start'] ?? null);
        if ($storedStart !== null) {
            $dayStartYmd = $storedStart;
        }
        $storedEnd = inboxBankProcessDateFieldToYmd($process['bank_process_stored_day_end'] ?? $item['bank_process_stored_day_end'] ?? null);
        if ($storedEnd !== null) {
            $dayEndYmd = $storedEnd;
        }
    }

    if (!empty($item['is_once_one_off'])) {
        return [$dayStartYmd, $dayStartYmd];
    }
    if (!empty($item['is_weekly'])) {
        $ws = inboxBankProcessDateFieldToYmd($item['weekly_billing_start'] ?? $item['monthly_billing_month'] ?? null);
        if ($ws === null) {
            return [null, null];
        }
        $we = weekPeriodEndInclusiveYmd($ws);

        return [$ws, $we ?? $ws];
    }
    if (!empty($item['is_daily_consolidated'])) {
        $ds = inboxBankProcessDateFieldToYmd($item['daily_billing_start'] ?? null);
        $de = inboxBankProcessDateFieldToYmd($item['daily_billing_end'] ?? null);
        if ($ds === null || $de === null) {
            $rangeRaw = trim((string) ($item['monthly_billing_month'] ?? ''));
            if (strpos($rangeRaw, '|') !== false) {
                [$rawStart, $rawEnd] = explode('|', $rangeRaw, 2);
                $ds = inboxBankProcessDateFieldToYmd($rawStart);
                $de = inboxBankProcessDateFieldToYmd($rawEnd);
            }
        }

        return [$ds, $de ?? $ds];
    }
    if (!empty($item['is_daily'])) {
        $d = inboxBankProcessDateFieldToYmd($item['daily_billing_start'] ?? $item['monthly_billing_month'] ?? null);

        return [$d, $d];
    }
    if (!empty($item['is_resend_consolidated_range'])) {
        return [$dayStartYmd, $dayEndYmd ?? $dayStartYmd];
    }
    if (!empty($item['is_partial_first_month'])) {
        if ($dayStartYmd === null) {
            return [null, null];
        }
        try {
            $end = (new DateTimeImmutable($dayStartYmd))->modify('last day of this month')->format('Y-m-d');
        } catch (Throwable $e) {
            return [$dayStartYmd, $dayStartYmd];
        }

        return [$dayStartYmd, $end];
    }
    if (!empty($item['is_day_end_tail'])) {
        if ($dayStartYmd === null || $dayEndYmd === null) {
            return [null, null];
        }
        $contract = $process['contract'] ?? null;
        $exclusiveEnd = contractExclusiveEndYmdForFrequency($dayStartYmd, $contract, $freq);
        if ($exclusiveEnd === null) {
            return [null, null];
        }
        $useSwitchGatedTail = ($freq === '1st_of_every_month' && $hasDayEndMonthlyCapCol && inboxDayEndTailSwitchOn($hasDayEndMonthlyCapCol, $process));
        if ($useSwitchGatedTail) {
            try {
                $monthFirst = (new DateTimeImmutable($dayEndYmd))->modify('first day of this month')->format('Y-m-d');
            } catch (Throwable $e) {
                return [null, null];
            }
            $tailFrom = max($exclusiveEnd, $monthFirst);
            if ($tailFrom > $dayEndYmd) {
                return [null, null];
            }

            return [$tailFrom, $dayEndYmd];
        }
        if ($dayEndYmd < $exclusiveEnd) {
            return [null, null];
        }

        return [$exclusiveEnd, $dayEndYmd];
    }
    if (!empty($item['is_manual_inactive'])) {
        return [$dayStartYmd, $dayEndYmd ?? $dayStartYmd];
    }

    $bm = trim((string) ($item['monthly_billing_month'] ?? ''));
    if ($bm !== '' && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $bm, $md)
        && $freq === 'monthly' && $dayStartYmd !== null) {
        $dueYmd = sprintf('%04d-%02d-%02d', (int) $md[1], (int) $md[2], (int) $md[3]);
        [$p0, $p1] = billingMonthlyChainedInclusiveRangeFromDue($dueYmd, $dayStartYmd);

        return [$p0, $p1];
    }
    if ($bm !== '' && preg_match('/^(\d{4})-(\d{1,2})$/', $bm, $m)) {
        $billY = (int) $m[1];
        $billMo = (int) $m[2];
        if ($freq === 'monthly' && $dayStartYmd !== null) {
            $dueYmd = bmp_monthlyDueYmdFromBillingAnchor($bm, $dayStartYmd, 'monthly');
            if ($dueYmd !== null) {
                [$p0, $p1] = billingMonthlyChainedInclusiveRangeFromDue($dueYmd, $dayStartYmd);

                return [$p0, $p1];
            }
        }

        $monthFirst = sprintf('%04d-%02d-01', $billY, $billMo);
        $monthLast = date('Y-m-t', mktime(0, 0, 0, $billMo, 1, $billY));
        if ($freq === '1st_of_every_month' && $dayStartYmd !== null) {
            try {
                $startDt = new DateTimeImmutable($dayStartYmd);
                if ($startDt->format('Y-n') === sprintf('%04d-%d', $billY, $billMo)) {
                    if ((int) $startDt->format('j') === 1) {
                        return [$dayStartYmd, $monthLast];
                    }
                }
            } catch (Throwable $e) {
                // fall through
            }
        }
        if ($freq === '1st_of_every_month'
            && $hasDayEndMonthlyCapCol
            && inboxDayEndTailSwitchOn($hasDayEndMonthlyCapCol, $process)
            && $dayEndYmd !== null
            && $dayEndYmd >= $monthFirst
            && $dayEndYmd <= $monthLast
            && $dayEndYmd < $monthLast) {
            return [$monthFirst, $dayEndYmd];
        }

        return [$monthFirst, $monthLast];
    }

    return [$dayStartYmd, $dayStartYmd];
}

/** @param array<int, array<string, mixed>> $processById */
function inboxEnrichNeedTodayBillingPeriods(array &$needToday, array $processById, bool $hasDayEndMonthlyCapCol, bool $hasFrequency): void
{
    foreach ($needToday as &$row) {
        $process = $processById[(int) ($row['id'] ?? 0)] ?? [];
        $processDayStart = $process['day_start'] ?? $row['day_start'] ?? null;
        $storedDayStart = $process['bank_process_stored_day_start'] ?? $row['bank_process_stored_day_start'] ?? null;
        $storedDayEnd = $process['bank_process_stored_day_end'] ?? $row['bank_process_stored_day_end'] ?? null;
        // Resend relax 期间：START DATE 始终显示库里真实 day_start，不因最新 Resend 日期而改变。
        // 但 consolidated range 本身就是「按 Resend 弹窗日期」出的合并账单，它的 day_start/day_end
        // 早已在生成阶段被换成弹窗日期，这里不能再换回库里原 day_start，否则显示会跑回 Resend 前的旧日期。
        if (!empty($process['accounting_resend_relax_created_floor']) && empty($row['is_resend_consolidated_range'])) {
            if ($storedDayStart !== null && trim((string) $storedDayStart) !== '') {
                $row['day_start'] = $storedDayStart;
            }
            if ($storedDayEnd !== null && trim((string) $storedDayEnd) !== '') {
                $row['day_end'] = $storedDayEnd;
            }
        } elseif (empty($row['is_resend_consolidated_range']) && $processDayStart !== null && trim((string) $processDayStart) !== '') {
            $row['day_start'] = $processDayStart;
        }
        [$start, $end] = inboxComputeBillingPeriodRangeForItem($row, $process, $hasDayEndMonthlyCapCol, $hasFrequency);
        $row['billing_period_start'] = $start;
        $row['billing_period_end'] = $end;
        $row['display_frequency'] = inboxEffectiveFrequencyForBillingPeriodItem($row, $process, $hasFrequency);
    }
    unset($row);
}

function inboxAppendDailyNeedToday(
    array &$needToday,
    array $r,
    string $dailyBillingDay,
    string $cost,
    string $price,
    string $profit
): void {
    $needToday[] = [
        'id' => (int) $r['id'],
        'name' => $r['name'] ?? '',
        'bank' => $r['bank'] ?? '',
        'country' => $r['country'] ?? '',
        'day_start' => $r['day_start'] ?? null,
        'contract' => 'DAY',
        'cost' => $cost,
        'price' => $price,
        'profit' => $profit,
        'already_posted_today' => false,
        'is_partial_first_month' => false,
        'is_manual_inactive' => false,
        'is_daily' => true,
        'is_daily_consolidated' => false,
        'daily_billing_start' => $dailyBillingDay,
        'monthly_billing_month' => $dailyBillingDay,
    ];
}

function inboxAppendDailyConsolidatedNeedToday(
    array &$needToday,
    array $r,
    string $rangeStartYmd,
    string $rangeEndYmd,
    string $displayTodayYmd,
    string $cost,
    string $price,
    string $profit
): void {
    $needToday[] = [
        'id' => (int) $r['id'],
        'name' => $r['name'] ?? '',
        'bank' => $r['bank'] ?? '',
        'country' => $r['country'] ?? '',
        'day_start' => $r['day_start'] ?? null,
        'contract' => 'DAY',
        'cost' => $cost,
        'price' => $price,
        'profit' => $profit,
        'already_posted_today' => false,
        'is_partial_first_month' => false,
        'is_manual_inactive' => false,
        'is_daily' => true,
        'is_daily_consolidated' => true,
        'daily_billing_start' => $rangeStartYmd,
        'daily_billing_end' => $rangeEndYmd,
        'monthly_billing_month' => $rangeStartYmd . '|' . $rangeEndYmd,
    ];
}

/** 该自然月是否已有 monthly / monthly_skipped（用于判断本期是否已处理） */
function hasMonthlyPostedOrSkippedInCalendarMonth(PDO $pdo, int $companyId, int $processId, int $year, int $month): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND YEAR(posted_date) = ? AND MONTH(posted_date) = ? AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '') LIMIT 1");
    $stmt->execute([$companyId, $processId, $year, $month]);
    return (bool) $stmt->fetch();
}

/** Monthly 先付：按应付日判断是否已入账/跳过；其它频率仍按自然月。 */
function inboxHasMonthlyPeriodPosted(
    PDO $pdo,
    int $companyId,
    int $processId,
    string $frequency,
    int $year,
    int $month,
    string $dueYmd
): bool {
    if ($frequency === 'monthly') {
        return bmp_hasMonthlyPostedOrSkippedForDueYmd($pdo, $companyId, $processId, $dueYmd);
    }
    return hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $companyId, $processId, $year, $month);
}

/**
 * Monthly（prepaid）账期入列：Resend 单期用应付日 Y-m-d 作 billing_month 锚点，与正常流程 Y-n 区分。
 *
 * @return string[] billing anchors (Y-n 或 Y-m-d)
 */
function inboxCollectMonthlyPrepaidBillingAnchors(
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $startDate,
    int $startTs,
    string $createdYmd,
    ?string $contract,
    ?string $dayEnd,
    bool $resendRelax,
    bool $resendSinglePeriod
): array {
    $unlimitedWindow = !empty($r['__unlimited_window']);
    if (!isWithinRecurringBillingWindow($today, $r['day_start'] ?? null, $contract, $dayEnd, 'monthly', $resendRelax, $resendSinglePeriod, $unlimitedWindow)) {
        return [];
    }
    $processId = (int) ($r['id'] ?? 0);
    if ($processId <= 0 || $startDate === '') {
        return [];
    }
    $onlyAnchorYmMonthly = null;
    if ($resendSinglePeriod) {
        try {
            $onlyAnchorYmMonthly = (new DateTimeImmutable($startDate))->format('Y-n');
        } catch (Throwable $e) {
            $onlyAnchorYmMonthly = null;
        }
    }
    // Feature 2：到期不再停时，合同天然结束日不再截断链式月付账期，交给 endCap（今天所在月）自然限速。
    $term = $unlimitedWindow ? null : getBillingTermMonthsFromContract($contract);
    $exclusiveEnd = ($term !== null && $term >= 1) ? billingContractExclusiveEndYmdMonthlyAfterPartialFirst($startDate, $term) : null;

    $anchors = billingCollectMonthlyChainedDueAnchors(
        $startDate,
        $today,
        $createdYmd,
        $exclusiveEnd,
        $resendRelax,
        $resendSinglePeriod,
        $onlyAnchorYmMonthly,
        static function (string $due, int $y, int $mo, string $dueYm) use ($pdo, $companyId, $processId): bool {
            return !inboxHasMonthlyPeriodPosted($pdo, $companyId, $processId, 'monthly', $y, $mo, $due);
        }
    );

    return inboxUniqueSortedBillingMonths($anchors);
}

/**
 * Resend relax：为全部 open 锚点各追加一行补账单（可多条并存；频率取自 JSON 元数据）。
 */
function inboxAppendResendOpenAnchorRows(
    array &$needToday,
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $baseCost,
    string $basePrice,
    string $baseProfit,
    bool $hasDayEndMonthlyCapCol
): void {
    if (empty($r['accounting_resend_relax_created_floor'])) {
        return;
    }
    $entries = bmp_getResendOpenAnchorEntriesFromRow($r);
    if (empty($entries)) {
        return;
    }
    $processId = (int) ($r['id'] ?? 0);
    if ($processId <= 0) {
        return;
    }
    $storedRaw = $r['bank_process_stored_day_start'] ?? null;
    $storedYmd = $storedRaw !== null ? inboxBankProcessDateFieldToYmd((string) $storedRaw) : null;
    $storedDayEnd = $r['bank_process_stored_day_end'] ?? null;

    foreach ($entries as $entry) {
        $anchorYmd = $entry['anchor'] ?? '';
        $frequency = bmp_normalizeResendOpenAnchorFrequency($entry['frequency'] ?? null);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $anchorYmd)) {
            continue;
        }
        if ($frequency === 'week') {
            if (!hasWeeklyPostedForPeriodStart($pdo, $companyId, $processId, $anchorYmd)) {
                $rWeek = $r;
                if ($storedRaw !== null && trim((string) $storedRaw) !== '') {
                    $rWeek['day_start'] = $storedRaw;
                }
                if ($storedDayEnd !== null && trim((string) $storedDayEnd) !== '') {
                    $rWeek['day_end'] = $storedDayEnd;
                }
                inboxAppendWeeklyNeedToday($needToday, $rWeek, $anchorYmd, $baseCost, $basePrice, $baseProfit);
            }
            continue;
        }
        if ($frequency === 'day') {
            if (!hasDailyPostedOrSkippedForDay($pdo, $companyId, $processId, $anchorYmd)) {
                $rDay = $r;
                if ($storedRaw !== null && trim((string) $storedRaw) !== '') {
                    $rDay['day_start'] = $storedRaw;
                }
                inboxAppendDailyNeedToday($needToday, $rDay, $anchorYmd, $baseCost, $basePrice, $baseProfit);
            }
            continue;
        }
        if ($frequency === 'once') {
            if (!inbox_isOnceOneOffAlreadyHandled($pdo, $companyId, $processId)) {
                $rOnce = $r;
                $rOnce['day_start'] = $anchorYmd;
                $needToday[] = [
                    'id' => $processId,
                    'name' => $r['name'] ?? '',
                    'bank' => $r['bank'] ?? '',
                    'country' => $r['country'] ?? '',
                    'day_start' => $anchorYmd,
                    'contract' => 'ONCE',
                    'cost' => $baseCost,
                    'price' => $basePrice,
                    'profit' => $baseProfit,
                    'already_posted_today' => false,
                    'is_partial_first_month' => false,
                    'is_manual_inactive' => false,
                    'is_once_one_off' => true,
                ];
            }
            continue;
        }
        if (!in_array($frequency, ['monthly', '1st_of_every_month'], true)) {
            $frequency = '1st_of_every_month';
        }
        if (bmp_hasMonthlyPostedOrSkippedForDueYmd($pdo, $companyId, $processId, $anchorYmd)) {
            continue;
        }
        // 1st_of_every_month + 非1号真实 day_start：该锚点落在首月（partial first month）区间时，
        // 已由 Step 1「Partial first month」块负责生成（含 relax/resendSinglePeriod 情形），
        // 此处不再重复生成，否则同一期会在 Accounting Due 出现两行重复账单。
        if ($frequency === '1st_of_every_month' && $storedYmd !== null) {
            $storedTs = strtotime($storedYmd);
            if ($storedTs !== false && (int) date('j', $storedTs) !== 1) {
                try {
                    $storedYm = (new DateTimeImmutable($storedYmd))->format('Y-n');
                    $anchorYm = (new DateTimeImmutable($anchorYmd))->format('Y-n');
                    if ($storedYm === $anchorYm) {
                        continue;
                    }
                } catch (Throwable $e) {
                    // fall through and let normal dedupe/appending logic handle it
                }
            }
        }
        $anchorTs = strtotime($anchorYmd);
        if ($anchorTs === false) {
            continue;
        }
        $rResend = $r;
        $rResend['accounting_resend_single_period_from_schedule'] = 1;
        $rResend['day_start_frequency'] = $frequency;
        if ($storedRaw !== null && trim((string) $storedRaw) !== '') {
            $rResend['day_start'] = $storedRaw;
        }
        if ($storedDayEnd !== null && trim((string) $storedDayEnd) !== '') {
            $rResend['day_end'] = $storedDayEnd;
        }
        $createdYmd = inboxEffectiveCreatedYmdForProcess($rResend, $today, $anchorYmd);
        inboxAppendMonthlyNeedToday(
            $needToday,
            $rResend,
            $anchorYmd,
            $frequency,
            $createdYmd,
            $anchorTs,
            $anchorYmd,
            $baseCost,
            $basePrice,
            $baseProfit,
            $hasDayEndMonthlyCapCol
        );
    }
}

/**
 * 1st_of_every_month 账期入列：Resend 单期用 schedule day_start (Y-m-d) 作锚点，与正常流程 Y-n 区分。
 *
 * @return string[] billing anchors (Y-n 或 Y-m-d)
 */
function inboxCollectFirstOfMonthBillingAnchors(
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $startDate,
    int $startTs,
    string $createdYmd,
    ?string $contract,
    ?string $dayEnd,
    bool $resendRelax,
    bool $resendSinglePeriod
): array {
    $unlimitedWindow = !empty($r['__unlimited_window']);
    if (!isWithinRecurringBillingWindow($today, $r['day_start'] ?? null, $contract, $dayEnd, '1st_of_every_month', $resendRelax, $resendSinglePeriod, $unlimitedWindow)) {
        return [];
    }
    $processId = (int) ($r['id'] ?? 0);
    if ($processId <= 0 || $startDate === '') {
        return [];
    }

    if ($resendSinglePeriod) {
        if (!$resendRelax) {
            return [];
        }
        if (!bmp_hasMonthlyPostedOrSkippedForDueYmd($pdo, $companyId, $processId, $startDate)) {
            return [$startDate];
        }
        return [];
    }

    $anchors = [];
    $startDayOfMonth = (int) date('j', $startTs);
    try {
        $todayYm = (new DateTimeImmutable($today))->format('Y-n');
        if ($startDayOfMonth === 1) {
            $startYm = (new DateTimeImmutable($startDate))->format('Y-n');
            $billYear = (int) date('Y', $startTs);
            $billMonth = (int) date('n', $startTs);
            // 非 Resend：仅当前自然月；Resend 多期可回补历史月。
            $includeStartMonth = $resendRelax || $startYm === $todayYm;
            if ($includeStartMonth
                && $today >= $startDate
                && !hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $companyId, $processId, $billYear, $billMonth)) {
                $anchors[] = $startYm;
            }
        }
        $firstAccountingTs = strtotime('first day of next month', $startTs);
        $firstAccountingDate = $firstAccountingTs !== false ? date('Y-m-d', $firstAccountingTs) : '';
        if ($firstAccountingDate === '' || (!$resendRelax && $today < $firstAccountingDate)) {
            return inboxUniqueSortedBillingMonths($anchors);
        }
        $iter = new DateTimeImmutable($firstAccountingDate);
        $iter = $iter->modify('first day of this month');
        $endCap = (new DateTimeImmutable($today))->modify('first day of this month');
        if ($resendRelax && $iter > $endCap) {
            $endCap = $iter;
        }
        // Feature 2：到期不再停时，合同天然结束日与首段月数上限都不再截断，交给 endCap（今天所在月）自然限速。
        $term = $unlimitedWindow ? null : getBillingTermMonthsFromContract($contract);
        $exclusiveEnd = ($term !== null && $term >= 1) ? billingContractExclusiveEndYmdFirstOfMonth($startDate, $term) : null;
        $anchorMonthCap = $unlimitedWindow ? null : inboxAnchorMonthCapAfterPartialFirst($contract, $startDayOfMonth);
        $anchorSlotIndex = 0;
        while ($iter <= $endCap) {
            if ($anchorMonthCap !== null && $anchorSlotIndex >= $anchorMonthCap) {
                break;
            }
            $y = (int) $iter->format('Y');
            $mo = (int) $iter->format('n');
            $firstOfThis = $iter->format('Y-m-d');
            if ($exclusiveEnd !== null && $firstOfThis >= $exclusiveEnd) {
                break;
            }
            $billYm = $iter->format('Y-n');
            if (!$resendRelax && $billYm !== $todayYm) {
                $anchorSlotIndex++;
                $iter = $iter->modify('+1 month');
                continue;
            }
            $effectiveDue = maxYmd($firstOfThis, $createdYmd);
            if (($today >= $effectiveDue || $resendRelax)
                && !hasMonthlyPostedOrSkippedInCalendarMonth($pdo, $companyId, $processId, $y, $mo)) {
                $anchors[] = $billYm;
            }
            $anchorSlotIndex++;
            $iter = $iter->modify('+1 month');
        }
    } catch (Throwable $e) {
        return inboxUniqueSortedBillingMonths($anchors);
    }
    return inboxUniqueSortedBillingMonths($anchors);
}

/** Resend relax 期间：库里真实 frequency（与弹窗 frequency 解耦）。 */
function inboxStoredNormalFlowFrequency(array $r): string
{
    $fq = strtolower(trim((string) ($r['bank_process_stored_day_start_frequency'] ?? '')));
    if (in_array($fq, ['1st_of_every_month', 'monthly', 'week', 'day', 'once'], true)) {
        return $fq;
    }
    return '1st_of_every_month';
}

/**
 * Resend 单期：按库里真实 frequency 补回正常流程账单（与 Resend 弹窗 frequency 无关，两条并存）。
 */
function inboxAppendStoredNormalFlowIfNeeded(
    array &$needToday,
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $baseCost,
    string $basePrice,
    string $baseProfit,
    bool $hasDayEndMonthlyCapCol
): void {
    if (empty($r['accounting_resend_relax_created_floor']) || empty($r['accounting_resend_single_period_from_schedule'])) {
        return;
    }
    $storedFq = inboxStoredNormalFlowFrequency($r);
    if ($storedFq === '1st_of_every_month') {
        inboxAppendStoredFirstOfMonthNormalFlowIfNeeded(
            $needToday,
            $pdo,
            $companyId,
            $r,
            $today,
            $baseCost,
            $basePrice,
            $baseProfit,
            $hasDayEndMonthlyCapCol
        );
    } elseif ($storedFq === 'monthly') {
        inboxAppendStoredMonthlyNormalFlowIfNeeded(
            $needToday,
            $pdo,
            $companyId,
            $r,
            $today,
            $baseCost,
            $basePrice,
            $baseProfit,
            $hasDayEndMonthlyCapCol
        );
    } elseif ($storedFq === 'week') {
        inboxAppendStoredWeeklyNormalFlowIfNeeded(
            $needToday,
            $pdo,
            $companyId,
            $r,
            $today,
            $baseCost,
            $basePrice,
            $baseProfit
        );
    } elseif ($storedFq === 'day') {
        inboxAppendStoredDailyNormalFlowIfNeeded(
            $needToday,
            $pdo,
            $companyId,
            $r,
            $today,
            $baseCost,
            $basePrice,
            $baseProfit
        );
    }
}

/** Resend 单期与库里真实 day_start 不同时，额外排正常流程账单（不覆盖原流程）。 */
function inboxAppendStoredMonthlyNormalFlowIfNeeded(
    array &$needToday,
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $baseCost,
    string $basePrice,
    string $baseProfit,
    bool $hasDayEndMonthlyCapCol
): void {
    if (empty($r['accounting_resend_relax_created_floor']) || empty($r['accounting_resend_single_period_from_schedule'])) {
        return;
    }
    $storedRaw = $r['bank_process_stored_day_start'] ?? null;
    if ($storedRaw === null || trim((string) $storedRaw) === '') {
        return;
    }
    $storedYmd = inboxBankProcessDateFieldToYmd((string) $storedRaw);
    if ($storedYmd === null) {
        return;
    }
    $rNormal = $r;
    $rNormal['day_start'] = $storedRaw;
    $rNormal['day_start_frequency'] = 'monthly';
    $storedDayEnd = $r['bank_process_stored_day_end'] ?? null;
    if ($storedDayEnd !== null && trim((string) $storedDayEnd) !== '') {
        $rNormal['day_end'] = $storedDayEnd;
    }
    unset($rNormal['accounting_resend_single_period_from_schedule'], $rNormal['accounting_resend_consolidated_range']);
    $rNormal['accounting_resend_relax_created_floor'] = 0;

    $startDate = $storedYmd;
    $startTs = strtotime($startDate);
    if ($startTs === false) {
        return;
    }
    $createdYmd = inboxEffectiveCreatedYmdForProcess($rNormal, $today, $startDate);
    $contract = $rNormal['contract'] ?? null;
    $dayEnd = $rNormal['day_end'] ?? null;
    $anchors = inboxCollectMonthlyPrepaidBillingAnchors(
        $pdo,
        $companyId,
        $rNormal,
        $today,
        $startDate,
        $startTs,
        $createdYmd,
        $contract,
        $dayEnd,
        false,
        false
    );
    foreach ($anchors as $bm) {
        inboxAppendMonthlyNeedToday(
            $needToday,
            $rNormal,
            $bm,
            'monthly',
            $createdYmd,
            $startTs,
            $startDate,
            $baseCost,
            $basePrice,
            $baseProfit,
            $hasDayEndMonthlyCapCol
        );
    }
}

/** 1st_of_every_month: Resend 单期开账时，补回当前正常流程账单（与 Resend 行并存）。 */
function inboxAppendStoredFirstOfMonthNormalFlowIfNeeded(
    array &$needToday,
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $baseCost,
    string $basePrice,
    string $baseProfit,
    bool $hasDayEndMonthlyCapCol
): void {
    if (empty($r['accounting_resend_relax_created_floor']) || empty($r['accounting_resend_single_period_from_schedule'])) {
        return;
    }
    $storedRaw = $r['bank_process_stored_day_start'] ?? null;
    if ($storedRaw === null || trim((string) $storedRaw) === '') {
        return;
    }
    $storedYmd = inboxBankProcessDateFieldToYmd((string) $storedRaw);
    if ($storedYmd === null) {
        return;
    }

    $rNormal = $r;
    $rNormal['day_start'] = $storedRaw;
    $rNormal['day_start_frequency'] = '1st_of_every_month';
    $storedDayEnd = $r['bank_process_stored_day_end'] ?? null;
    if ($storedDayEnd !== null && trim((string) $storedDayEnd) !== '') {
        $rNormal['day_end'] = $storedDayEnd;
    }
    unset($rNormal['accounting_resend_single_period_from_schedule'], $rNormal['accounting_resend_consolidated_range']);
    $rNormal['accounting_resend_relax_created_floor'] = 0;

    $startDate = $storedYmd;
    $startTs = strtotime($startDate);
    if ($startTs === false) {
        return;
    }
    $createdYmd = inboxEffectiveCreatedYmdForProcess($rNormal, $today, $startDate);
    $contract = $rNormal['contract'] ?? null;
    $dayEnd = $rNormal['day_end'] ?? null;
    $anchors = inboxCollectFirstOfMonthBillingAnchors(
        $pdo,
        $companyId,
        $rNormal,
        $today,
        $startDate,
        $startTs,
        $createdYmd,
        $contract,
        $dayEnd,
        false,
        false
    );
    foreach ($anchors as $bm) {
        inboxAppendMonthlyNeedToday(
            $needToday,
            $rNormal,
            $bm,
            '1st_of_every_month',
            $createdYmd,
            $startTs,
            $startDate,
            $baseCost,
            $basePrice,
            $baseProfit,
            $hasDayEndMonthlyCapCol
        );
    }
}

/** Resend 单期：按库里真实 week frequency 补回正常周账单。 */
function inboxAppendStoredWeeklyNormalFlowIfNeeded(
    array &$needToday,
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $baseCost,
    string $basePrice,
    string $baseProfit
): void {
    if (empty($r['accounting_resend_relax_created_floor']) || empty($r['accounting_resend_single_period_from_schedule'])) {
        return;
    }
    $storedRaw = $r['bank_process_stored_day_start'] ?? null;
    if ($storedRaw === null || trim((string) $storedRaw) === '') {
        return;
    }
    $storedYmd = inboxBankProcessDateFieldToYmd((string) $storedRaw);
    if ($storedYmd === null) {
        return;
    }
    $rNormal = $r;
    $rNormal['day_start'] = $storedRaw;
    $rNormal['day_start_frequency'] = 'week';
    $storedDayEnd = $r['bank_process_stored_day_end'] ?? null;
    if ($storedDayEnd !== null && trim((string) $storedDayEnd) !== '') {
        $rNormal['day_end'] = $storedDayEnd;
    }
    unset($rNormal['accounting_resend_single_period_from_schedule'], $rNormal['accounting_resend_consolidated_range']);
    $rNormal['accounting_resend_relax_created_floor'] = 0;

    $startDate = $storedYmd;
    $startTs = strtotime($startDate);
    if ($startTs === false) {
        return;
    }
    $createdYmd = inboxEffectiveCreatedYmdForProcess($rNormal, $today, $startDate);
    $processIdWeek = (int) ($rNormal['id'] ?? 0);
    if ($processIdWeek <= 0) {
        return;
    }
    $queuedWeeklyStarts = [];
    try {
        $periodStartYmd = $startDate;
        while ($periodStartYmd !== '') {
            $due = $periodStartYmd;
            $periodEnd = weekPeriodEndInclusiveYmd($due);
            if ($periodEnd === null) {
                break;
            }
            if ($due > $today) {
                break;
            }
            if ($due < $createdYmd) {
                $createdYear = (int) date('Y', strtotime($createdYmd));
                $createdMonth = (int) date('n', strtotime($createdYmd));
                if (!weekPeriodOverlapsCalendarMonth($due, $periodEnd, $createdYear, $createdMonth)) {
                    $next = weekPeriodNextStartYmd($due);
                    if ($next === null) {
                        break;
                    }
                    $periodStartYmd = $next;
                    continue;
                }
            }
            if (weekPeriodIsReadyForAccounting($due, $today, false)
                && !hasWeeklyPostedForPeriodStart($pdo, $companyId, $processIdWeek, $due)) {
                $queuedWeeklyStarts[] = $due;
            }
            $next = weekPeriodNextStartYmd($due);
            if ($next === null) {
                break;
            }
            $periodStartYmd = $next;
        }
    } catch (Throwable $e) {
        return;
    }
    foreach (inboxUniqueSortedWeeklyStarts($queuedWeeklyStarts) as $ws) {
        inboxAppendWeeklyNeedToday($needToday, $rNormal, $ws, $baseCost, $basePrice, $baseProfit);
    }
}

/** Resend 单期：按库里真实 day frequency 补回正常日账单。 */
function inboxAppendStoredDailyNormalFlowIfNeeded(
    array &$needToday,
    PDO $pdo,
    int $companyId,
    array $r,
    string $today,
    string $baseCost,
    string $basePrice,
    string $baseProfit
): void {
    if (empty($r['accounting_resend_relax_created_floor']) || empty($r['accounting_resend_single_period_from_schedule'])) {
        return;
    }
    $storedRaw = $r['bank_process_stored_day_start'] ?? null;
    if ($storedRaw === null || trim((string) $storedRaw) === '') {
        return;
    }
    $storedYmd = inboxBankProcessDateFieldToYmd((string) $storedRaw);
    if ($storedYmd === null) {
        return;
    }
    $rNormal = $r;
    $rNormal['day_start'] = $storedRaw;
    $rNormal['day_start_frequency'] = 'day';
    $storedDayEnd = $r['bank_process_stored_day_end'] ?? null;
    if ($storedDayEnd !== null && trim((string) $storedDayEnd) !== '') {
        $rNormal['day_end'] = $storedDayEnd;
    }
    unset($rNormal['accounting_resend_single_period_from_schedule'], $rNormal['accounting_resend_consolidated_range']);
    $rNormal['accounting_resend_relax_created_floor'] = 0;

    $startDate = $storedYmd;
    $processIdDay = (int) ($rNormal['id'] ?? 0);
    if ($processIdDay <= 0) {
        return;
    }
    $monthFirstYmd = $today;
    try {
        $monthFirstYmd = (new DateTimeImmutable($today))->modify('first day of this month')->format('Y-m-d');
    } catch (Throwable $e) {
        // keep $today
    }
    $effectiveStart = max($startDate, $monthFirstYmd);
    $effectiveEnd = $today;
    if ($effectiveStart > $effectiveEnd) {
        return;
    }
    $unpostedDays = dailyCollectUnpostedDaysInRange(
        $pdo,
        $companyId,
        $processIdDay,
        $effectiveStart,
        $effectiveEnd
    );
    foreach ($unpostedDays as $dayYmd) {
        inboxAppendDailyNeedToday($needToday, $rNormal, $dayYmd, $baseCost, $basePrice, $baseProfit);
    }
}

/** Frequency=once：一次性入账已执行或已从 Due 移除（跳过）后不再出现在 Accounting Due */
function inbox_isOnceOneOffAlreadyHandled(PDO $pdo, int $companyId, int $processId): bool
{
    try {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND period_type IN ('once_one_off','once_one_off_skipped') LIMIT 1"
        );
        $stmt->execute([$companyId, $processId]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/** 某月第 N 日（不超过该月最后一天） */
function calendarMonthDueYmd(int $year, int $month, int $dueDay): string
{
    $last = (int) date('t', mktime(0, 0, 0, $month, 1, $year));
    $d = min(max(1, $dueDay), $last);
    return sprintf('%04d-%02d-%02d', $year, $month, $d);
}

/** 获取当前公司下可用于 Accounting Inbox 的 active Bank Process 列表 */
function fetchActiveBankProcessesForInbox(
    PDO $pdo,
    int $companyId,
    bool $hasFrequency,
    bool $hasResendRelaxCol,
    bool $hasDayEndMonthlyCapCol,
    bool $hasIssueFlagColumn = false,
    bool $hasFlagColumn = false,
    bool $hasLockCol = false,
    bool $hasFloorCol = false
): array {
    bmp_ensureBankProcessAccountingResendScheduleColumns($pdo);
    bmp_ensureBankProcessAccountingResendOpenAnchorsColumn($pdo);
    $hasSchedCols = bmp_bankProcessHasResendScheduleColumns($pdo);
    $hasOpenAnchorsCol = bmp_resend_tableHasColumn($pdo, 'bank_process', 'accounting_resend_open_anchors');
    $issueFlagSelect = ($hasIssueFlagColumn || $hasFlagColumn)
        ? ", " . getBankProcessIssueFlagSql('bp', $hasIssueFlagColumn, $hasFlagColumn) . " AS issue_flag"
        : "";
    $sql = "SELECT bp.id, bp.name, bp.bank, bp.country, bp.cost, bp.price, bp.profit,
            bp.card_merchant_id, bp.customer_id, bp.profit_account_id, bp.day_start, bp.day_end, bp.contract, bp.dts_created" .
        ($hasFrequency ? ", bp.day_start_frequency" : "") .
        ($hasResendRelaxCol ? ", bp.accounting_resend_relax_created_floor" : "") .
        ($hasDayEndMonthlyCapCol ? ", bp.day_end_monthly_cap_enabled" : "") .
        ($hasSchedCols ? ", bp.accounting_resend_schedule_day_start, bp.accounting_resend_schedule_day_end, bp.accounting_resend_schedule_frequency" : "") .
        ($hasOpenAnchorsCol ? ", bp.accounting_resend_open_anchors" : "") .
        ($hasLockCol ? ", bp.issue_flag_locked_end_ymd" : "") .
        ($hasFloorCol ? ", bp.accounting_reactivated_floor_ymd" : "") .
        $issueFlagSelect . "
            FROM bank_process bp
            WHERE bp.company_id = ? AND bp.status = 'active'
            AND (bp.card_merchant_id IS NOT NULL OR bp.customer_id IS NOT NULL OR bp.profit_account_id IS NOT NULL)
            AND (COALESCE(bp.cost,0) > 0 OR COALESCE(bp.price,0) > 0 OR COALESCE(bp.profit,0) > 0)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $i => $row) {
        $rows[$i] = bmp_mergeResendScheduleIntoBankProcessRowForAccounting($row);
    }
    return $rows;
}

/** 获取当前公司下 inactive-like 且尚未在本轮做过 manual_inactive 入账的 Bank Process。real inactive 与 OFFICIAL / E-INVOICE 共用这套 Accounting Due 逻辑。 */
function fetchInactiveBankProcessesPendingTransaction(PDO $pdo, int $companyId, bool $hasPeriodType, bool $hasIssueFlagColumn, bool $hasFlagColumn): array
{
    $issueFlagSql = getBankProcessIssueFlagSql('bp', $hasIssueFlagColumn, $hasFlagColumn);
    $sql = "SELECT bp.id, bp.name, bp.bank, bp.country, bp.cost, bp.price, bp.profit, bp.day_start, bp.contract
            FROM bank_process bp
            WHERE bp.company_id = ? AND " . (($hasIssueFlagColumn || $hasFlagColumn)
                ? "(bp.status = 'inactive' OR " . normalizedBankIssueFlagSql($issueFlagSql) . " IN ('official','e_invoice'))"
                : "bp.status = 'inactive'") . "
            AND bp.contract IN ('1+1','1+2','1+3')
            AND (bp.card_merchant_id IS NOT NULL OR bp.customer_id IS NOT NULL OR bp.profit_account_id IS NOT NULL)
            AND (COALESCE(bp.cost,0) > 0 OR COALESCE(bp.price,0) > 0 OR COALESCE(bp.profit,0) > 0)";
    if ($hasPeriodType) {
        $sql .= " AND NOT EXISTS (SELECT 1 FROM process_accounting_posted pap WHERE pap.company_id = bp.company_id AND pap.process_id = bp.id AND pap.period_type IN ('manual_inactive','manual_inactive_skipped') AND pap.posted_date >= DATE(bp.dts_modified))";
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$companyId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/** 检查首月按比例是否已入账或已跳过 */
function isPartialFirstMonthAlreadyPosted(PDO $pdo, int $companyId, int $processId): bool
{
    $stmt = $pdo->prepare("SELECT 1 FROM process_accounting_posted WHERE company_id = ? AND process_id = ? AND period_type IN ('partial_first_month','partial_first_month_skipped') LIMIT 1");
    $stmt->execute([$companyId, $processId]);
    return (bool) $stmt->fetch();
}

/** 获取已入账或已跳过「首月按比例」的 process_id 列表 */
function getPartialFirstMonthPostedIds(PDO $pdo, int $companyId): array
{
    $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND period_type IN ('partial_first_month','partial_first_month_skipped')");
    $stmt->execute([$companyId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** 获取指定日期已入账「monthly」的 process_id 列表 */
function getMonthlyPostedIdsForDate(PDO $pdo, int $companyId, string $date, array $processIds): array
{
    if (empty($processIds)) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($processIds), '?'));
    $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND posted_date = ? AND process_id IN ($placeholders) AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '')");
    $stmt->execute(array_merge([$companyId, $date], $processIds));
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** 获取曾入账过「monthly」的 process_id 列表（任意日期，用于 Monthly 第一笔是否已做过） */
function getMonthlyEverPostedIds(PDO $pdo, int $companyId): array
{
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return [];
        }
        $stmt = $pdo->query("SHOW COLUMNS FROM process_accounting_posted LIKE 'period_type'");
        if (!$stmt || $stmt->rowCount() === 0) {
            $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ?");
            $stmt->execute([$companyId]);
            return array_map('intval', array_unique($stmt->fetchAll(PDO::FETCH_COLUMN)));
        }
        $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND (period_type IN ('monthly','monthly_skipped') OR period_type IS NULL OR period_type = '')");
        $stmt->execute([$companyId]);
        return array_map('intval', array_unique($stmt->fetchAll(PDO::FETCH_COLUMN)));
    } catch (Throwable $e) {
        return [];
    }
}

/** 获取指定日期已入账的 process_id 列表（无 period_type 时） */
function getPostedProcessIdsForDate(PDO $pdo, int $companyId, string $date, array $processIds): array
{
    if (empty($processIds)) {
        return [];
    }
    $placeholders = implode(',', array_fill(0, count($processIds), '?'));
    $stmt = $pdo->prepare("SELECT process_id FROM process_accounting_posted WHERE company_id = ? AND posted_date = ? AND process_id IN ($placeholders)");
    $stmt->execute(array_merge([$companyId, $date], $processIds));
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

/** 无 period_type 兼容：指定 process + 日期是否已入账 */
function hasLegacyPostedOnDate(PDO $pdo, int $companyId, int $processId, string $dateYmd): bool
{
    try {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted
             WHERE company_id = ? AND process_id = ? AND posted_date = ? LIMIT 1"
        );
        $stmt->execute([$companyId, $processId, $dateYmd]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/** 无 period_type 兼容：指定 process 在某自然月是否已入账（用于 monthly billing_month 去重） */
function hasLegacyPostedInCalendarMonth(PDO $pdo, int $companyId, int $processId, int $year, int $month): bool
{
    try {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM process_accounting_posted
             WHERE company_id = ? AND process_id = ?
               AND YEAR(posted_date) = ? AND MONTH(posted_date) = ?
             LIMIT 1"
        );
        $stmt->execute([$companyId, $processId, $year, $month]);
        return (bool) $stmt->fetch();
    } catch (Throwable $e) {
        return false;
    }
}

/** 该行是否被 Accounting Due 软删除隐藏（正常流程）或 Resend 永久删除。 */
function inboxItemHiddenByAccountingDueDismiss(PDO $pdo, int $companyId, array $item): bool
{
    $processId = (int) ($item['id'] ?? 0);
    if ($processId <= 0) {
        return false;
    }
    if (!empty($item['is_resend_monthly_reopen'])) {
        $bm = trim((string) ($item['monthly_billing_month'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $bm)) {
            return false;
        }

        return bmp_hasMonthlyPostedOrSkippedForDueYmd($pdo, $companyId, $processId, $bm)
            || bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'resend_monthly_reopen', $bm);
    }
    if (!empty($item['is_partial_first_month'])) {
        $ds = inboxBankProcessDateFieldToYmd($item['day_start'] ?? null);

        return $ds !== null && bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'partial_first_month', $ds);
    }
    if (!empty($item['is_manual_inactive'])) {
        $ds = inboxBankProcessDateFieldToYmd($item['day_start'] ?? null);

        return $ds !== null && bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'manual_inactive', $ds);
    }
    if (!empty($item['is_resend_consolidated_range'])) {
        $ds = inboxBankProcessDateFieldToYmd($item['day_start'] ?? null);

        return $ds !== null && bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'resend_consolidated_range', $ds);
    }
    if (!empty($item['is_once_one_off'])) {
        $ds = inboxBankProcessDateFieldToYmd($item['day_start'] ?? null);

        return $ds !== null && bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'once_one_off', $ds);
    }
    if (!empty($item['is_day_end_tail'])) {
        $bm = trim((string) ($item['monthly_billing_month'] ?? ''));
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $bm)) {
            return bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'day_end_tail', $bm);
        }
        if (preg_match('/^(\d{4})-(\d{1,2})$/', $bm, $m)) {
            $monthFirst = sprintf('%04d-%02d-01', (int) $m[1], (int) $m[2]);

            return bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'day_end_tail', $monthFirst);
        }
    }
    if (!empty($item['is_weekly'])) {
        $ws = trim((string) ($item['weekly_billing_start'] ?? $item['monthly_billing_month'] ?? ''));

        return $ws !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $ws)
            && bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'weekly', $ws);
    }
    if (!empty($item['is_daily'])) {
        if (!empty($item['is_daily_consolidated'])) {
            $rangeRaw = trim((string) ($item['monthly_billing_month'] ?? ''));
            $range = dailyParseConsolidatedBillingRange($rangeRaw);
            if ($range === null) {
                return false;
            }
            $d = $range['start'];
            while ($d !== '' && $d <= $range['end']) {
                if (!bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'daily', $d)) {
                    return false;
                }
                $next = dailyNextDayYmd($d);
                if ($next === null) {
                    break;
                }
                $d = $next;
            }

            return true;
        }
        $dayYmd = trim((string) ($item['daily_billing_start'] ?? $item['monthly_billing_month'] ?? ''));

        return $dayYmd !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dayYmd)
            && bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'daily', $dayYmd);
    }
    if (!empty($item['monthly_billing_month'])) {
        $bmRaw = trim((string) $item['monthly_billing_month']);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $bmRaw)) {
            return bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'monthly', $bmRaw);
        }
        if (preg_match('/^(\d{4})-(\d{1,2})$/', $bmRaw, $m)) {
            $dueForBm = null;
            $dsBm = inboxBankProcessDateFieldToYmd($item['day_start'] ?? null);
            $freqBm = (string) ($item['frequency'] ?? 'monthly');
            if ($freqBm !== '1st_of_every_month') {
                $freqBm = 'monthly';
            }
            if ($dsBm !== null) {
                $dueForBm = bmp_monthlyDueYmdFromBillingAnchor($bmRaw, $dsBm, $freqBm);
            }
            if ($dueForBm !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueForBm)) {
                return bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'monthly', $dueForBm);
            }
            $monthFirst = sprintf('%04d-%02d-01', (int) $m[1], (int) $m[2]);

            return bmp_isAccountingDueSoftDismissed($pdo, $companyId, $processId, 'monthly', $monthFirst);
        }
    }

    return false;
}

function markAlreadyPostedOnNeedToday(PDO $pdo, array &$needToday, int $companyId, string $today, bool $hasPeriodType): void
{
    try {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'process_accounting_posted'");
        if (!$stmtCheck || $stmtCheck->rowCount() === 0) {
            return;
        }
        if ($hasPeriodType) {
            $partialPostedIds = getPartialFirstMonthPostedIds($pdo, $companyId);
            $ids = array_column($needToday, 'id');
            $monthlyPostedIds = getMonthlyPostedIdsForDate($pdo, $companyId, $today, $ids);
            foreach ($needToday as &$item) {
                if (inboxItemHiddenByAccountingDueDismiss($pdo, $companyId, $item)) {
                    $item['already_posted_today'] = true;
                    continue;
                }
                // manual_inactive 行不按 monthly/partial 标记已入账，否则会误标为已入账导致无法勾选 Transaction
                if (!empty($item['is_manual_inactive'])) {
                    $item['already_posted_today'] = false;
                    continue;
                }
                if (!empty($item['is_once_one_off'])) {
                    $item['already_posted_today'] = inbox_isOnceOneOffAlreadyHandled($pdo, $companyId, (int) $item['id']);
                    continue;
                }
                if (!empty($item['is_weekly'])) {
                    $ws = trim((string) ($item['weekly_billing_start'] ?? $item['monthly_billing_month'] ?? ''));
                    $item['already_posted_today'] = ($ws !== '')
                        ? hasWeeklyPostedForPeriodStart($pdo, $companyId, (int) $item['id'], $ws)
                        : false;
                    continue;
                }
                if (!empty($item['is_daily'])) {
                    if (!empty($item['is_daily_consolidated'])) {
                        $rangeRaw = trim((string) ($item['monthly_billing_month'] ?? ''));
                        $range = dailyParseConsolidatedBillingRange($rangeRaw);
                        if ($range === null) {
                            $item['already_posted_today'] = false;
                            continue;
                        }
                        $remaining = dailyCollectUnpostedDaysInRange(
                            $pdo,
                            $companyId,
                            (int) $item['id'],
                            $range['start'],
                            $range['end']
                        );
                        $item['already_posted_today'] = empty($remaining);
                    } else {
                        $dayYmd = trim((string) ($item['daily_billing_start'] ?? $item['monthly_billing_month'] ?? ''));
                        $item['already_posted_today'] = ($dayYmd !== '')
                            ? hasDailyPostedOrSkippedForDay($pdo, $companyId, (int) $item['id'], $dayYmd)
                            : false;
                    }
                    continue;
                }
                if (!empty($item['is_daily'])) {
                    if (!empty($item['is_daily_consolidated'])) {
                        $rangeRaw = trim((string) ($item['monthly_billing_month'] ?? ''));
                        $range = dailyParseConsolidatedBillingRange($rangeRaw);
                        if ($range === null) {
                            $item['already_posted_today'] = false;
                            continue;
                        }
                        $remaining = dailyCollectUnpostedDaysInRange(
                            $pdo,
                            $companyId,
                            (int) $item['id'],
                            $range['start'],
                            $range['end']
                        );
                        $item['already_posted_today'] = empty($remaining);
                    } else {
                        $dayYmd = trim((string) ($item['daily_billing_start'] ?? $item['monthly_billing_month'] ?? ''));
                        $item['already_posted_today'] = ($dayYmd !== '')
                            ? hasDailyPostedOrSkippedForDay($pdo, $companyId, (int) $item['id'], $dayYmd)
                            : false;
                    }
                    continue;
                }
                if (!empty($item['is_partial_first_month'])) {
                    $item['already_posted_today'] = in_array((int) $item['id'], $partialPostedIds, true);
                    continue;
                }
                if (!empty($item['is_day_end_tail'])) {
                    $item['already_posted_today'] = isDayEndTailAlreadyPosted($pdo, $companyId, (int) $item['id']);
                    continue;
                }
                if (!empty($item['is_resend_consolidated_range'])) {
                    $anchorRaw = isset($item['day_start']) ? trim((string) $item['day_start']) : '';
                    $anchorYmd = $anchorRaw !== '' ? inboxBankProcessDateFieldToYmd($anchorRaw) : null;
                    $item['already_posted_today'] = isResendConsolidatedAlreadyPosted(
                        $pdo,
                        $companyId,
                        (int) $item['id'],
                        $anchorYmd
                    );
                    continue;
                }
                // 按「账单所属自然月」判断是否已入账（与逾期未显示逻辑一致）
                if (!empty($item['monthly_billing_month'])) {
                    $bmRaw = trim((string) $item['monthly_billing_month']);
                    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $bmRaw)) {
                        $item['already_posted_today'] = bmp_hasMonthlyPostedOrSkippedForDueYmd(
                            $pdo,
                            $companyId,
                            (int) $item['id'],
                            $bmRaw
                        );
                        continue;
                    }
                    if (preg_match('/^(\d{4})-(\d{1,2})$/', $bmRaw, $m)) {
                        $dueForBm = null;
                        $dsBm = inboxBankProcessDateFieldToYmd($item['day_start'] ?? null);
                        $freqBm = (string) ($item['frequency'] ?? 'monthly');
                        if ($freqBm !== '1st_of_every_month') {
                            $freqBm = 'monthly';
                        }
                        if ($dsBm !== null) {
                            $dueForBm = bmp_monthlyDueYmdFromBillingAnchor($bmRaw, $dsBm, $freqBm);
                        }
                        if ($dueForBm !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueForBm)) {
                            $item['already_posted_today'] = bmp_hasMonthlyPostedOrSkippedForDueYmd(
                                $pdo,
                                $companyId,
                                (int) $item['id'],
                                $dueForBm
                            );
                        } else {
                            $item['already_posted_today'] = hasMonthlyPostedOrSkippedInCalendarMonth(
                                $pdo,
                                $companyId,
                                (int) $item['id'],
                                (int) $m[1],
                                (int) $m[2]
                            );
                        }
                        continue;
                    }
                }
                $item['already_posted_today'] = in_array((int) $item['id'], $monthlyPostedIds, true);
            }
        } else {
            $ids = array_column($needToday, 'id');
            $postedIds = getPostedProcessIdsForDate($pdo, $companyId, $today, $ids);
            foreach ($needToday as &$item) {
                if (inboxItemHiddenByAccountingDueDismiss($pdo, $companyId, $item)) {
                    $item['already_posted_today'] = true;
                    continue;
                }
                if (!empty($item['is_manual_inactive'])) {
                    $item['already_posted_today'] = false;
                    continue;
                }
                if (!empty($item['is_once_one_off'])) {
                    $item['already_posted_today'] = inbox_isOnceOneOffAlreadyHandled($pdo, $companyId, (int) $item['id']);
                    continue;
                }
                if (!empty($item['is_weekly'])) {
                    $ws = trim((string) ($item['weekly_billing_start'] ?? $item['monthly_billing_month'] ?? ''));
                    $item['already_posted_today'] = ($ws !== '')
                        ? hasWeeklyPostedForPeriodStart($pdo, $companyId, (int) ($item['id'] ?? 0), $ws)
                        : false;
                    continue;
                }
                if (!empty($item['is_daily'])) {
                    if (!empty($item['is_daily_consolidated'])) {
                        $rangeRaw = trim((string) ($item['monthly_billing_month'] ?? ''));
                        $range = dailyParseConsolidatedBillingRange($rangeRaw);
                        if ($range === null) {
                            $item['already_posted_today'] = false;
                            continue;
                        }
                        $remaining = dailyCollectUnpostedDaysInRange(
                            $pdo,
                            $companyId,
                            (int) ($item['id'] ?? 0),
                            $range['start'],
                            $range['end']
                        );
                        $item['already_posted_today'] = empty($remaining);
                    } else {
                        $dayYmd = trim((string) ($item['daily_billing_start'] ?? $item['monthly_billing_month'] ?? ''));
                        $item['already_posted_today'] = ($dayYmd !== '')
                            ? hasDailyPostedOrSkippedForDay($pdo, $companyId, (int) ($item['id'] ?? 0), $dayYmd)
                            : false;
                    }
                    continue;
                }
                if (!empty($item['is_resend_consolidated_range'])) {
                    $anchorRaw = isset($item['day_start']) ? trim((string) $item['day_start']) : '';
                    $anchorYmd = $anchorRaw !== '' ? inboxBankProcessDateFieldToYmd($anchorRaw) : null;
                    $item['already_posted_today'] = isResendConsolidatedAlreadyPosted(
                        $pdo,
                        $companyId,
                        (int) ($item['id'] ?? 0),
                        $anchorYmd
                    );
                    continue;
                }
                if (!empty($item['is_resend_monthly_reopen'])) {
                    $bmResend = trim((string) ($item['monthly_billing_month'] ?? ''));
                    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $bmResend)) {
                        $item['already_posted_today'] = bmp_hasMonthlyPostedOrSkippedForDueYmd(
                            $pdo,
                            $companyId,
                            (int) ($item['id'] ?? 0),
                            $bmResend
                        );
                        continue;
                    }
                }
                if (!empty($item['monthly_billing_month'])) {
                    $bmLegacy = trim((string) $item['monthly_billing_month']);
                    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $bmLegacy)) {
                        $item['already_posted_today'] = hasLegacyPostedOnDate(
                            $pdo,
                            $companyId,
                            (int) ($item['id'] ?? 0),
                            $bmLegacy
                        );
                        continue;
                    }
                    if (preg_match('/^(\d{4})-(\d{1,2})$/', $bmLegacy, $m)) {
                        $item['already_posted_today'] = hasLegacyPostedInCalendarMonth(
                            $pdo,
                            $companyId,
                            (int) ($item['id'] ?? 0),
                            (int) $m[1],
                            (int) $m[2]
                        );
                        continue;
                    }
                }
                $item['already_posted_today'] = in_array((int) $item['id'], $postedIds, true);
            }
        }
        unset($item);
    } catch (Throwable $e) {
        // ignore
    }
}

try {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonResponse(false, '请先登录', null);
        exit;
    }
    // 与 processlist_api / bank list 一致：优先 GET company_id，避免页面已切子公司但 session 未同步时角标为 0。
    $company_id = isset($_GET['company_id']) && $_GET['company_id'] !== ''
        ? (int) $_GET['company_id']
        : (int) ($_SESSION['company_id'] ?? 0);
    if ($company_id <= 0) {
        http_response_code(400);
        jsonResponse(false, '缺少公司信息', null);
        exit;
    }
    $viewGroup = isset($_GET['group_id']) ? gc_normalize_view_group((string) $_GET['group_id']) : null;
    if ($viewGroup === null && gc_is_group_login()) {
        $viewGroup = gc_session_login_identifier();
    }
    try {
        gc_assert_api_company_access($pdo, $company_id, $viewGroup);
    } catch (RuntimeException $e) {
        http_response_code(403);
        jsonResponse(false, $e->getMessage(), null);
        exit;
    }

    if (isset($_GET['restore_dismissed']) && (string) $_GET['restore_dismissed'] === '1') {
        bmp_restoreNormalAccountingDueDismissals($pdo, $company_id);
    }

    $today = date('Y-m-d');
    //$today = '2027-01-01';

    bmp_promoteExpiredNaturalMonthlySoftDismissals($pdo, $company_id, $today);
    if (isset($_GET['restore_dismissed']) && (string) $_GET['restore_dismissed'] === '1') {
        bmp_restoreNormalAccountingDueDismissals($pdo, $company_id);
    }

    $hasFrequency = hasBankProcessFrequencyColumn($pdo);
    $hasIssueFlagColumn = tableHasColumn($pdo, 'bank_process', 'issue_flag');
    $hasFlagColumn = tableHasColumn($pdo, 'bank_process', 'flag');
    $hasPeriodType = false;
    try {
        $hasPeriodType = tableHasColumn($pdo, 'process_accounting_posted', 'period_type');
    } catch (Throwable $e) {
        // ignore
    }
    $hasResendRelaxCol = tableHasColumn($pdo, 'bank_process', 'accounting_resend_relax_created_floor');
    $hasDayEndMonthlyCapCol = tableHasColumn($pdo, 'bank_process', 'day_end_monthly_cap_enabled');
    $hasIssueFlagLockCol = tableHasColumn($pdo, 'bank_process', 'issue_flag_locked_end_ymd');
    $hasReactivatedFloorCol = tableHasColumn($pdo, 'bank_process', 'accounting_reactivated_floor_ymd');

    $rows = fetchActiveBankProcessesForInbox(
        $pdo,
        $company_id,
        $hasFrequency,
        $hasResendRelaxCol,
        $hasDayEndMonthlyCapCol,
        $hasIssueFlagColumn,
        $hasFlagColumn,
        $hasIssueFlagLockCol,
        $hasReactivatedFloorCol
    );
    // Feature 1（Official/E-Invoice/Block 到期即停并冻结、忽略之后的 day_end 修改）+
    // Feature 2（纯 Active 且 day_end 旁开关 OFF 时到期不停）：在这里统一算出每行的最终 day_end
    // 与 __unlimited_window，后续所有账期计算读同一份 $rows，不需要在各分支各自判断。
    foreach ($rows as $i => $row) {
        $normalizedFlag = normalizeBankIssueFlagValueForInbox($row['issue_flag'] ?? null);
        bmpApplyIssueFlagBillingLock($pdo, $row, $company_id, $today, $hasIssueFlagLockCol);
        $row['__unlimited_window'] = bmpRowUnlimitedWindow($normalizedFlag, $hasDayEndMonthlyCapCol, $row);
        $rows[$i] = $row;
    }
    $needToday = [];

    // 1) Partial first month
    if ($hasFrequency && $hasPeriodType) {
        foreach ($rows as $r) {
            $frequency = $r['day_start_frequency'] ?? '1st_of_every_month';
            if ($frequency !== '1st_of_every_month') {
                continue;
            }
            $dayStart = $r['day_start'] ?? null;
            if (empty($dayStart)) {
                continue;
            }
            $startDate = inboxBankProcessDateFieldToYmd($dayStart);
            if ($startDate === null) {
                continue;
            }
            $startTs = strtotime($startDate);
            if ($startTs === false) {
                continue;
            }
            if ($today < $startDate && empty($r['accounting_resend_relax_created_floor'])) {
                continue;
            }
            $resendSinglePeriod = !empty($r['accounting_resend_single_period_from_schedule']);
            if (!empty($r['accounting_resend_consolidated_range'])) {
                continue;
            }
            // Resend 单期指向其它锚点时：首月按比例仍按库里真实 day_start 判断，避免 merge 后误排 5/7 幽灵行。
            $partialDayStartRaw = $r['day_start'] ?? null;
            $partialStartDate = $startDate;
            if (!empty($r['accounting_resend_relax_created_floor']) && $resendSinglePeriod) {
                $storedPartialRaw = $r['bank_process_stored_day_start'] ?? null;
                $storedPartialYmd = $storedPartialRaw !== null
                    ? inboxBankProcessDateFieldToYmd((string) $storedPartialRaw)
                    : null;
                $mergedPartialYmd = inboxBankProcessDateFieldToYmd($r['day_start'] ?? null);
                if ($storedPartialYmd !== null && $mergedPartialYmd !== null && $storedPartialYmd !== $mergedPartialYmd) {
                    continue;
                }
                if ($storedPartialRaw !== null && trim((string) $storedPartialRaw) !== '') {
                    $partialDayStartRaw = $storedPartialRaw;
                    $partialStartDate = $storedPartialYmd ?? $startDate;
                    $partialStartTs = strtotime($partialStartDate);
                    if ($partialStartTs === false) {
                        continue;
                    }
                    $startTs = $partialStartTs;
                }
            }
            $createdYmd = inboxEffectiveCreatedYmdForProcess($r, $today, $partialStartDate);
            if ($today < maxYmd($partialStartDate, $createdYmd) && empty($r['accounting_resend_relax_created_floor'])) {
                continue;
            }
            if (!isWithinRecurringBillingWindow($today, $partialDayStartRaw, $r['contract'] ?? null, $r['day_end'] ?? null, '1st_of_every_month', !empty($r['accounting_resend_relax_created_floor']), $resendSinglePeriod, !empty($r['__unlimited_window']))) {
                continue;
            }
            // If day_start is the 1st, there's no "partial first month" period at all.
            $startDayOfMonth = (int) date('j', $startTs);
            if ($startDayOfMonth === 1) {
                continue;
            }
            $firstMonthEnd = date('Y-m-t', $startTs);
            // 无 Resend 标记时：创建日晚于首自然月末则整段跳过（旧数据不拿）。Resend 后须仍可出现首月按比例。
            if ($createdYmd > $firstMonthEnd && empty($r['accounting_resend_relax_created_floor'])) {
                continue;
            }
            $processId = (int) $r['id'];
            if (isPartialFirstMonthAlreadyPosted($pdo, $company_id, $processId)) {
                continue;
            }
            $cost = money_normalize($r['cost'] ?? '0');
            $price = money_normalize($r['price'] ?? '0');
            $profit = money_normalize($r['profit'] ?? '0');
            $partialStart = $partialStartDate;
            if ($partialStart > $firstMonthEnd) {
                continue;
            }
            $partial = prorateToMonthEndFromStart($partialStart, $cost, $price, $profit);
            $pc = $partial['cost'];
            $pp = $partial['price'];
            $pf = $partial['profit'];
            $needToday[] = [
                'id' => $processId,
                'name' => ($r['name'] ?? '') ?: ($r['bank'] ?? ''),
                'bank' => $r['bank'] ?? '',
                'country' => $r['country'] ?? '',
                'day_start' => $partialDayStartRaw,
                'contract' => $r['contract'] ?? '',
                'cost' => $pc,
                'price' => $pp,
                'profit' => $pf,
                'already_posted_today' => false,
                'is_partial_first_month' => true,
                'is_manual_inactive' => false,
            ];
        }
    }

    // 2) Regular: 每月1号 或 Monthly(day_start-1)；应付日过后整月内仍显示直到该月入账
    foreach ($rows as $r) {
        if (!empty($r['accounting_resend_relax_created_floor']) && !empty($r['accounting_resend_consolidated_range'])) {
            $dayStartRaw = $r['day_start'] ?? null;
            $dayEndRaw = $r['day_end'] ?? null;
            $startDate = inboxBankProcessDateFieldToYmd($dayStartRaw);
            $endDate = inboxBankProcessDateFieldToYmd($dayEndRaw);
            if ($startDate !== null && $endDate !== null && $startDate <= $endDate) {
                $baseCost = money_normalize($r['cost'] ?? '0');
                $basePrice = money_normalize($r['price'] ?? '0');
                $baseProfit = money_normalize($r['profit'] ?? '0');
                $tot = prorateInclusiveDateRange($startDate, $endDate, $baseCost, $basePrice, $baseProfit);
                $needToday[] = [
                    'id' => (int) $r['id'],
                    'name' => $r['name'] ?? '',
                    'bank' => $r['bank'] ?? '',
                    'country' => $r['country'] ?? '',
                    'day_start' => $dayStartRaw,
                    'contract' => $r['contract'] ?? '',
                    'cost' => $tot['cost'],
                    'price' => $tot['price'],
                    'profit' => $tot['profit'],
                    'already_posted_today' => false,
                    'is_partial_first_month' => false,
                    'is_manual_inactive' => false,
                    'is_day_end_tail' => false,
                    'is_resend_consolidated_range' => true,
                ];
            }
            // 该 process 已是 consolidated range 合并账单：不再额外排「库里原 day_start」的正常流程行，
            // 否则会把 Resend 前的旧账期（如原 day_start=3/18）重新拉回 Accounting Due，与合并账单重复显示。
            continue;
        }
        // Resend 单期开账（弹窗同时填 day_start + day_end）：统一走 consolidated 一条，避免与 monthly/day_end_tail 重复入列。
        if (!empty($r['accounting_resend_relax_created_floor'])
            && !empty($r['accounting_resend_single_period_from_schedule'])
            && !empty($r['accounting_resend_schedule_day_start'])
            && !empty($r['accounting_resend_schedule_day_end'])) {
            $dayStartRaw = $r['day_start'] ?? null;
            $dayEndRaw = $r['day_end'] ?? null;
            $startDate = inboxBankProcessDateFieldToYmd($dayStartRaw);
            $endDate = inboxBankProcessDateFieldToYmd($dayEndRaw);
            if ($startDate !== null && $endDate !== null && $startDate <= $endDate) {
                $baseCost = money_normalize($r['cost'] ?? '0');
                $basePrice = money_normalize($r['price'] ?? '0');
                $baseProfit = money_normalize($r['profit'] ?? '0');
                $tot = prorateInclusiveDateRange($startDate, $endDate, $baseCost, $basePrice, $baseProfit);
                $needToday[] = [
                    'id' => (int) $r['id'],
                    'name' => $r['name'] ?? '',
                    'bank' => $r['bank'] ?? '',
                    'country' => $r['country'] ?? '',
                    'day_start' => $dayStartRaw,
                    'contract' => $r['contract'] ?? '',
                    'cost' => $tot['cost'],
                    'price' => $tot['price'],
                    'profit' => $tot['profit'],
                    'already_posted_today' => false,
                    'is_partial_first_month' => false,
                    'is_manual_inactive' => false,
                    'is_day_end_tail' => false,
                    'is_resend_consolidated_range' => true,
                ];
            }
            continue;
        }
        $frequency = $hasFrequency ? ($r['day_start_frequency'] ?? '1st_of_every_month') : '1st_of_every_month';
        $dayStart = $r['day_start'] ?? null;
        $resendSinglePeriod = !empty($r['accounting_resend_single_period_from_schedule']);
        // Resend 弹窗指定了 day_start：只列单期；否则 relax 期间可列多笔未结清账期。
        $resendRelax = !empty($r['accounting_resend_relax_created_floor']);
        $resendMulti = $resendRelax && !$resendSinglePeriod;
        $need = false;
        $monthlyBillingMonth = null;
        $queuedMonthlyBillingMonths = [];
        $startDate = '';
        $startTs = false;
        if (!empty($dayStart)) {
            $parsedStart = inboxBankProcessDateFieldToYmd($dayStart);
            if ($parsedStart !== null) {
                $tsParsed = strtotime($parsedStart);
                if ($tsParsed !== false) {
                    $startDate = $parsedStart;
                    $startTs = $tsParsed;
                }
            }
        }
        $createdYmd = inboxEffectiveCreatedYmdForProcess($r, $today, $startDate !== '' ? $startDate : null);
        $contract = $r['contract'] ?? null;
        $dayEnd = $r['day_end'] ?? null;
        $baseCost = money_normalize($r['cost'] ?? '0');
        $basePrice = money_normalize($r['price'] ?? '0');
        $baseProfit = money_normalize($r['profit'] ?? '0');

        if ($resendRelax) {
            inboxAppendResendOpenAnchorRows(
                $needToday,
                $pdo,
                $company_id,
                $r,
                $today,
                $baseCost,
                $basePrice,
                $baseProfit,
                $hasDayEndMonthlyCapCol
            );
        }

        // Frequency=once：单笔全流程入账；不按应付日/创建日过滤，始终出现在 Accounting Due（入账或 Delete 跳过后即消失）
        if ($frequency === 'once') {
            if (!$hasFrequency) {
                continue;
            }
            if ($resendRelax) {
                continue;
            }
            $processIdOnce = (int) $r['id'];
            if (inbox_isOnceOneOffAlreadyHandled($pdo, $company_id, $processIdOnce)) {
                continue;
            }
            $needToday[] = [
                'id' => $processIdOnce,
                'name' => ($r['name'] ?? '') ?: ($r['bank'] ?? ''),
                'bank' => $r['bank'] ?? '',
                'country' => $r['country'] ?? '',
                'day_start' => $dayStart,
                'contract' => 'ONCE',
                'cost' => $baseCost,
                'price' => $basePrice,
                'profit' => $baseProfit,
                'already_posted_today' => false,
                'is_partial_first_month' => false,
                'is_manual_inactive' => false,
                'is_once_one_off' => true,
            ];
            continue;
        }

        if ($frequency === 'week') {
            if (empty($dayStart) || $startTs === false) {
                continue;
            }
            if ($today < $startDate && !$resendRelax) {
                continue;
            }
            $processIdWeek = (int) $r['id'];
            $queuedWeeklyStarts = [];
            $onlyPeriodStart = null;
            if ($resendSinglePeriod && $startDate !== '' && !$resendRelax) {
                $onlyPeriodStart = $startDate;
            }
            $resendOpenWeekAnchors = $resendRelax ? bmp_getResendOpenAnchorsFromRow($r) : [];
            try {
                $periodStartYmd = $startDate;
                while ($periodStartYmd !== '') {
                    $due = $periodStartYmd;
                    $periodEnd = weekPeriodEndInclusiveYmd($due);
                    if ($periodEnd === null) {
                        break;
                    }
                    // 未开始的周（起点 > 今天）不扫描后续；Resend relax 只放宽「过去期」是否可入账，不能无上限扫向未来。
                    if ($due > $today) {
                        if ($onlyPeriodStart === null || $due !== $onlyPeriodStart) {
                            break;
                        }
                    }
                    if ($onlyPeriodStart !== null && $due !== $onlyPeriodStart) {
                        $next = weekPeriodNextStartYmd($due);
                        if ($next === null) {
                            break;
                        }
                        $periodStartYmd = $next;
                        continue;
                    }
                    if (!$resendRelax && $due < $createdYmd) {
                        $createdYear = (int) date('Y', strtotime($createdYmd));
                        $createdMonth = (int) date('n', strtotime($createdYmd));
                        if (!weekPeriodOverlapsCalendarMonth($due, $periodEnd, $createdYear, $createdMonth)) {
                            $next = weekPeriodNextStartYmd($due);
                            if ($next === null) {
                                break;
                            }
                            $periodStartYmd = $next;
                            continue;
                        }
                    }
                    if (weekPeriodIsReadyForAccounting($due, $today, $resendRelax)
                        && !hasWeeklyPostedForPeriodStart($pdo, $company_id, $processIdWeek, $due)) {
                        if (!$resendRelax || !in_array($due, $resendOpenWeekAnchors, true)) {
                            $queuedWeeklyStarts[] = $due;
                        }
                    }
                    $next = weekPeriodNextStartYmd($due);
                    if ($next === null) {
                        break;
                    }
                    $periodStartYmd = $next;
                }
            } catch (Throwable $e) {
                $need = false;
            }
            if (!empty($queuedWeeklyStarts)) {
                foreach (inboxUniqueSortedWeeklyStarts($queuedWeeklyStarts) as $ws) {
                    inboxAppendWeeklyNeedToday($needToday, $r, $ws, $baseCost, $basePrice, $baseProfit);
                }
            }
            if ($resendRelax && $resendSinglePeriod) {
                inboxAppendStoredNormalFlowIfNeeded(
                    $needToday,
                    $pdo,
                    $company_id,
                    $r,
                    $today,
                    $baseCost,
                    $basePrice,
                    $baseProfit,
                    $hasDayEndMonthlyCapCol
                );
            }
            continue;
        }

        if ($frequency === 'day') {
            if (empty($dayStart) || $startTs === false) {
                continue;
            }
            if ($today < $startDate && !$resendRelax) {
                continue;
            }
            $processIdDay = (int) $r['id'];
            $resendOpenDayAnchors = $resendRelax ? bmp_getResendOpenAnchorsFromRow($r) : [];
            // Resend 单期：open 锚点由 inboxAppendResendOpenAnchorRows 统一入列。
            if ($resendSinglePeriod && $startDate !== '') {
                if ($resendRelax) {
                    inboxAppendStoredNormalFlowIfNeeded(
                        $needToday,
                        $pdo,
                        $company_id,
                        $r,
                        $today,
                        $baseCost,
                        $basePrice,
                        $baseProfit,
                        $hasDayEndMonthlyCapCol
                    );
                } elseif (!hasDailyPostedOrSkippedForDay($pdo, $company_id, $processIdDay, $startDate)) {
                    inboxAppendDailyNeedToday($needToday, $r, $startDate, $baseCost, $basePrice, $baseProfit);
                }
                continue;
            }
            $monthFirstYmd = $today;
            try {
                $monthFirstYmd = (new DateTimeImmutable($today))->modify('first day of this month')->format('Y-m-d');
            } catch (Throwable $e) {
                // keep $today
            }
            $effectiveStart = max($startDate, $monthFirstYmd);
            $effectiveEnd = $today;
            if ($effectiveStart > $effectiveEnd) {
                continue;
            }
            $unpostedDays = dailyCollectUnpostedDaysInRange(
                $pdo,
                $company_id,
                $processIdDay,
                $effectiveStart,
                $effectiveEnd
            );
            if (empty($unpostedDays)) {
                continue;
            }
            foreach ($unpostedDays as $dayYmd) {
                if ($resendRelax && in_array($dayYmd, $resendOpenDayAnchors, true)) {
                    continue;
                }
                inboxAppendDailyNeedToday($needToday, $r, $dayYmd, $baseCost, $basePrice, $baseProfit);
            }
            if ($resendRelax && $resendSinglePeriod) {
                inboxAppendStoredNormalFlowIfNeeded(
                    $needToday,
                    $pdo,
                    $company_id,
                    $r,
                    $today,
                    $baseCost,
                    $basePrice,
                    $baseProfit,
                    $hasDayEndMonthlyCapCol
                );
            }
            continue;
        }

        if ($frequency === '1st_of_every_month') {
            if (empty($dayStart)) {
                continue;
            }
            if ($startTs === false) {
                continue;
            }
            if ($resendRelax && $resendSinglePeriod) {
                inboxAppendStoredNormalFlowIfNeeded(
                    $needToday,
                    $pdo,
                    $company_id,
                    $r,
                    $today,
                    $baseCost,
                    $basePrice,
                    $baseProfit,
                    $hasDayEndMonthlyCapCol
                );
                continue;
            }
            $queuedMonthlyBillingMonths = inboxCollectFirstOfMonthBillingAnchors(
                    $pdo,
                    $company_id,
                    $r,
                    $today,
                    $startDate,
                    $startTs,
                    $createdYmd,
                    $contract,
                    $dayEnd,
                    $resendRelax,
                    $resendSinglePeriod
                );
                if (!empty($queuedMonthlyBillingMonths)) {
                    foreach ($queuedMonthlyBillingMonths as $bm) {
                        inboxAppendMonthlyNeedToday(
                            $needToday,
                            $r,
                            $bm,
                            '1st_of_every_month',
                            $createdYmd,
                            $startTs,
                            $startDate,
                            $baseCost,
                            $basePrice,
                            $baseProfit,
                            $hasDayEndMonthlyCapCol
                        );
                    }
                }
            inboxAppendStoredNormalFlowIfNeeded(
                $needToday,
                $pdo,
                $company_id,
                $r,
                $today,
                $baseCost,
                $basePrice,
                $baseProfit,
                $hasDayEndMonthlyCapCol
            );
            continue;
        } elseif ($frequency === 'monthly') {
            // Monthly（prepaid）：每月 day_start 当天应付；逾期仍显示至该月结清
            if (empty($dayStart)) {
                continue;
            }
            if ($startTs === false) {
                continue;
            }
            if ($resendRelax && $resendSinglePeriod) {
                inboxAppendStoredNormalFlowIfNeeded(
                    $needToday,
                    $pdo,
                    $company_id,
                    $r,
                    $today,
                    $baseCost,
                    $basePrice,
                    $baseProfit,
                    $hasDayEndMonthlyCapCol
                );
                continue;
            }
            $queuedMonthlyBillingMonths = inboxCollectMonthlyPrepaidBillingAnchors(
                    $pdo,
                    $company_id,
                    $r,
                    $today,
                    $startDate,
                    $startTs,
                    $createdYmd,
                    $contract,
                    $dayEnd,
                    $resendRelax,
                    $resendSinglePeriod
                );
                if (!empty($queuedMonthlyBillingMonths)) {
                    foreach ($queuedMonthlyBillingMonths as $bm) {
                        inboxAppendMonthlyNeedToday(
                            $needToday,
                            $r,
                            $bm,
                            'monthly',
                            $createdYmd,
                            $startTs,
                            $startDate,
                            $baseCost,
                            $basePrice,
                            $baseProfit,
                            $hasDayEndMonthlyCapCol
                        );
                    }
                }
            inboxAppendStoredNormalFlowIfNeeded(
                $needToday,
                $pdo,
                $company_id,
                $r,
                $today,
                $baseCost,
                $basePrice,
                $baseProfit,
                $hasDayEndMonthlyCapCol
            );
            continue;
        }

        if ($need) {
            inboxAppendMonthlyNeedToday(
                $needToday,
                $r,
                (string) $monthlyBillingMonth,
                $frequency,
                $createdYmd,
                $startTs,
                $startDate,
                $baseCost,
                $basePrice,
                $baseProfit,
                $hasDayEndMonthlyCapCol
            );
        }
    }

    // 2b) day_end 尾段：1st + cap 列且开关 ON 时为 max(exclusiveEnd, day_end 月首)～day_end；否则仍为 exclusiveEnd～day_end 且需 day_end≥exclusiveEnd。1st + cap 列且 OFF 不排尾段。
    if ($hasPeriodType) {
        foreach ($rows as $r) {
            if (!empty($r['accounting_resend_consolidated_range'])) {
                continue;
            }
            // Resend 弹窗显式填写了 day_start + day_end 的单期补账：由主账单行承接，不再额外排 day_end_tail，
            // 否则会在 Accounting Due 出现重复（同期 Prorated + DayEnd）。
            if (!empty($r['accounting_resend_relax_created_floor'])
                && !empty($r['accounting_resend_schedule_day_start'])
                && !empty($r['accounting_resend_schedule_day_end'])) {
                continue;
            }
            // Resend with an explicit single reopened period: do not also queue day_end_tail in the same pass
            // (would look like a duplicate bill alongside the monthly line).
            if (!empty($r['accounting_resend_single_period_from_schedule'])) {
                continue;
            }
            $frequency = $hasFrequency ? ($r['day_start_frequency'] ?? '1st_of_every_month') : '1st_of_every_month';
            if ($frequency === '1st_of_every_month' && $hasDayEndMonthlyCapCol && !inboxDayEndTailSwitchOn($hasDayEndMonthlyCapCol, $r)) {
                continue;
            }
            // Feature 2：到期不再停时，regular monthly 已经无缝延续到 day_end 之后，尾段这个「合同结束～day_end」
            // 的补差概念不再适用（否则会与继续出的整月账重复）。仅对会被 unlimitedWindow 影响的两种 frequency 生效，
            // week/day/once 的既有尾段判断保持不变。
            if (!empty($r['__unlimited_window']) && in_array($frequency, ['1st_of_every_month', 'monthly'], true)) {
                continue;
            }
            $dayEndRaw = $r['day_end'] ?? null;
            if ($dayEndRaw === null || trim((string) $dayEndRaw) === '' || strtotime((string) $dayEndRaw) === false) {
                continue;
            }
            $dayStart = $r['day_start'] ?? null;
            if (empty($dayStart)) {
                continue;
            }
            $startDate = inboxBankProcessDateFieldToYmd($dayStart);
            if ($startDate === null) {
                continue;
            }
            $dayEndInc = date('Y-m-d', strtotime($dayEndRaw));
            $contract = $r['contract'] ?? null;
            $term = getBillingTermMonthsFromContract($contract);
            if ($term === null || $term < 1) {
                continue;
            }
            $exclusiveEnd = contractExclusiveEndYmdForFrequency($startDate, $contract, $frequency);
            if ($exclusiveEnd === null) {
                continue;
            }
            $useSwitchGatedTail = ($frequency === '1st_of_every_month' && $hasDayEndMonthlyCapCol && inboxDayEndTailSwitchOn($hasDayEndMonthlyCapCol, $r));
            if ($useSwitchGatedTail) {
                try {
                    $monthFirst = (new DateTimeImmutable($dayEndInc))->modify('first day of this month')->format('Y-m-d');
                } catch (Throwable $e) {
                    continue;
                }
                $tailFrom = max($exclusiveEnd, $monthFirst);
                if ($tailFrom > $dayEndInc) {
                    continue;
                }
                $todayGate = $tailFrom;
            } else {
                if ($dayEndInc < $exclusiveEnd) {
                    continue;
                }
                $tailFrom = $exclusiveEnd;
                $todayGate = $exclusiveEnd;
            }
            $processId = (int) $r['id'];
            if (isDayEndTailAlreadyPosted($pdo, $company_id, $processId)) {
                continue;
            }
            $startTsNorm = strtotime($startDate);
            $startDayOfMonth = $startTsNorm !== false ? (int) date('j', $startTsNorm) : 1;
            $createdYmdTail = inboxEffectiveCreatedYmdForProcess($r, $today, $startDate);
            if (!isBillingCompleteBeforeDayEndTail($pdo, $company_id, $processId, $exclusiveEnd, $startDate, $startDayOfMonth, $hasPeriodType, $createdYmdTail, $frequency)) {
                continue;
            }
            if ($today < $todayGate) {
                continue;
            }
            if (!isWithinRecurringBillingWindow($today, $dayStart, $contract, $r['day_end'] ?? null, $frequency, !empty($r['accounting_resend_relax_created_floor']), !empty($r['accounting_resend_single_period_from_schedule']), !empty($r['__unlimited_window']))) {
                continue;
            }
            if ($today < maxYmd($startDate, $createdYmdTail)) {
                continue;
            }
            $cost = money_normalize($r['cost'] ?? '0');
            $price = money_normalize($r['price'] ?? '0');
            $profit = money_normalize($r['profit'] ?? '0');
            $tail = prorateInclusiveDateRange($tailFrom, $dayEndInc, $cost, $price, $profit);
            if (money_cmp($tail['cost'], '0') <= 0 && money_cmp($tail['price'], '0') <= 0 && money_cmp($tail['profit'], '0') <= 0) {
                continue;
            }
            try {
                $bm = (new DateTimeImmutable($tailFrom))->format('Y-n');
            } catch (Throwable $e) {
                continue;
            }
            $needToday[] = [
                'id' => $processId,
                'name' => ($r['name'] ?? '') ?: ($r['bank'] ?? ''),
                'bank' => $r['bank'] ?? '',
                'country' => $r['country'] ?? '',
                'day_start' => $dayStart,
                'contract' => $contract ?? '',
                'cost' => $tail['cost'],
                'price' => $tail['price'],
                'profit' => $tail['profit'],
                'already_posted_today' => false,
                'is_partial_first_month' => false,
                'is_day_end_tail' => true,
                'is_manual_inactive' => false,
                'monthly_billing_month' => $bm,
            ];
        }
    }

    // 3) 用户从 active 改为 inactive 的流程：进入 Accounting Due；做完 Transaction 后该行从列表消失，status 保持 inactive
    $inactivePending = fetchInactiveBankProcessesPendingTransaction($pdo, $company_id, $hasPeriodType, $hasIssueFlagColumn, $hasFlagColumn);
    foreach ($inactivePending as $r) {
        $miDayStart = $r['day_start'] ?? null;
        if (empty($miDayStart) || inboxBankProcessDateFieldToYmd((string) $miDayStart) === null) {
            continue;
        }
        $needToday[] = [
            'id' => (int) $r['id'],
            'name' => $r['name'] ?? '',
            'bank' => $r['bank'] ?? '',
            'country' => $r['country'] ?? '',
            'day_start' => $r['day_start'] ?? null,
            'contract' => $r['contract'] ?? '',
            'cost' => money_normalize($r['cost'] ?? '0'),
            'price' => money_normalize($r['price'] ?? '0'),
            'profit' => money_normalize($r['profit'] ?? '0'),
            'already_posted_today' => false,
            'is_partial_first_month' => false,
            'is_manual_inactive' => true,
        ];
    }

    // 去重防护：Resend（尤其带 day_end）在某些组合条件下可能产生重复候选行。
    // 这里仅对“同 process + 同账期 + 同 period_type”去重；并且特殊账期优先于普通 monthly。
    if (!empty($needToday)) {
        $rankOf = static function (array $item): int {
            if (!empty($item['is_once_one_off'])) return 6;
            if (!empty($item['is_resend_consolidated_range'])) return 5;
            if (!empty($item['is_resend_monthly_reopen'])) return 5;
            if (!empty($item['is_day_end_tail'])) return 4;
            if (!empty($item['is_partial_first_month'])) return 3;
            if (!empty($item['is_manual_inactive'])) return 2;
            if (!empty($item['is_weekly'])) return 1;
            if (!empty($item['is_daily'])) return 1;
            return 1; // regular monthly
        };
        $normalizeBm = static function (array $item): string {
            if (!empty($item['is_weekly'])) {
                $ws = trim((string) ($item['weekly_billing_start'] ?? $item['monthly_billing_month'] ?? ''));
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $ws)) {
                    return $ws;
                }
            }
            if (!empty($item['is_daily'])) {
                if (!empty($item['is_daily_consolidated'])) {
                    $rangeRaw = trim((string) ($item['monthly_billing_month'] ?? ''));
                    if ($rangeRaw !== '') {
                        return 'daily|' . $rangeRaw;
                    }
                }
                $ds = trim((string) ($item['daily_billing_start'] ?? $item['monthly_billing_month'] ?? ''));
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $ds)) {
                    return 'daily|' . $ds;
                }
            }
            $bm = trim((string) ($item['monthly_billing_month'] ?? ''));
            // Monthly Resend 单期：应付日 Y-m-d 须保留，勿回落到 day_start 自然月（否则会与未入账正常账单撞键被去重）。
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $bm)) {
                return $bm;
            }
            if (preg_match('/^(\d{4})-(\d{1,2})$/', $bm, $m)) {
                return ((int) $m[1]) . '-' . ((int) $m[2]);
            }
            $ds = trim((string) ($item['day_start'] ?? ''));
            if ($ds !== '') {
                $parsed = inboxBankProcessDateFieldToYmd($ds);
                if ($parsed !== null) {
                    return date('Y-n', strtotime($parsed));
                }
                $ts = strtotime(str_replace('/', '-', $ds));
                if ($ts !== false) {
                    return date('Y-n', $ts);
                }
            }
            return $bm;
        };
        $typeOf = static function (array $item): string {
            if (!empty($item['is_once_one_off'])) return 'once_one_off';
            if (!empty($item['is_weekly'])) return 'weekly';
            if (!empty($item['is_daily'])) {
                return !empty($item['is_daily_consolidated']) ? 'daily_consolidated' : 'daily';
            }
            if (!empty($item['is_resend_consolidated_range'])) return 'resend_consolidated_range';
            if (!empty($item['is_resend_monthly_reopen'])) return 'resend_monthly_reopen';
            if (!empty($item['is_day_end_tail'])) return 'day_end_tail';
            if (!empty($item['is_partial_first_month'])) return 'partial_first_month';
            if (!empty($item['is_manual_inactive'])) return 'manual_inactive';
            return 'monthly';
        };

        $unique = [];
        foreach ($needToday as $row) {
            $pid = (int) ($row['id'] ?? 0);
            $bm = $normalizeBm($row);
            $key = $pid . '|' . $bm . '|' . $typeOf($row);

            if (!isset($unique[$key])) {
                $unique[$key] = $row;
                continue;
            }
            if ($rankOf($row) >= $rankOf($unique[$key])) {
                $unique[$key] = $row;
            }
        }

        // 额外规则：同 process + 同账期，若存在特殊账期（resend/day_end/partial/manual），丢弃普通 monthly。
        $hasSpecialByProcessMonth = [];
        foreach ($unique as $row) {
            $pid = (int) ($row['id'] ?? 0);
            $bm = $normalizeBm($row);
            if ($bm === '') continue;
            // resend_monthly_reopen 须与正常 monthly 并存，不参与「有特殊则丢 monthly」规则。
            if ($rankOf($row) > 1 && empty($row['is_resend_monthly_reopen'])) {
                $hasSpecialByProcessMonth[$pid . '|' . $bm] = true;
            }
        }

        $deduped = [];
        foreach ($unique as $row) {
            $pid = (int) ($row['id'] ?? 0);
            $bm = $normalizeBm($row);
            $pmKey = $pid . '|' . $bm;
            if ($rankOf($row) === 1 && isset($hasSpecialByProcessMonth[$pmKey])) {
                continue;
            }
            $deduped[] = $row;
        }

        // 最终强去重：同 process + 同账期锚点 + 同 day_start + 同金额只保留一条，避免 UI 出现“同账单两行”。
        $byFingerprint = [];
        foreach ($deduped as $row) {
            $pid = (int) ($row['id'] ?? 0);
            $ds = trim((string) ($row['day_start'] ?? ''));
            $dsNorm = $ds !== '' ? (inboxBankProcessDateFieldToYmd($ds) ?? $ds) : '';
            $c = money_normalize($row['cost'] ?? '0', MONEY_TX_STORE_SCALE);
            $p = money_normalize($row['price'] ?? '0', MONEY_TX_STORE_SCALE);
            $pr = money_normalize($row['profit'] ?? '0', MONEY_TX_STORE_SCALE);
            $weeklyAnchor = '';
            if (!empty($row['is_weekly'])) {
                $weeklyAnchor = trim((string) ($row['weekly_billing_start'] ?? $row['monthly_billing_month'] ?? ''));
            }
            $dailyAnchor = '';
            if (!empty($row['is_daily'])) {
                $dailyAnchor = trim((string) ($row['monthly_billing_month'] ?? $row['daily_billing_start'] ?? ''));
            }
            $monthlyAnchor = '';
            if (empty($row['is_weekly']) && empty($row['is_daily'])) {
                $monthlyAnchor = trim((string) ($row['monthly_billing_month'] ?? ''));
                if ($monthlyAnchor === '' && !empty($row['is_resend_consolidated_range'])) {
                    $monthlyAnchor = 'resend|' . $dsNorm;
                }
            }
            $fp = $pid . '|' . $typeOf($row) . '|' . $dsNorm . '|' . $weeklyAnchor . '|' . $dailyAnchor . '|' . $monthlyAnchor . '|' . $c . '|' . $p . '|' . $pr;
            if (!isset($byFingerprint[$fp]) || $rankOf($row) >= $rankOf($byFingerprint[$fp])) {
                $byFingerprint[$fp] = $row;
            }
        }

        $needToday = array_values($byFingerprint);
    }

    if (!empty($needToday)) {
        $processById = [];
        foreach ($rows as $pr) {
            $processById[(int) ($pr['id'] ?? 0)] = $pr;
        }
        foreach ($inactivePending as $pr) {
            $pid = (int) ($pr['id'] ?? 0);
            if ($pid > 0) {
                $processById[$pid] = array_merge($processById[$pid] ?? [], $pr);
            }
        }
        inboxEnrichNeedTodayBillingPeriods($needToday, $processById, $hasDayEndMonthlyCapCol, $hasFrequency);
        markAlreadyPostedOnNeedToday($pdo, $needToday, $company_id, $today, $hasPeriodType);
        foreach ($needToday as &$row) {
            $row['cost'] = money_out($row['cost'] ?? '0');
            $row['price'] = money_out($row['price'] ?? '0');
            $row['profit'] = money_out($row['profit'] ?? '0');
        }
        unset($row);
        // 已入账或已从 Due 移除（*_skipped）的行不再返回给弹窗，避免 Resend 后 Delete 仍显示「残留」一行
        $needToday = array_values(array_filter($needToday, static function (array $row): bool {
            return empty($row['already_posted_today']);
        }));
    }

    jsonResponse(true, '', $needToday);
} catch (Exception $e) {
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
} catch (PDOException $e) {
    error_log('process_accounting_inbox_api: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, '服务器错误', null);
} catch (Throwable $e) {
    error_log('process_accounting_inbox_api: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, '服务器错误', null);
}