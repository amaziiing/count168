<?php
/**
 * Transaction History API
 * 用于查询账户的交易历史记录（弹窗显示）
 * 
 * 显示格式：
 * 1. 第一行：B/F (Opening Balance)
 * 2. 后续行：日期范围内的所有 transactions
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json; charset=utf-8');
// 禁止缓存 JSON：避免 CDN/浏览器长期返回旧排序逻辑
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: Thu, 01 Jan 1970 00:00:00 GMT');
header('X-Count168-History-Sort: calendar');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/transaction_scope.php';
require_once __DIR__ . '/../includes/money_decimal.php';
require_once __DIR__ . '/../includes/member_linked_closure.php';
require_once __DIR__ . '/bank_process_bill_display.php';
require_once __DIR__ . '/dcd_processed_quant.php';
require_once __DIR__ . '/../includes/transaction_approval.php';
require_once __DIR__ . '/type_pure_manual_filter_lib.php';

/**
 * 审批过滤：过滤未批准的审批交易（向后兼容：若无字段则不过滤）
 */
function historyHasContraApprovalColumns(PDO $pdo): bool
{
    static $has = null;
    if ($has !== null)
        return $has;
    $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'approval_status'");
    $has = $stmt->rowCount() > 0;
    return $has;
}

function historyContraApprovedWhere(PDO $pdo, string $alias = 't'): string
{
    return tx_sql_transaction_approval_where($pdo, $alias);
}

/** Set by main handler after tx_resolve_transaction_list_scope. */
function historyApiSetScopeFilter(array $filter, array $listScope): void
{
    $GLOBALS['HISTORY_SCOPE_FILTER'] = $filter;
    $GLOBALS['HISTORY_LIST_SCOPE'] = $listScope;
}

function historyApiTxnWhereSql(string $alias = 't'): string
{
    return (string) ($GLOBALS['HISTORY_SCOPE_FILTER']['sql'] ?? "{$alias}.company_id = ?");
}

function historyApiTxnWhereBind(): int
{
    return (int) ($GLOBALS['HISTORY_SCOPE_FILTER']['bind'] ?? 0);
}

function historyApiTxnWhereSqlForAlias(string $alias): string
{
    return str_replace('t.', $alias . '.', historyApiTxnWhereSql('t'));
}

function historyApiIsGroupLedger(): bool
{
    return !empty($GLOBALS['HISTORY_SCOPE_FILTER']['is_group']);
}

/** DCD / bank_process / legacy currency FK — anchor company in group ledger mode. */
function historyApiDcdCompanyId(): int
{
    if (historyApiIsGroupLedger()) {
        return (int) ($GLOBALS['HISTORY_SCOPE_FILTER']['perm_company_id'] ?? 0);
    }

    $bind = historyApiTxnWhereBind();

    return $bind > 0 ? $bind : (int) ($GLOBALS['HISTORY_SCOPE_FILTER']['perm_company_id'] ?? 0);
}

function historyApiListScope(): array
{
    return is_array($GLOBALS['HISTORY_LIST_SCOPE'] ?? null) ? $GLOBALS['HISTORY_LIST_SCOPE'] : [];
}

/**
 * 统计口径统一 6 位小数（展示仍在输出阶段按 2 位）。
 */
function historyTrunc2($value): string
{
    if ($value === null || trim((string)$value) === '') {
        return money_normalize('0', 6);
    }
    return money_normalize($value ?? '0', 6);
}

/**
 * Data Capture 统计值统一按 6 位小数参与算法。
 */
function historyDataCaptureProcessed2($value): string
{
    if ($value === null || trim((string)$value) === '') {
        return money_normalize('0', 6);
    }
    return money_normalize($value ?? '0', 6);
}

function historyFormat2($value): string
{
    return money_round_half_up($value ?? '0', 2);
}

/**
 * 将已是「分」粒度的金额格式化为两位小数字符串，不再套 historyTrunc2。
 * data_capture 的 Win/Loss 若再走 historyFormat2，IEEE 浮点 -40.8 会变成 -40.7999… 再被截成 -40.79。
 */
function historyFormatExactCents2($value): string
{
    if ($value === null || trim((string)$value) === '') {
        return money_round_half_up('0', 2);
    }
    return money_round_half_up($value ?? '0', 2);
}

function historyNeg($value): string
{
    return money_mul($value ?? '0', '-1', 8);
}

function historyDisplayDecimal($value, int $scale = 6): string
{
    if ($value === null || trim((string)$value) === '') {
        return '';
    }
    return money_out($value, $scale);
}

function historyFormatRateMax6($value): string
{
    if ($value === null || trim((string) $value) === '') {
        return '';
    }
    return historyDisplayDecimal($value, 6);
}

/**
 * @param array $dataPayload Keys: account, date_range, history
 */
function historyApiEchoSuccess(array $dataPayload): void
{
    echo json_encode([
        'success' => true,
        'data' => $dataPayload,
    ]);
}

/** Payment History：业务日 Y-m-d，按日历旧→新排序（与 Date 列同一业务含义） */
function historySortDateYmdFromRaw($raw): string
{
    $raw = trim((string) $raw);
    if ($raw === '' || $raw === '0000-00-00' || $raw === '0000-00-00 00:00:00') {
        return '9999-12-31';
    }
    // 与 date_from 入参一致：含「/」时先替换为「-」再 strtotime
    $try = strpos($raw, '/') !== false ? str_replace('/', '-', $raw) : $raw;
    $ts = strtotime($try);
    if ($ts === false) {
        return '9999-12-31';
    }
    return date('Y-m-d', $ts);
}

/** 与 process_post_to_transaction_api 一致：解析 bank_process.day_start（d/m/Y），避免 strtotime 美式歧义 */
function historyParseBankProcessDayStartToYmd($raw): ?string
{
    return bankProcessParseDayStartToYmd($raw);
}

/**
 * Bank process 入账（monthly / partial_first_month / day_end_tail）：Payment History 日期列以本笔 transactions.transaction_date 为准，
 * 不因 Resend / 编辑 Process 后 bank_process.day_start 变更而改写历史行。
 *
 * @param string|null $_bpDayStart 保留参数（兼容旧调用），不再参与计算
 * @param mixed $_bpDtsCreated 保留参数（兼容旧调用），不再参与计算
 */
function historyMonthlyBankProcessDisplayYmd(?string $_bpDayStart, $_bpDtsCreated, string $txnDateYmd): ?string
{
    $raw = trim((string) $txnDateYmd);
    if ($raw === '') {
        return null;
    }
    if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $raw, $m)) {
        return $m[1];
    }
    $ts = strtotime($raw);
    return $ts !== false ? date('Y-m-d', $ts) : null;
}

/**
 * Data Capture 行与交易穿插排序：created_at 常为完整 datetime，勿与 capture_date 拼成「2026-04-27 2026-04-27 12:00:00」导致 strtotime 失败、同日顺序错乱。
 */
function historyDataCaptureOrderTimestamp(array $capture): int
{
    $created = trim((string) ($capture['capture_created_at'] ?? ''));
    $datePart = trim((string) ($capture['capture_date'] ?? ''));
    if ($created !== '') {
        if (preg_match('/^\d{4}-\d{2}-\d{2}/', $created)) {
            $ts = strtotime($created);
            if ($ts !== false) {
                return $ts;
            }
        }
        if ($datePart !== '' && preg_match('/^\d{1,2}:\d{2}/', $created)) {
            $ts = strtotime($datePart . ' ' . $created);
            if ($ts !== false) {
                return $ts;
            }
        }
    }
    if ($datePart !== '') {
        $ts = strtotime($datePart);
        return $ts !== false ? $ts : 0;
    }
    return 0;
}

/**
 * 非 RATE 交易 / rollup / RATE 头：同日排序用时间戳。
 * 勿把业务日 Y-m-d 与 DB 返回的完整 datetime created_at 直接拼接，
 * 否则「2026-04-27」+「2026-04-27 18:30:00」→ strtotime 失败，
 * 再退化为仅日期则全体落在午夜，最后一条 submit 可能排到最前。
 */
function historyTransactionOrderTimestamp(string $displayDateYmd, $createdAt): int
{
    $datePart = trim((string) $displayDateYmd);
    if ($datePart !== '' && preg_match('/^(\d{4}-\d{2}-\d{2})/', $datePart, $m)) {
        $datePart = $m[1];
    } elseif ($datePart === '0000-00-00' || $datePart === '0000-00-00 00:00:00') {
        return 0;
    }

    $createdNorm = trim((string) ($createdAt ?? ''));
    if ($createdNorm !== '') {
        if (preg_match('/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/', $createdNorm)) {
            $ts = strtotime($createdNorm);
            if ($ts !== false) {
                return $ts;
            }
        }
        if ($datePart !== '' && preg_match('/^\d{1,2}:\d{2}/', $createdNorm)) {
            $ts = strtotime($datePart . ' ' . $createdNorm);
            if ($ts !== false) {
                return $ts;
            }
        }
    }
    if ($datePart === '') {
        return 0;
    }
    $ts = strtotime($datePart);
    return $ts !== false ? $ts : 0;
}

/**
 * 将 entry_type 映射为友好的 Product 显示名称
 */
function mapEntryTypeToProduct($entryType)
{
    if (empty($entryType)) {
        return 'RATE';
    }

    $mapping = [
        'RATE_FIRST_FROM' => 'RATE',
        'RATE_FIRST_TO' => 'RATE',
        'RATE_TRANSFER_FROM' => 'RATE',
        'RATE_TRANSFER_TO' => 'RATE',
        'RATE_MIDDLEMAN' => 'RATE',
        'RATE_FEE' => 'Fee',
        'RATE_PLATFORM_FEE' => 'Fee',
        'NORMAL_FROM' => 'TRANSFER',
        'NORMAL_TO' => 'TRANSFER'
    ];

    return $mapping[$entryType] ?? $entryType;
}

/**
 * Payment History：同一笔 RATE（同一 header）下，展示顺序固定为 FROM 侧先于 TO 侧，
 * 避免同一账户多行分录仅因 e.id 交错而出现「先 To 后 From」与对手账不一致。
 */
function historyRateLegSortGroup(?string $entryType): int
{
    $t = trim((string) ($entryType ?? ''));
    if (in_array($t, ['RATE_FIRST_FROM', 'RATE_TRANSFER_FROM'], true)) {
        return 0;
    }
    if (in_array($t, ['RATE_FIRST_TO', 'RATE_TRANSFER_TO'], true)) {
        return 1;
    }
    if ($t === 'RATE_MIDDLEMAN' || $t === 'RATE_FEE' || $t === 'RATE_PLATFORM_FEE') {
        return 2;
    }
    return 3;
}

/**
 * 移除描述末尾的 "(Rate: xxx)" 后缀（大小写不敏感）
 */
function stripTrailingRateSuffix(string $description): string
{
    return preg_replace('/\s*\((?:Rate|RATE):\s*[^)]*\)\s*$/i', '', $description) ?? $description;
}

/**
 * 从账户腿（RATE_FIRST_FROM/TO、RATE_TRANSFER_FROM/TO）的 description 里提取除法模式下
 * 用户原始输入的除数文本（如 "Transaction from A1 (Rate: /1.7)" → "1.7"）。
 * exchange_rate 列存的是该除数的倒数并被截断到 6 位小数，用它反推会有精度误差
 * （如 1/0.588235 ≈ 1.70000085），MARKUP 相减时会跟 Rate-Mul 差 0.00000x，
 * 因此优先用原始文本，避免二次取倒数造成的精度损失。
 */
function extractDivideRateDivisorText(?string $description): ?string
{
    if ($description === null || trim($description) === '') {
        return null;
    }
    if (!preg_match('/\((?:Rate|RATE)\s*:\s*\/\s*([0-9]+(?:\.[0-9]+)?)\s*\)/i', $description, $m)) {
        return null;
    }
    $value = trim($m[1]);
    return $value !== '' ? $value : null;
}

/**
 * 将旧版 RATE 描述改为：
 * EXCH RATE {rate} {from} > {to} | TO/FROM {account}
 */
function formatExchangeRateDescription(string $description, ?string $fromCurrencyCode = null, ?string $toCurrencyCode = null, $rateOverride = null, $fromAmount = null): string
{
    if (!preg_match('/^Transaction\s+(from|to)\s+(.+?)\s*\((?:Rate|RATE):\s*([^)]+)\)\s*$/i', $description, $matches)) {
        return $description;
    }

    $direction = strtoupper(trim($matches[1]));
    $otherAccount = trim($matches[2]);
    $rateText = $rateOverride !== null && $rateOverride !== ''
        ? trim((string) $rateOverride)
        : trim($matches[3]);
    if ($rateText !== '' && money_is_valid($rateText)) {
        $rateText = historyFormatRateMax6($rateText);
    }

    $formatted = 'EXCH RATE ' . $rateText;
    if (!empty($fromCurrencyCode) && !empty($toCurrencyCode)) {
        $formatted .= ' ' . trim($fromCurrencyCode);
        if ($fromAmount !== null && $fromAmount !== '') {
            $formattedAmount = historyDisplayDecimal($fromAmount, 6);
            if ($formattedAmount !== '') {
                $formatted .= ' ' . $formattedAmount;
            }
        }
        $formatted .= ' > ' . trim($toCurrencyCode);
    }

    return $formatted . ' | ' . $direction . ' ' . $otherAccount;
}

/**
 * 将 middle-man 描述改为：
 * MARKUP {rate} | {from} {amount} > {to} | FROM {account}
 */
function formatMarkupDescription(string $description, ?string $fromCurrencyCode = null, ?string $toCurrencyCode = null, $middlemanRate = null, $fromAmount = null, ?string $fromAccountCode = null): string
{
    if ($middlemanRate === null || $middlemanRate === '') {
        if (!preg_match('/^Rate\s+charge\s+\((?:x|X)?\s*([^)]+)\)\s+from\s+.+$/i', $description, $matches)) {
            return $description;
        }
        $middlemanRate = trim($matches[1]);
    } else {
        // 展示口径：MARKUP 差额完整展示（最多 6 位小数，去掉多余的 0；整数则只显示整数）。
        $middlemanRate = money_out($middlemanRate, 6);
    }

    $formatted = 'MARKUP ' . $middlemanRate;
    if (!empty($fromCurrencyCode) && !empty($toCurrencyCode)) {
        $formatted .= ' ' . trim($fromCurrencyCode);
        if ($fromAmount !== null && $fromAmount !== '') {
            $formattedAmount = historyDisplayDecimal($fromAmount, 6);
            if ($formattedAmount !== '') {
                $formatted .= ' ' . $formattedAmount;
            }
        }
        $formatted .= ' > ' . trim($toCurrencyCode);
    }

    if (!empty($fromAccountCode)) {
        $formatted .= ' | FROM ' . trim($fromAccountCode);
    }

    return $formatted;
}

/**
 * 确保 data_capture_details.rate 至少支持 8 位小数，避免历史弹窗读取时已被截断到 4 位。
 * rate_expression：优先 migration；缺失时 historyHasRateExpressionColumn 会做一次安全 ADD COLUMN。
 */
function ensureHistoryRatePrecision(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;

    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM data_capture_details LIKE 'rate'");
        $column = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        if (!$column) {
            return;
        }

        $type = strtolower((string) ($column['Type'] ?? ''));
        $needsUpgrade = false;
        if (preg_match('/decimal\(\s*\d+\s*,\s*(\d+)\s*\)/i', $type, $matches)) {
            $scale = (int) $matches[1];
            $needsUpgrade = $scale < 8;
        } elseif ($type !== '' && strpos($type, 'decimal') !== 0) {
            $needsUpgrade = true;
        }

        if ($needsUpgrade) {
            $pdo->exec("ALTER TABLE data_capture_details MODIFY COLUMN rate DECIMAL(20,8) NULL");
        }
    } catch (Exception $e) {
        // 不阻塞主流程，仅记录日志
        error_log('history_api rate precision ensure warning: ' . $e->getMessage());
    }
}

/**
 * Whether data_capture_details.rate_expression exists.
 * Prefer migration 20260713; runtime ADD is a safe fallback so History can show *3 / /3.
 */
function historyHasRateExpressionColumn(PDO $pdo): bool
{
    static $cached = null;
    if ($cached === true) {
        return true;
    }
    try {
        $st = $pdo->query("SHOW COLUMNS FROM data_capture_details LIKE 'rate_expression'");
        if ($st && $st->fetch(PDO::FETCH_ASSOC)) {
            $cached = true;
            return true;
        }
    } catch (Throwable $e) {
        error_log('history_api rate_expression column check: ' . $e->getMessage());
    }

    if ($cached === false) {
        return false;
    }

    try {
        $pdo->exec(
            "ALTER TABLE `data_capture_details`
             ADD COLUMN `rate_expression` VARCHAR(64) NULL DEFAULT NULL
             COMMENT 'Original rate text e.g. *3 /3 3' AFTER `rate`"
        );
        error_log('history_api added data_capture_details.rate_expression (runtime fallback)');
        $cached = true;
        return true;
    } catch (Throwable $e) {
        error_log('history_api rate_expression ensure warning: ' . $e->getMessage());
        $cached = false;
        return false;
    }
}

/** SELECT fragment for rate_expression — NULL alias when column missing. */
function historyRateExpressionSelectSql(PDO $pdo): string
{
    return historyHasRateExpressionColumn($pdo)
        ? 'dcd.rate_expression'
        : 'NULL AS rate_expression';
}

function historyResolveCompanyOwnerCode(PDO $pdo, int $companyId): string
{
    if ($companyId <= 0)
        return '';
    try {
        $st = $pdo->prepare("
            SELECT TRIM(COALESCE(o.owner_code, '')) AS oc
            FROM company c
            INNER JOIN owner o ON o.id = c.owner_id
            WHERE c.id = ?
            LIMIT 1
        ");
        $st->execute([$companyId]);
        $v = $st->fetchColumn();
        return ($v !== false && $v !== null) ? strtoupper(trim((string) $v)) : '';
    } catch (PDOException $e) {
        return '';
    }
}

function historyResolveProfitDisplayCode(PDO $pdo, int $companyId): string
{
    try {
        $st = $pdo->prepare("
            SELECT UPPER(TRIM(COALESCE(a.account_id, ''))) AS account_code
            FROM account a
            INNER JOIN account_company ac ON ac.account_id = a.id
            WHERE ac.company_id = ?
              AND (
                    LOWER(TRIM(COALESCE(a.role, ''))) = 'profit'
                    OR UPPER(TRIM(COALESCE(a.account_id, ''))) = 'PROFIT'
              )
            ORDER BY CASE WHEN UPPER(TRIM(COALESCE(a.account_id, ''))) = 'PROFIT' THEN 0 ELSE 1 END, a.id ASC
            LIMIT 1
        ");
        $st->execute([$companyId]);
        $v = $st->fetchColumn();
        if ($v !== false && $v !== null && trim((string) $v) !== '') {
            return strtoupper(trim((string) $v));
        }
    } catch (PDOException $e) {
    }
    return 'PROFIT';
}

/** Domain fee 类 sms 是否 Group 租户（含 GROUP| 段） */
function historyIsDomainFeeGroupTenant(string $sms): bool
{
    return (bool) preg_match('/^\[DOMAIN_(?:LIST_FEE|SHARE_COMMISSION|NET_PROFIT)\|GROUP\|/i', trim($sms));
}

/**
 * Payment History 描述：Group 付 Domain Fee 时追加 (Group)，Company 不变。
 */
function historyAppendDomainGroupLabel(string $description, string $sms = '', ?PDO $pdo = null, int $companyId = 0, string $srcCode = '', string $dateFromDb = '', string $dateToDb = ''): string
{
    if (historyIsDomainFeeGroupTenant($sms)) {
        if (stripos($description, '(Group)') !== false) {
            return $description;
        }
        return $description . ' (Group)';
    }
    $srcU = strtoupper(trim($srcCode));
    if ($pdo !== null && $companyId > 0 && $srcU !== '' && $dateFromDb !== '' && $dateToDb !== '') {
        try {
            $st = $pdo->prepare("
                SELECT 1 FROM transactions
                WHERE company_id = ? AND transaction_type = 'PAYMENT'
                  AND sms LIKE ?
                  AND DATE(transaction_date) BETWEEN ? AND ?
                LIMIT 1
            ");
            $st->execute([$companyId, '[DOMAIN_LIST_FEE|GROUP|' . $srcU . '%', $dateFromDb, $dateToDb]);
            if ($st->fetchColumn() !== false) {
                if (stripos($description, '(Group)') !== false) {
                    return $description;
                }
                return $description . ' (Group)';
            }
        } catch (PDOException $e) {
            // ignore
        }
    }
    return $description;
}

/** sms 形如 [DOMAIN_NET_PROFIT|QA] 或 [DOMAIN_NET_PROFIT|GROUP|AP] */
function historyParseDomainNetProfitSourceCompany(string $sms): string
{
    $t = trim($sms);
    if (preg_match('/^\[DOMAIN_NET_PROFIT\|GROUP\|([^\]|]+)/i', $t, $m)) {
        return strtoupper(trim($m[1]));
    }
    if (preg_match('/^\[DOMAIN_NET_PROFIT\|([^\]|]+)/i', $t, $m)) {
        return strtoupper(trim($m[1]));
    }
    return '';
}

/** sms 形如 [DOMAIN_LIST_FEE|QA] 或 [DOMAIN_LIST_FEE|GROUP|AP] */
function historyParseDomainListFeeSourceCompany(string $sms): string
{
    $t = trim($sms);
    if (preg_match('/^\[DOMAIN_LIST_FEE\|GROUP\|([^\]|]+)/i', $t, $m)) {
        return strtoupper(trim((string) ($m[1] ?? '')));
    }
    if (preg_match('/^\[DOMAIN_LIST_FEE\|([^\]|]+)/i', $t, $m)) {
        return strtoupper(trim((string) ($m[1] ?? '')));
    }
    return '';
}

function historyIsAutoRenewFeeSms(string $sms): bool
{
    $s = trim($sms);
    return stripos($s, '[AUTO_RENEW|') === 0
        && stripos($s, '[AUTO_RENEW|COMMISSION|') !== 0
        && stripos($s, '[AUTO_RENEW|NET_PROFIT|') !== 0;
}

function historyParseAutoRenewFeeTenantCode(string $sms): string
{
    $s = trim($sms);
    if (preg_match('/^\[AUTO_RENEW\|GROUP\|([^|\]]+)/i', $s, $m)) {
        return strtoupper(trim((string) ($m[1] ?? '')));
    }
    if (preg_match('/^\[AUTO_RENEW\|([^|\]]+)/i', $s, $m)) {
        $code = strtoupper(trim((string) ($m[1] ?? '')));
        if (in_array($code, ['COMMISSION', 'NET_PROFIT', 'GROUP'], true)) {
            return '';
        }
        return $code;
    }
    return '';
}

function historyParseAutoRenewCommissionTenantCode(string $sms): ?string
{
    $s = trim($sms);
    if ($s === '') {
        return null;
    }
    if (preg_match('/^\[AUTO_RENEW\|COMMISSION\|GROUP\|([^|\]]+)/i', $s, $m)) {
        $v = strtoupper(trim((string) ($m[1] ?? '')));
        return $v !== '' ? $v : null;
    }
    if (preg_match('/^\[AUTO_RENEW\|COMMISSION\|([^|\]]+)/i', $s, $m)) {
        $v = strtoupper(trim((string) ($m[1] ?? '')));
        return $v !== '' ? $v : null;
    }
    return null;
}

/** Auto Renew 佣金来源：被续费公司（与 Domain「Commission From 客户公司」口径一致） */
function historyResolveAutoRenewCommissionSourceCompany(string $smsText, string $descText): string
{
    $tenant = historyParseAutoRenewCommissionTenantCode($smsText);
    if ($tenant !== null && $tenant !== '') {
        return $tenant;
    }
    if (preg_match('/Commision\s+for\s+([A-Za-z0-9_-]+)/i', $descText, $mFor)) {
        $code = strtoupper(trim((string) ($mFor[1] ?? '')));
        if ($code !== '') {
            return $code;
        }
    }
    return 'LAG';
}

/**
 * Share% Profit 池账号：将「入账 List Fee + 同源 Sales/CS/IT 佣金划出」合并为一条净 Profit 行（Payment History 展示口径）。
 * 无佣金（Profit 100%）时仍合并：隐藏原始 Pay Domain Fee，展示 Net Profit From {src}。
 * @return array skip=txn id 集合, rollups=合并行元数据
 */
function historyCollectDomainHubProfitRollup(array $transactions, array $account_ids_int): array
{
    $skip = [];
    $rollups = [];
    $hubSet = [];
    foreach ($account_ids_int as $hid) {
        if ($hid > 0) {
            $hubSet[$hid] = true;
        }
    }
    if (empty($hubSet)) {
        return ['skip' => $skip, 'rollups' => $rollups];
    }
    foreach ($transactions as $t) {
        if (($t['transaction_type'] ?? '') !== 'PAYMENT') {
            continue;
        }
        $sms = trim((string) ($t['sms'] ?? ''));
        $isDomainListFee = stripos($sms, '[DOMAIN_LIST_FEE|') === 0;
        $isAutoRenewFee = historyIsAutoRenewFeeSms($sms);
        if (!$isDomainListFee && !$isAutoRenewFee) {
            continue;
        }
        $hubId = (int) ($t['account_id'] ?? 0);
        if (!isset($hubSet[$hubId])) {
            continue;
        }
        $feeId = (int) ($t['id'] ?? 0);
        if ($feeId <= 0) {
            continue;
        }
        $src = $isDomainListFee ? historyParseDomainListFeeSourceCompany($sms) : historyParseAutoRenewFeeTenantCode($sms);
        if ($src === '') {
            continue;
        }
        $feeAmt = historyTrunc2($t['amount'] ?? '0');
        $commTotal = '0';
        $commIds = [];
        foreach ($transactions as $t2) {
            if (($t2['transaction_type'] ?? '') !== 'PAYMENT') {
                continue;
            }
            $sms2 = trim((string) ($t2['sms'] ?? ''));
            $isDomainComm = stripos($sms2, '[DOMAIN_SHARE_COMMISSION|') === 0;
            $isAutoRenewComm = stripos($sms2, '[AUTO_RENEW|COMMISSION|') === 0;
            if (!$isDomainComm && !$isAutoRenewComm) {
                continue;
            }
            if ((int) ($t2['from_account_id'] ?? 0) !== $hubId) {
                continue;
            }
            if ($isDomainComm) {
                $src2 = historyParseDomainShareCommissionSourceCompanyCode($sms2);
                if ($src2 === null || strtoupper((string) $src2) !== $src) {
                    continue;
                }
            } else {
                $src2 = historyParseAutoRenewCommissionTenantCode($sms2);
                if ($src2 === null || strtoupper((string) $src2) !== $src) {
                    continue;
                }
            }
            if (!preg_match('/\|ROLE:(SALES|CS|IT)\|/i', $sms2)) {
                continue;
            }
            $id2 = (int) ($t2['id'] ?? 0);
            if ($id2 <= 0 || $id2 === $feeId) {
                continue;
            }
            $commTotal = money_add($commTotal, historyTrunc2($t2['amount'] ?? '0'), 8);
            $commIds[] = $id2;
        }
        // 有佣金：net = fee - commission；无佣金（Profit 100%）：net = fee，仍走 Net Profit From 展示
        $net = historyTrunc2(money_sub($feeAmt, $commTotal, 8));
        if (money_cmp(money_abs($net), '0.00001') < 0) {
            continue;
        }
        $skip[$feeId] = true;
        foreach ($commIds as $cid) {
            $skip[$cid] = true;
        }
        $rollups[] = [
            'fee_tx' => $t,
            'net' => $net,
            'src' => $src,
        ];
    }
    return ['skip' => $skip, 'rollups' => $rollups];
}

function historyResolveDomainSubmitter(PDO $pdo, int $companyId, string $dateFromDb, string $dateToDb): string
{
    try {
        $st = $pdo->prepare("
            SELECT COALESCE(u.login_id, o.owner_code, '-') AS submitter
            FROM transactions t
            LEFT JOIN user u ON t.created_by = u.id
            LEFT JOIN owner o ON t.created_by_owner = o.id
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND DATE(t.transaction_date) BETWEEN ? AND ?
              AND (
                    t.sms LIKE '[DOMAIN_NET_PROFIT|%'
                    OR t.sms LIKE '[DOMAIN_LIST_FEE|%'
                    OR t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%'
                    OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'PROFIT BY %'
              )
            ORDER BY t.created_at DESC, t.id DESC
            LIMIT 1
        ");
        $st->execute([$companyId, $dateFromDb, $dateToDb]);
        $v = $st->fetchColumn();
        if ($v !== false && $v !== null && trim((string) $v) !== '' && strtolower(trim((string) $v)) !== 'null') {
            return trim((string) $v);
        }
    } catch (PDOException $e) {
    }
    // 最后兜底：优先当前会话用户（通常就是提交人）
    try {
        $sessionUserType = strtolower((string) ($_SESSION['user_type'] ?? ''));
        if ($sessionUserType === 'owner') {
            $ownerId = (int) ($_SESSION['owner_id'] ?? $_SESSION['user_id'] ?? 0);
            if ($ownerId > 0) {
                $st2 = $pdo->prepare("SELECT owner_code FROM owner WHERE id = ? LIMIT 1");
                $st2->execute([$ownerId]);
                $oc = $st2->fetchColumn();
                if ($oc !== false && $oc !== null && trim((string) $oc) !== '') {
                    return trim((string) $oc);
                }
            }
        } else {
            $userId = (int) ($_SESSION['user_id'] ?? 0);
            if ($userId > 0) {
                $st3 = $pdo->prepare("SELECT login_id FROM user WHERE id = ? LIMIT 1");
                $st3->execute([$userId]);
                $lid = $st3->fetchColumn();
                if ($lid !== false && $lid !== null && trim((string) $lid) !== '') {
                    return trim((string) $lid);
                }
            }
        }
    } catch (PDOException $e) {
        // ignore fallback errors
    }
    return '-';
}

function historyParseDomainShareCommissionSourceCompanyCode(string $sms): ?string
{
    $s = trim($sms);
    if ($s === '')
        return null;
    if (preg_match('/^\[DOMAIN_SHARE_COMMISSION\|GROUP\|([^|\]]+)/i', $s, $m)) {
        $v = strtoupper(trim((string) $m[1]));
        return $v !== '' ? $v : null;
    }
    if (preg_match('/^\[DOMAIN_SHARE_COMMISSION\|([^|\]]+)/i', $s, $m)) {
        $v = strtoupper(trim((string) $m[1]));
        return $v !== '' && $v !== 'GROUP' ? $v : null;
    }
    return null;
}

function historyResolveDomainShareRoleLabel(string $description, string $sms = ''): string
{
    $s = trim($sms);
    if ($s !== '' && preg_match('/\|ROLE:(PROFIT|SALES|CS|IT)\|/i', $s, $mSms)) {
        $code = strtoupper(trim((string) ($mSms[1] ?? '')));
        if ($code === 'PROFIT') {
            return 'PROFIT';
        }
        if (in_array($code, ['SALES', 'CS', 'IT'], true)) {
            return $code;
        }
    }
    $d = trim($description);
    if (preg_match('/^Profit\s+Commision\b/i', $d) || preg_match('/^Profit\s+Commission\b/i', $d) || preg_match('/^Profit\s+for\b/i', $d)) {
        return 'PROFIT';
    }
    if (preg_match('/^(Sales|CS|IT)\s+Commision\b/i', $d, $m)) {
        return strtoupper(trim((string) $m[1]));
    }
    if (preg_match('/^(Sales|CS|IT)\s+Commission\b/i', $d, $m)) {
        return strtoupper(trim((string) $m[1]));
    }
    return 'COMMISSION';
}

function buildVirtualDomainListFeeHistory(
    PDO $pdo,
    int $companyId,
    string $sourceCompanyCode,
    string $dateFromDb,
    string $dateToDb,
    ?int $currencyId = null
): array {
    $src = strtoupper(trim($sourceCompanyCode));
    if ($src === '')
        throw new Exception('虚拟公司代码为空');
    $ownerCode = historyResolveCompanyOwnerCode($pdo, $companyId);
    if ($ownerCode === '')
        $ownerCode = 'C168';

    $currencyById = [];
    $stCur = $pdo->prepare("SELECT id, UPPER(code) AS code FROM currency WHERE company_id = ?");
    $stCur->execute([$companyId]);
    foreach ($stCur->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $currencyById[(int) $r['id']] = strtoupper((string) $r['code']);
    }

    $fallbackSubmitter = historyResolveDomainSubmitter($pdo, $companyId, $dateFromDb, $dateToDb);
    $sql = "SELECT t.id, t.amount, t.currency_id, t.transaction_date, t.description, t.sms,
                   COALESCE(u.login_id, o.owner_code, '') AS created_by
            FROM transactions t
            LEFT JOIN user u ON t.created_by = u.id
            LEFT JOIN owner o ON t.created_by_owner = o.id
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND DATE(t.transaction_date) BETWEEN ? AND ?
              AND (
                    t.sms LIKE ?
                    OR t.sms LIKE ?
                    OR UPPER(TRIM(COALESCE(t.description, ''))) = ?
                    OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE ?
              )";
    $params = [
        $companyId,
        $dateFromDb,
        $dateToDb,
        "[DOMAIN_LIST_FEE|{$src}]%",
        "[DOMAIN_LIST_FEE|GROUP|{$src}]%",
        "DOMAIN LIST FEE FROM {$src}",
        "DOMAIN LIST FEE FROM %({$src})"
    ];
    if ($currencyId !== null && $currencyId > 0) {
        $sql .= " AND t.currency_id = ?";
        $params[] = $currencyId;
    }
    $sql .= " ORDER BY t.transaction_date ASC, t.id ASC";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    $displayCurrency = '-';
    if ($currencyId !== null && $currencyId > 0) {
        $displayCurrency = $currencyById[$currencyId] ?? '-';
    } elseif (!empty($rows)) {
        $cid0 = (int) ($rows[0]['currency_id'] ?? 0);
        $displayCurrency = $cid0 > 0 ? ($currencyById[$cid0] ?? '-') : '-';
    }

    $history = [
        [
            'date' => 'B/F',
            'product' => '-',
            'card_owner' => '-',
            'is_bank_process_transaction' => false,
            'currency' => $displayCurrency,
            'percent' => '-',
            'rate' => '-',
            'win_loss' => '-',
            'cr_dr' => '-',
            'balance' => historyFormat2(0),
            'description' => 'OPENING BALANCE',
            'sms' => '-',
            'remark' => '-',
            'created_by' => '-',
            'transaction_type' => 'PAYMENT',
            'row_type' => 'bf'
        ]
    ];

    $running = '0';
    foreach ($rows as $r) {
        $amt = historyTrunc2($r['amount'] ?? '0');
        if (money_cmp(money_abs($amt), '0.00001') < 0)
            continue;
        $cid = (int) ($r['currency_id'] ?? 0);
        $cur = $cid > 0 ? ($currencyById[$cid] ?? $displayCurrency) : $displayCurrency;
        $cr = money_mul($amt, '-1', 8);
        $running = historyTrunc2(money_add($running, $cr, 8));
        $history[] = [
            'date' => date('d/m/Y', strtotime((string) $r['transaction_date'])),
            'product' => 'PAYMENT',
            'card_owner' => '-',
            'is_bank_process_transaction' => false,
            'currency' => $cur,
            'percent' => '-',
            'rate' => '-',
            'win_loss' => historyFormat2(0),
            'cr_dr' => historyFormat2($cr),
            'balance' => historyFormat2($running),
            'description' => historyAppendDomainGroupLabel(
                $src . ' Pay For ' . $ownerCode,
                (string) ($r['sms'] ?? '')
            ),
            'sms' => '-',
            'remark' => '-',
            'created_by' => '-',
            'transaction_type' => 'PAYMENT',
            'row_type' => 'txn'
        ];
    }

    return [
        'account' => [
            'id' => 0,
            'account_id' => $src,
            'name' => $src,
            'currency' => $displayCurrency
        ],
        'history' => $history
    ];
}

function buildVirtualDomainNetProfitHistory(
    PDO $pdo,
    int $companyId,
    string $ownerCode,
    string $dateFromDb,
    string $dateToDb,
    ?int $currencyId = null
): array {
    $companyOwnerCode = strtoupper(trim(historyResolveCompanyOwnerCode($pdo, $companyId)));
    $profitDisplayCode = strtoupper(trim(historyResolveProfitDisplayCode($pdo, $companyId)));
    $owner = $companyOwnerCode;
    // virtual_company_code 现在可能传的是 PROFIT 账户代码；BY 后缀要显示公司 owner code（如 K）。
    if ($owner === '') {
        $owner = strtoupper(trim($ownerCode));
    }
    if ($owner !== '' && $profitDisplayCode !== '' && $owner === $profitDisplayCode && $companyOwnerCode !== '') {
        $owner = $companyOwnerCode;
    }
    if ($owner === '') {
        $owner = 'C168';
    }
    // 请求参数 virtual_company_code：来源公司代码（如 QA），用于解析 Share% Profit 入账账号
    $srcCompanyParam = strtoupper(trim($ownerCode));
    $fallbackSubmitter = historyResolveDomainSubmitter($pdo, $companyId, $dateFromDb, $dateToDb);

    $currencyById = [];
    $stCur = $pdo->prepare("SELECT id, UPPER(code) AS code FROM currency WHERE company_id = ?");
    $stCur->execute([$companyId]);
    foreach ($stCur->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $currencyById[(int) $r['id']] = strtoupper((string) $r['code']);
    }

    $sql = "SELECT t.id, t.amount, t.currency_id, t.transaction_date, t.description, t.sms
            FROM transactions t
            WHERE t.company_id = ?
              AND t.transaction_type = 'PAYMENT'
              AND DATE(t.transaction_date) BETWEEN ? AND ?
              AND (
                    t.sms LIKE '[DOMAIN_NET_PROFIT|%'
                    OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'PROFIT BY %'
              )";
    $params = [$companyId, $dateFromDb, $dateToDb];
    if ($currencyId !== null && $currencyId > 0) {
        $sql .= " AND t.currency_id = ?";
        $params[] = $currencyId;
    }
    $sql .= " ORDER BY t.transaction_date ASC, t.id ASC";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);

    // 若真实利润单未落库，则与交易页一致：动态按 Fee - Commission 兜底显示
    if (empty($rows)) {
        $aggSql = "SELECT
                     t.currency_id,
                     SUM(CASE
                           WHEN t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %'
                           THEN t.amount
                           ELSE 0
                         END) AS fee_total,
                     SUM(CASE
                           WHEN t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'COMMISION FOR %'
                           THEN t.amount
                           ELSE 0
                         END) AS comm_total
                   FROM transactions t
                   WHERE t.company_id = ?
                     AND t.transaction_type = 'PAYMENT'
                     AND DATE(t.transaction_date) BETWEEN ? AND ?
                   GROUP BY t.currency_id";
        $aggParams = [$companyId, $dateFromDb, $dateToDb];
        if ($currencyId !== null && $currencyId > 0) {
            $aggSql = "SELECT x.currency_id, x.fee_total, x.comm_total FROM (" . $aggSql . ") x WHERE x.currency_id = ?";
            $aggParams[] = $currencyId;
        }
        $aggSt = $pdo->prepare($aggSql);
        $aggSt->execute($aggParams);
        foreach ($aggSt->fetchAll(PDO::FETCH_ASSOC) as $ar) {
            $cid = (int) ($ar['currency_id'] ?? 0);
            if ($cid <= 0)
                continue;
            $fee = historyTrunc2($ar['fee_total'] ?? '0');
            $comm = historyTrunc2($ar['comm_total'] ?? '0');
            $net = historyTrunc2(money_sub($fee, $comm, 8));
            if (money_cmp($net, '0') <= 0)
                continue;
            $dynSrc = $srcCompanyParam !== '' ? $srcCompanyParam : $owner;
            $rows[] = [
                'id' => 0,
                'amount' => $net,
                'currency_id' => $cid,
                'transaction_date' => $dateToDb,
                'description' => historyAppendDomainGroupLabel(
                    'Net Profit From ' . $dynSrc,
                    '',
                    $pdo,
                    $companyId,
                    $dynSrc,
                    $dateFromDb,
                    $dateToDb
                ),
                'sms' => '[DOMAIN_NET_PROFIT|DYNAMIC]',
                'created_by' => $fallbackSubmitter
            ];
        }
    }

    $displayCurrency = '-';
    if ($currencyId !== null && $currencyId > 0) {
        $displayCurrency = $currencyById[$currencyId] ?? '-';
    } elseif (!empty($rows)) {
        $cid0 = (int) ($rows[0]['currency_id'] ?? 0);
        $displayCurrency = $cid0 > 0 ? ($currencyById[$cid0] ?? '-') : '-';
    }

    $history = [
        [
            'date' => 'B/F',
            'product' => '-',
            'card_owner' => '-',
            'is_bank_process_transaction' => false,
            'currency' => $displayCurrency,
            'percent' => '-',
            'rate' => '-',
            'win_loss' => '-',
            'cr_dr' => '-',
            'balance' => historyFormat2(0),
            'description' => 'OPENING BALANCE',
            'sms' => '-',
            'remark' => '-',
            'created_by' => '-',
            'transaction_type' => 'PAYMENT',
            'row_type' => 'bf'
        ]
    ];

    $running = '0';
    foreach ($rows as $r) {
        $amt = historyTrunc2($r['amount'] ?? '0');
        if (money_cmp(money_abs($amt), '0.00001') < 0)
            continue;
        $cid = (int) ($r['currency_id'] ?? 0);
        $cur = $cid > 0 ? ($currencyById[$cid] ?? $displayCurrency) : $displayCurrency;
        $cr = historyTrunc2($amt);
        $running = historyTrunc2(money_add($running, $cr, 8));
        $srcFromRow = historyParseDomainNetProfitSourceCompany((string) ($r['sms'] ?? ''));
        if ($srcFromRow === '' || strtoupper($srcFromRow) === 'DYNAMIC') {
            $srcFromRow = $srcCompanyParam !== '' ? $srcCompanyParam : $owner;
        }
        $descNet = historyAppendDomainGroupLabel(
            'Net Profit From ' . $srcFromRow,
            (string) ($r['sms'] ?? ''),
            $pdo,
            $companyId,
            $srcFromRow,
            $dateFromDb,
            $dateToDb
        );
        $history[] = [
            'date' => date('d/m/Y', strtotime((string) $r['transaction_date'])),
            'product' => 'PROFIT',
            'card_owner' => '-',
            'is_bank_process_transaction' => false,
            'currency' => $cur,
            'percent' => '-',
            'rate' => '-',
            'win_loss' => historyFormat2(0),
            'cr_dr' => historyFormat2($cr),
            'balance' => historyFormat2($running),
            'description' => $descNet,
            'sms' => '-',
            'remark' => '-',
            'created_by' => (trim((string) ($r['created_by'] ?? '')) !== '' ? trim((string) $r['created_by']) : $fallbackSubmitter),
            'transaction_type' => 'PAYMENT',
            'row_type' => 'txn'
        ];
    }

    // 弹窗标题与所点 DOMAIN 行一致（virtual_company_code = 公司代码或展示用 account_id），勿用 Share% Profit 账号替代
    $titleCode = $srcCompanyParam !== '' ? $srcCompanyParam : $owner;
    $titleName = $titleCode;
    try {
        $sto = $pdo->prepare("
            SELECT TRIM(COALESCE(o.name, '')) AS n
            FROM company c
            INNER JOIN owner o ON o.id = c.owner_id
            WHERE UPPER(TRIM(c.company_id)) = ? OR UPPER(TRIM(IFNULL(c.group_id, ''))) = ?
            ORDER BY c.id ASC
            LIMIT 1
        ");
        $sto->execute([$titleCode, $titleCode]);
        $n = trim((string) ($sto->fetchColumn() ?: ''));
        if ($n !== '') {
            $titleName = $n;
        }
    } catch (Exception $e) {
    }

    return [
        'account' => [
            'id' => 0,
            'account_id' => $titleCode,
            'name' => $titleName,
            'currency' => $displayCurrency
        ],
        'history' => $history
    ];
}

/**
 * 未指定 currency 时补充 B/F 币别来源：account_currency + 全历史交易/DCD/RATE。
 * 与 search_api 一致，确保区间内无动账但仍有期初余额的币别（如仅 B/F 的 USD）纳入 bf_per_currency。
 *
 * @param array<string, true> $codeSet
 */
function historySupplementBfCurrencyCodeSet(
    PDO $pdo,
    array $account_ids,
    string $account_code,
    int $company_id,
    bool $has_currency_id,
    string $history_txn_where,
    int $history_txn_bind,
    bool $history_is_group,
    array &$codeSet
): void {
    $addCode = static function (?string $code) use (&$codeSet): void {
        $cc = trim((string) $code);
        if ($cc !== '') {
            $codeSet[$cc] = true;
        }
    };

    if (empty($account_ids)) {
        return;
    }

    $phAcc = implode(',', array_fill(0, count($account_ids), '?'));
    try {
        $acStmt = $pdo->prepare("
            SELECT DISTINCT TRIM(c.code) AS code
            FROM account_currency ac
            INNER JOIN currency c ON ac.currency_id = c.id
            WHERE ac.account_id IN ($phAcc)
              AND c.code IS NOT NULL AND TRIM(c.code) <> ''
        ");
        $acStmt->execute($account_ids);
        while ($row = $acStmt->fetch(PDO::FETCH_ASSOC)) {
            $addCode($row['code'] ?? '');
        }
    } catch (Throwable $e) {
        // account_currency 表不存在或结构差异时跳过
    }

    if (!$has_currency_id) {
        return;
    }

    try {
        $txHistStmt = $pdo->prepare("
            SELECT DISTINCT TRIM(c.code) AS code
            FROM transactions t
            INNER JOIN currency c ON t.currency_id = c.id
            WHERE {$history_txn_where}
              AND t.transaction_type <> 'RATE'
              AND (t.account_id IN ($phAcc) OR t.from_account_id IN ($phAcc))
              AND t.currency_id IS NOT NULL
        ");
        $txHistStmt->execute(array_merge([$history_txn_bind], $account_ids, $account_ids));
        while ($row = $txHistStmt->fetch(PDO::FETCH_ASSOC)) {
            $addCode($row['code'] ?? '');
        }
    } catch (Throwable $e) {
        // 忽略
    }

    $accId = (int) ($account_ids[0] ?? 0);
    $accCode = trim($account_code);
    try {
        $dcdStmt = $pdo->prepare("
            SELECT DISTINCT TRIM(c.code) AS code
            FROM data_capture_details dcd
            INNER JOIN currency c ON dcd.currency_id = c.id
            WHERE (dcd.company_id = ? OR dcd.company_id IS NULL)
              AND (
                  TRIM(CAST(dcd.account_id AS CHAR)) = TRIM(CAST(? AS CHAR))
                  OR (? <> '' AND TRIM(COALESCE(dcd.account_id, '')) = TRIM(?))
              )
              AND c.code IS NOT NULL AND TRIM(c.code) <> ''
        ");
        $dcdStmt->execute([$company_id, $accId, $accCode, $accCode]);
        while ($row = $dcdStmt->fetch(PDO::FETCH_ASSOC)) {
            $addCode($row['code'] ?? '');
        }
    } catch (Throwable $e) {
        // 忽略
    }

    try {
        $rateHistStmt = $pdo->prepare("
            SELECT DISTINCT TRIM(c.code) AS code
            FROM transaction_entry e
            INNER JOIN transactions h ON e.header_id = h.id
            INNER JOIN currency c ON e.currency_id = c.id
            WHERE " . historyApiTxnWhereSqlForAlias('h') . "
              " . ($history_is_group ? '' : 'AND e.company_id = ?') . "
              AND h.transaction_type = 'RATE'
              AND e.account_id IN ($phAcc)
              AND c.code IS NOT NULL AND TRIM(c.code) <> ''
        ");
        $rateHistParams = array_merge([$history_txn_bind], $history_is_group ? [] : [$company_id], $account_ids);
        $rateHistStmt->execute($rateHistParams);
        while ($row = $rateHistStmt->fetch(PDO::FETCH_ASSOC)) {
            $addCode($row['code'] ?? '');
        }
    } catch (Throwable $e) {
        // 忽略
    }
}

/**
 * 未指定 currency 且无法从查询区间识别币别时：单币别 B/F（与旧版 dcd / account_currency 回退一致）
 *
 * @return array{bf: string, bfCurrency: string|null}
 */
function historyLegacySingleBfNoCurrencyFilter(PDO $pdo, array $account_ids, int $company_id, string $account_code, string $date_from_start): array
{
    $bf = '0';
    $bfCurrency = null;
    $placeholders = implode(',', array_fill(0, count($account_ids), '?'));
    $stmt = $pdo->prepare("
        SELECT DISTINCT c.code 
        FROM data_capture_details dcd
        JOIN currency c ON dcd.currency_id = c.id
        WHERE dcd.company_id = ?
          AND CAST(dcd.account_id AS CHAR) IN ($placeholders)
        ORDER BY c.code ASC
        LIMIT 1
    ");
    $stmt->execute(array_merge([$company_id], $account_ids));
    $bfCurrency = $stmt->fetchColumn();

    if ($bfCurrency) {
        $stmt = $pdo->prepare('SELECT id FROM currency WHERE code = ? AND company_id = ?');
        $stmt->execute([$bfCurrency, $company_id]);
        $bfCurrencyId = $stmt->fetchColumn();
        if ($bfCurrencyId) {
            $bf = '0';
            foreach ($account_ids as $aid) {
                $bf = money_add($bf, calculateBFByCurrency($pdo, $aid, $bfCurrencyId, $date_from_start, $company_id, $account_code), 8);
            }
        } else {
            $bf = '0';
            foreach ($account_ids as $aid) {
                $bf = money_add($bf, calculateBF($pdo, $aid, $date_from_start, $company_id), 8);
            }
        }
    } else {
        $stmt = $pdo->prepare('
            SELECT c.code 
            FROM account_currency ac
            JOIN currency c ON ac.currency_id = c.id
            WHERE ac.account_id = ?
            ORDER BY ac.created_at ASC
            LIMIT 1
        ');
        $stmt->execute([$account_ids[0]]);
        $bfCurrency = $stmt->fetchColumn();

        if ($bfCurrency) {
            $stmt = $pdo->prepare('SELECT id FROM currency WHERE code = ? AND company_id = ?');
            $stmt->execute([$bfCurrency, $company_id]);
            $bfCurrencyId = $stmt->fetchColumn();
            if ($bfCurrencyId) {
                $bf = '0';
                foreach ($account_ids as $aid) {
                    $bf = money_add($bf, calculateBFByCurrency($pdo, $aid, $bfCurrencyId, $date_from_start, $company_id, $account_code), 8);
                }
            } else {
                $bf = '0';
                foreach ($account_ids as $aid) {
                    $bf = money_add($bf, calculateBF($pdo, $aid, $date_from_start, $company_id), 8);
                }
            }
        } else {
            $bf = '0';
            foreach ($account_ids as $aid) {
                $bf = money_add($bf, calculateBF($pdo, $aid, $date_from_start, $company_id), 8);
            }
        }
    }

    return ['bf' => $bf, 'bfCurrency' => $bfCurrency];
}

try {
    // 检查用户是否登录
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }

    // 运行时兜底：确保 rate 不会在写入/读取链路中被 4 位小数截断
    ensureHistoryRatePrecision($pdo);
    $sessionUserType = isset($_SESSION['user_type']) ? strtolower((string) $_SESSION['user_type']) : '';
    $isMemberUser = ($sessionUserType === 'member');
    // Member Win/Loss export (from Transaction Payment History, viewed by agent/admin):
    // force the same description formatting the member sees, without changing any amounts.
    if (!empty($_GET['member_view'])) {
        $isMemberUser = true;
    }

    $listScope = tx_resolve_transaction_list_scope($pdo, $_GET);
    $historyScopeFilter = tx_search_transaction_filter($pdo, $listScope, 't');
    historyApiSetScopeFilter($historyScopeFilter, $listScope);
    $history_txn_where = $historyScopeFilter['sql'];
    $history_txn_bind = (int) $historyScopeFilter['bind'];
    $history_is_group = (bool) $historyScopeFilter['is_group'];
    $company_id = $history_is_group
        ? historyApiDcdCompanyId()
        : (int) ($listScope['company_id'] ?? 0);

    // 获取参数
    $account_id = (int) ($_GET['account_id'] ?? 0);
    $account_code = trim((string) ($_GET['account_code'] ?? $_GET['account_id'] ?? ''));
    $virtual_company_code = strtoupper(trim((string) ($_GET['virtual_company_code'] ?? '')));

    if ($account_id <= 0 && $account_code !== '') {
        try {
            $stAcc = $pdo->prepare("SELECT id FROM account WHERE account_id = ? LIMIT 1");
            $stAcc->execute([$account_code]);
            $accRow = $stAcc->fetch(PDO::FETCH_ASSOC);
            if ($accRow && !empty($accRow['id'])) {
                $account_id = (int) $accRow['id'];
            }
        } catch (Throwable $e) {
            /* skip */
        }
    }

    $date_from = $_GET['date_from'] ?? null;
    $date_to = $_GET['date_to'] ?? null;
    $currency = $_GET['currency'] ?? null; // 可选：按 data_capture 的 currency 筛选
    $pure_type_search = isset($_GET['pure_type_search']) ? strtoupper(trim((string) $_GET['pure_type_search'])) : '';
    if ($pure_type_search !== '' && !typeTxSearchSupportsPureManualFilter($pure_type_search)) {
        $pure_type_search = '';
    }
    $apply_pure_history_filter = $pure_type_search !== ''
        && !typeTxSearchHistoryUsesFullAccountLedger($pure_type_search);

    // 验证必填参数
    if ($account_id <= 0 && $virtual_company_code === '') {
        throw new Exception('账户ID是必填项');
    }
    if (!$date_from || !$date_to) {
        throw new Exception('日期范围是必填项');
    }

    // 与 search_api 一致：d/m/Y → 日历日；B/F 与 capture 区间用 00:00:00 / 23:59:59，避免 DATETIME 列上 BETWEEN 'Y-m-d' AND 'Y-m-d' 仅命中午夜导致单日/结束日漏数。
    $from_ts = strtotime(str_replace('/', '-', $date_from));
    $to_ts = strtotime(str_replace('/', '-', $date_to));
    if ($from_ts === false || $to_ts === false) {
        throw new Exception('日期格式无效');
    }
    $date_from_db = date('Y-m-d', $from_ts);
    $date_to_db = date('Y-m-d', $to_ts);
    $date_from_start = $date_from_db . ' 00:00:00';
    $date_to_end = $date_to_db . ' 23:59:59';

    // 获取 currency_id（如果指定了 currency；支持逗号分隔取首码）
    $currency_id = null;
    if ($currency) {
        $currencyCode = strtoupper(trim(explode(',', (string) $currency)[0]));
        if ($currencyCode !== '') {
            $currency_id = tx_resolve_currency_id_for_scope($pdo, $currencyCode, $listScope);
        }
    }
    if ($account_id <= 0 && $virtual_company_code !== '') {
        $isNetProfitVirtual = ($account_id <= -2000000);
        $virtual = $isNetProfitVirtual
            ? buildVirtualDomainNetProfitHistory(
                $pdo,
                $company_id,
                $virtual_company_code,
                $date_from_db,
                $date_to_db,
                $currency_id ? (int) $currency_id : null
            )
            : buildVirtualDomainListFeeHistory(
                $pdo,
                $company_id,
                $virtual_company_code,
                $date_from_db,
                $date_to_db,
                $currency_id ? (int) $currency_id : null
            );
        historyApiEchoSuccess([
            'account' => $virtual['account'],
            'date_range' => ['from' => $date_from, 'to' => $date_to],
            'history' => $virtual['history'],
        ]);
        exit;
    }

    $account = tx_fetch_account_row($pdo, $account_id, $listScope);

    if (!$account) {
        throw new Exception('账户不存在或不属于当前范围');
    }
    // 强制校验：返回的账户必须与请求的 account_id 一致，避免单向/双向连接时误显示其他账户数据
    if ((int) $account['id'] !== (int) $account_id) {
        throw new Exception('账户校验失败');
    }

    // 仅使用当前请求的账户：Win/Loss 与 Payment History 只显示该账户自身数据，不聚合关联账户
    $account_ids = [$account_id];
    // 账户代码（用于 data_capture_details 中可能按代码存储的 account_id 匹配）
    $account_code = isset($account['account_id']) ? trim((string) $account['account_id']) : '';

    // 1. 计算 B/F (Opening Balance)（仅当前账户）
    // 指定 currency：按该币别；未指定：占位，在载入区间内 capture/transactions 后按出现币别分别计算（与带 currency 参数查询一致）
    $bfCurrency = null;
    $bf = '0';
    $bf_per_currency = null;
    if ($currency_id) {
        $bf = '0';
        foreach ($account_ids as $aid) {
            $bf = money_add($bf, calculateBFByCurrency($pdo, $aid, $currency_id, $date_from_start, $company_id, $account_code), 8);
        }
        $bfCurrency = $currency;
    }

    // 2. 查询日期范围内的数据采集记录（视为 Win/Loss）- 如果指定了 currency，按 currency 筛选
    $sqlCapture = "SELECT 
                        dcd.id as detail_id,
                        dcd.capture_id,
                        dc.capture_date,
                        dc.created_at as capture_created_at,
                        dc.user_type,
                        dc.remark as capture_remark,
                        COALESCE(dcd.processed_amount, 0) AS processed_amount,
                        dcd.description_main,
                        dcd.description_sub,
                        d.name AS description_name,
                        COALESCE(
                            d.name,
                            dcd.description_sub,
                            dcd.description_main,
                            dcd.columns_value,
                            'Data Capture'
                        ) as product_name,
                        dcd.id_product_main,
                        dcd.id_product_sub,
                        dcd.product_type,
                        dcd.source_value,
                        dcd.formula,
                        dcd.currency_id,
                        dcd.rate,
                        " . historyRateExpressionSelectSql($pdo) . ",
                        c.code as currency_code,
                        COALESCE(u.login_id, o.owner_code) as capture_created_by,
                        a_cm.name as card_owner_name
                    FROM data_capture_details dcd
                    JOIN data_captures dc ON dcd.capture_id = dc.id
                    JOIN currency c ON dcd.currency_id = c.id
                    LEFT JOIN user u ON dc.user_type = 'user' AND dc.created_by = u.id
                    LEFT JOIN owner o ON dc.user_type = 'owner' AND dc.created_by = o.id
                    LEFT JOIN process p ON dc.process_id = p.id
                    LEFT JOIN description d ON p.description_id = d.id
                    LEFT JOIN bank_process bp ON dc.process_id = bp.id
                    LEFT JOIN account a_cm ON bp.card_merchant_id = a_cm.id
                    WHERE (dcd.company_id = ? OR dcd.company_id IS NULL)
                      AND dc.company_id = ?
                      AND (
                          TRIM(CAST(dcd.account_id AS CHAR)) = TRIM(CAST(? AS CHAR))
                          OR (? <> '' AND TRIM(COALESCE(dcd.account_id, '')) = TRIM(?))
                      )
                      AND dc.capture_date >= ? AND dc.capture_date <= ?";

    // dcd.account_id 可能存请求的 id、其他公司的同代码 account.id、或账户代码；用「当前公司下同 account_id 的所有 id」子查询兜底
    $captureParams = [$company_id, $company_id, $account_id, $account_code ?: '', $account_code ?: '', $date_from_start, $date_to_end];
    if ($currency_id) {
        $sqlCapture .= " AND dcd.currency_id = ?";
        $captureParams[] = $currency_id;
    }

    $sqlCapture .= " ORDER BY dc.capture_date ASC, dc.created_at ASC, dcd.id ASC";
    $stmt = $pdo->prepare($sqlCapture);
    $stmt->execute($captureParams);
    $captureRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. 查询日期范围内的所有交易记录
    // 如果指定了 currency，根据 data_capture 的 currency 或 transactions.currency_id 来过滤
    // 检查 transactions 表是否有 currency_id 字段
    $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'currency_id'");
    $has_currency_id = $stmt->rowCount() > 0;
    $has_approval_status = historyHasContraApprovalColumns($pdo);
    $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'source_bank_process_id'");
    $has_source_bank_process_id = $stmt->rowCount() > 0;
    $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'source_bank_process_period_type'");
    $has_source_bank_process_period_type = $stmt->rowCount() > 0;
    $has_day_start_frequency = false;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM bank_process LIKE 'day_start_frequency'");
        $has_day_start_frequency = $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        $has_day_start_frequency = false;
    }
    $has_resend_schedule_day_end = false;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM bank_process LIKE 'accounting_resend_schedule_day_end'");
        $has_resend_schedule_day_end = $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        $has_resend_schedule_day_end = false;
    }
    $has_day_end_monthly_cap_enabled = false;
    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM bank_process LIKE 'day_end_monthly_cap_enabled'");
        $has_day_end_monthly_cap_enabled = $stmt->rowCount() > 0;
    } catch (Throwable $e) {
        $has_day_end_monthly_cap_enabled = false;
    }

    $sql = "SELECT 
                t.id,
                t.transaction_type,
                t.account_id,
                t.from_account_id,
                t.amount,
                t.transaction_date,
                t.description,
                t.sms,
                t.created_at,
                u.login_id as created_by_login_id,
                u.name as created_by_name,
                o.owner_code as created_by_owner_code,
                o.name as created_by_owner_name,
                to_acc.account_id as to_account_code,
                from_acc.account_id as from_account_code,
                tr.rate_group_id";

    // 如果表有 currency_id 字段，也查询它
    if ($has_currency_id) {
        $sql .= ", t.currency_id, c.code as transaction_currency_code";
    }
    if ($has_approval_status) {
        $sql .= ", t.approval_status";
    }
    if ($has_source_bank_process_id) {
        $bpFrequencySql = $has_day_start_frequency ? "bp_t.day_start_frequency" : "''";
        $bpResendDayEndSql = $has_resend_schedule_day_end ? "bp_t.accounting_resend_schedule_day_end" : "''";
        $bpDayEndCapSql = $has_day_end_monthly_cap_enabled ? 'bp_t.day_end_monthly_cap_enabled' : '0';
        $sql .= ", t.source_bank_process_id, a_cm_t.name as card_owner_name, bp_t.name as bank_process_name, bp_t.bank as bank_name, {$bpFrequencySql} as bp_frequency, bp_t.profit as process_profit, bp_t.cost as process_cost, bp_t.price as process_price, bp_t.card_merchant_id, bp_t.customer_id, bp_t.profit_account_id, bp_t.profit_sharing as process_profit_sharing, bp_t.day_start AS bp_day_start, bp_t.day_end AS bp_day_end, {$bpResendDayEndSql} AS bp_resend_day_end, bp_t.dts_created AS bp_dts_created, {$bpDayEndCapSql} AS bp_day_end_monthly_cap_enabled";
        // 每笔交易单独存 period_type 时优先用列，否则用 pap 子查询（避免同一天 monthly/inactive 互相覆盖）
        if ($has_source_bank_process_period_type) {
            $sql .= ", t.source_bank_process_period_type AS period_type";
        } else {
            // monthly 的 transaction_date 可能为 day_start，posted_date 为应付日，二者不必相等；取最近一条 PAP 的 period_type
            $sql .= ", (SELECT pap.period_type FROM process_accounting_posted pap WHERE pap.company_id = t.company_id AND pap.process_id = t.source_bank_process_id ORDER BY ABS(DATEDIFF(pap.posted_date, DATE(t.transaction_date))), pap.id DESC LIMIT 1) AS period_type";
        }
    }

    $sql .= " FROM transactions t
            LEFT JOIN user u ON t.created_by = u.id
            LEFT JOIN account to_acc ON t.account_id = to_acc.id
            LEFT JOIN account from_acc ON t.from_account_id = from_acc.id
            LEFT JOIN owner o ON t.created_by_owner = o.id
            LEFT JOIN transactions_rate tr ON t.id = tr.transaction_id";

    // 如果表有 currency_id 字段，JOIN currency 表
    if ($has_currency_id) {
        $sql .= " LEFT JOIN currency c ON t.currency_id = c.id";
    }
    if ($has_source_bank_process_id) {
        $sql .= " LEFT JOIN bank_process bp_t ON t.source_bank_process_id = bp_t.id LEFT JOIN account a_cm_t ON bp_t.card_merchant_id = a_cm_t.id";
    }

    // Bank process 流水：区间过滤与排序一律按 transactions.transaction_date（入账时写入的归属日），
    // 不使用当前 bank_process.day_start，避免 Resend 改期后历史行「跟着改日期」。
    $effectiveTxnDateExpr = "DATE(t.transaction_date)";

    $ph = implode(',', array_fill(0, count($account_ids), '?'));
    // 这里只查询非 RATE 的交易（RATE 在后续通过 transaction_entry 单独处理）
    $sql .= " WHERE {$history_txn_where}
              AND t.transaction_type <> 'RATE'
              AND (t.account_id IN ($ph) OR t.from_account_id IN ($ph))
              AND $effectiveTxnDateExpr BETWEEN ? AND ?";
    // 不再按 CURDATE() 隐藏未来 transaction_date：与 Transaction List 筛选一致，Resend 锚到未来月份时仍可查看 Payment History。

    $transactionParams = array_merge([$history_txn_bind], $account_ids, $account_ids, [$date_from_db, $date_to_db]);

    // 如果指定了 currency，根据 data_capture 的 currency 或 transactions.currency_id 来过滤
    if ($currency) {
        if ($has_currency_id) {
            // 如果表有 currency_id 字段，直接使用它
            $sql .= " AND t.currency_id = ?";
            $transactionParams[] = $currency_id;
        } else {
            // 如果表没有 currency_id 字段，使用 data_capture_details 来过滤
            $sql .= " AND (
                (t.account_id IN ($ph) AND EXISTS (
                    SELECT 1
                    FROM data_capture_details dcd
                    WHERE dcd.company_id = ?
                      AND CAST(dcd.account_id AS CHAR) IN ($ph)
                      AND dcd.currency_id = ?
                )) OR 
                (t.from_account_id IN ($ph) AND EXISTS (
                    SELECT 1
                    FROM data_capture_details dcd
                    WHERE dcd.company_id = ?
                      AND CAST(dcd.account_id AS CHAR) IN ($ph)
                      AND dcd.currency_id = ?
                ))
            )";
            $transactionParams = array_merge($transactionParams, $account_ids, [$company_id], $account_ids, [$currency_id], $account_ids, [$company_id], $account_ids, [$currency_id]);
        }
    }

    $sql .= historyContraApprovedWhere($pdo, 't');

    $sql .= " ORDER BY $effectiveTxnDateExpr ASC, t.created_at ASC, t.id ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($transactionParams);
    $transactions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 未指定 currency：按查询日期区间内实际出现的币别分别计算 B/F（Member 多币别一次请求 = 与逐币别 history_api 一致）
    if (!$currency_id) {
        $codeSet = [];
        foreach ($captureRows as $cr) {
            $cc = trim((string) ($cr['currency_code'] ?? ''));
            if ($cc !== '') {
                $codeSet[$cc] = true;
            }
        }
        foreach ($transactions as $t) {
            if ($has_currency_id && !empty($t['transaction_currency_code'])) {
                $codeSet[trim((string) $t['transaction_currency_code'])] = true;
            }
        }
        // 與主交易 SQL 一致：區間內凡有 currency_id 的幣別都納入 B/F（避免仅靠 capture 推幣別時漏 MYR 等）
        if ($has_currency_id) {
            $phTxCodes = implode(',', array_fill(0, count($account_ids), '?'));
            $txCodesSql = "
                SELECT DISTINCT TRIM(c.code) AS code
                FROM transactions t
                INNER JOIN currency c ON t.currency_id = c.id
                WHERE {$history_txn_where}
                  AND t.transaction_type <> 'RATE'
                  AND (t.account_id IN ($phTxCodes) OR t.from_account_id IN ($phTxCodes))
                  AND DATE(t.transaction_date) BETWEEN ? AND ?
                  AND t.currency_id IS NOT NULL
            ";
            $txCodesSql .= historyContraApprovedWhere($pdo, 't');
            $txCodesStmt = $pdo->prepare($txCodesSql);
            $txCodesStmt->execute(array_merge([$history_txn_bind], $account_ids, $account_ids, [$date_from_db, $date_to_db]));
            while ($crow = $txCodesStmt->fetch(PDO::FETCH_ASSOC)) {
                $cc = trim((string) ($crow['code'] ?? ''));
                if ($cc !== '') {
                    $codeSet[$cc] = true;
                }
            }
        }
        $ratePhDist = implode(',', array_fill(0, count($account_ids), '?'));
        try {
            $rateDistStmt = $pdo->prepare("
                SELECT DISTINCT TRIM(c.code) AS code
                FROM transaction_entry e
                INNER JOIN transactions h ON e.header_id = h.id
                INNER JOIN currency c ON e.currency_id = c.id
                WHERE " . historyApiTxnWhereSqlForAlias('h') . "
                  " . ($history_is_group ? '' : 'AND e.company_id = ?') . "
                  AND h.transaction_type = 'RATE'
                  AND e.account_id IN ($ratePhDist)
                  AND DATE(h.transaction_date) BETWEEN ? AND ?
                  AND c.code IS NOT NULL AND TRIM(c.code) <> ''
            ");
            $rateDistParams = array_merge([$history_txn_bind], $history_is_group ? [] : [$company_id], $account_ids, [$date_from_db, $date_to_db]);
            $rateDistStmt->execute($rateDistParams);
            while ($rrow = $rateDistStmt->fetch(PDO::FETCH_ASSOC)) {
                $rc = trim((string) ($rrow['code'] ?? ''));
                if ($rc !== '') {
                    $codeSet[$rc] = true;
                }
            }
        } catch (Throwable $e) {
            // 忽略：无 transaction_entry 或结构差异时仍依 capture/txn 币别
        }

        $rangeCodeSet = $codeSet;
        $supplementCodeSet = [];
        historySupplementBfCurrencyCodeSet(
            $pdo,
            $account_ids,
            $account_code,
            $company_id,
            $has_currency_id,
            $history_txn_where,
            $history_txn_bind,
            $history_is_group,
            $supplementCodeSet
        );

        $bf_per_currency = [];
        $computeBfForCode = static function (string $code) use ($pdo, $listScope, $account_ids, $date_from_start, $company_id, $account_code): ?string {
            try {
                $cid = tx_resolve_currency_id_for_scope($pdo, $code, $listScope);
            } catch (Throwable $e) {
                return null;
            }
            if ($cid <= 0) {
                return null;
            }
            $bfOne = '0';
            foreach ($account_ids as $aid) {
                $bfOne = money_add($bfOne, calculateBFByCurrency($pdo, $aid, (int) $cid, $date_from_start, $company_id, $account_code), 8);
            }
            return $bfOne;
        };

        if (!empty($rangeCodeSet)) {
            $codes = array_keys($rangeCodeSet);
            sort($codes, SORT_STRING);
            foreach ($codes as $code) {
                $bfOne = $computeBfForCode($code);
                if ($bfOne === null) {
                    continue;
                }
                $bf_per_currency[$code] = $bfOne;
            }
        }

        if (!empty($supplementCodeSet)) {
            $codes = array_keys($supplementCodeSet);
            sort($codes, SORT_STRING);
            foreach ($codes as $code) {
                if (isset($rangeCodeSet[$code])) {
                    continue;
                }
                $bfOne = $computeBfForCode($code);
                if ($bfOne === null) {
                    continue;
                }
                if (money_cmp(money_normalize($bfOne, 8), '0', 8) === 0) {
                    continue;
                }
                $bf_per_currency[$code] = $bfOne;
            }
        }

        if (!empty($bf_per_currency)) {
            ksort($bf_per_currency, SORT_STRING);
            $bfCurrency = (string) array_key_first($bf_per_currency);
            $bf = $bf_per_currency[$bfCurrency];
        } else {
            $bf_per_currency = null;
            $leg = historyLegacySingleBfNoCurrencyFilter($pdo, $account_ids, $company_id, $account_code, $date_from_start);
            $bf = $leg['bf'];
            $bfCurrency = $leg['bfCurrency'];
        }
    }

    // 展示去重保护：若同一 process 同日已有非 day_end_tail 的银行账单，
    // 则隐藏对应 day_end_tail，避免 resend + day_end 历史中出现重复两条。
    $hasNonTailByKey = [];
    foreach ($transactions as $txRow) {
        $pid = (int) ($txRow['source_bank_process_id'] ?? 0);
        $pt = trim((string) ($txRow['period_type'] ?? ''));
        if ($pid <= 0) {
            continue;
        }
        $dateKey = trim((string) ($txRow['transaction_date'] ?? ''));
        $accKey = (int) ($txRow['account_id'] ?? 0);
        $typeKey = trim((string) ($txRow['transaction_type'] ?? ''));
        $amtKey = money_normalize($txRow['amount'] ?? '0', 2);
        if ($pt !== 'day_end_tail') {
            $hasNonTailByKey[$pid . '|' . $dateKey . '|' . $accKey . '|' . $typeKey . '|' . $amtKey] = true;
        }
    }

    // 4. 构建历史记录数据
    $history = [];

    // 第一行或多行：B/F (Opening Balance)（多币别未指定 currency 时：每币别一行，与带 currency 参数查询同口径）
    if (!is_array($bf_per_currency) || count($bf_per_currency) === 0) {
        if (!$bfCurrency) {
            $stmt = $pdo->prepare("
                SELECT c.code 
                FROM account_currency ac
                JOIN currency c ON ac.currency_id = c.id
                WHERE ac.account_id = ?
                ORDER BY ac.created_at ASC
                LIMIT 1
            ");
            $stmt->execute([$account_ids[0]]);
            $bfCurrency = $stmt->fetchColumn();
        }
    }
    $bfDescription = 'Opening Balance';
    $ph_bf = implode(',', array_fill(0, count($account_ids), '?'));
    $stmt = $pdo->prepare("SELECT bp.bank FROM bank_process bp WHERE bp.card_merchant_id IN ($ph_bf) AND bp.company_id = ? AND bp.bank IS NOT NULL AND bp.bank != '' LIMIT 1");
    $stmt->execute(array_merge($account_ids, [$company_id]));
    $bfBankName = $stmt->fetchColumn();
    if ($bfBankName) {
        $bfDescription = 'Opening Balance (' . trim($bfBankName) . ')';
    }
    if (is_array($bf_per_currency) && count($bf_per_currency) > 0) {
        foreach ($bf_per_currency as $code => $bfAmt) {
            $history[] = [
                'row_type' => 'bf',
                'date' => 'B/F',
                'source' => '-',
                'product' => '-',
                'card_owner' => '-',
                'currency' => $code,
                'percent' => '-',
                'rate' => '-',
                'win_loss' => '-',
                'cr_dr' => '-',
                'balance' => historyFormatExactCents2($bfAmt),
                'description' => $bfDescription,
                'sms' => '-',
                'created_by' => '-'
            ];
        }
    } else {
        $history[] = [
            'row_type' => 'bf',
            'date' => 'B/F',
            'source' => '-',
            'product' => '-',
            'card_owner' => '-',
            'currency' => $bfCurrency,
            'percent' => '-',
            'rate' => '-',
            'win_loss' => '-',
            'cr_dr' => '-',
            'balance' => historyFormatExactCents2($bf),
            'description' => $bfDescription,
            'sms' => '-',
            'created_by' => '-'
        ];
    }

    // 后续行：数据采集 + 交易记录（余额在下方按币别分别累计）
    $events = [];
    $eventIndex = 0;

    foreach ($captureRows as $capture) {
        if ($apply_pure_history_filter) {
            continue;
        }
        $captureTimestamp = historyDataCaptureOrderTimestamp($capture);

        // Product: 使用 id_product（id_product_sub 或 id_product_main），如果有 description 则附加在后面（括号内）
        $product = '';
        $productDescription = null; // 用于存储 description_main 或 description_sub

        if ($capture['product_type'] === 'sub' && !empty($capture['id_product_sub'])) {
            $product = $capture['id_product_sub'];
            // 获取对应的描述：优先 description_sub；若为空则回退到 description_main，
            // 兼容历史数据（旧版前端把 sub 行的描述误写进 description_main 字段的情况）。
            if (!empty($capture['description_sub'])) {
                $productDescription = $capture['description_sub'];
            } elseif (!empty($capture['description_main'])) {
                $productDescription = $capture['description_main'];
            }
        } elseif (!empty($capture['id_product_main'])) {
            $product = $capture['id_product_main'];
            // 获取对应的 description_main
            if (!empty($capture['description_main'])) {
                $productDescription = $capture['description_main'];
            }
        } else {
            $product = $capture['id_product_sub'] ?: $capture['id_product_main'] ?: 'Data Capture';
            // 如果 id_product_sub 存在，尝试获取 description_sub；否则尝试 description_main
            if (!empty($capture['id_product_sub']) && !empty($capture['description_sub'])) {
                $productDescription = $capture['description_sub'];
            } elseif (!empty($capture['description_main'])) {
                $productDescription = $capture['description_main'];
            }
        }

        // 如果产品编号里已包含相同 description，则不要重复追加，避免出现
        // "ABB5ADMIN (PROCESS FEE 3%) (PROCESS FEE 3%)" 这类重复显示
        if (!empty($productDescription)) {
            $normalizedProductDescription = trim((string) $productDescription);
            $wrappedProductDescription = '(' . $normalizedProductDescription . ')';
            if ($normalizedProductDescription !== '' && stripos((string) $product, $wrappedProductDescription) === false) {
                $product = $product . ' ' . $wrappedProductDescription;
            }
        }

        // Percent: 不再使用 source_percent，留空
        $percent = '';

        // Description: 格式为 description.name:formula
        $descriptionText = '';
        $formula = $capture['formula'] ?? '';
        $descriptionName = $capture['description_name'] ?? '';
        if (!empty($descriptionName)) {
            $descriptionText = trim($descriptionName) . ' : ' . ($formula !== '' ? $formula : '0');
        } else {
            // 如果没有 description_name，使用 product_name 作为后备
            $fallbackName = $capture['product_name'] ?? 'Data Capture';
            $descriptionText = trim($fallbackName) . ' : ' . ($formula !== '' ? $formula : '0');
        }

        // Rate: prefer rate_expression (*3 / /3 / 3); fall back to numeric rate
        $rate = null;
        $rateExpression = isset($capture['rate_expression']) ? trim((string) $capture['rate_expression']) : '';
        if ($rateExpression !== '') {
            $rate = $rateExpression;
        } elseif (isset($capture['rate']) && $capture['rate'] !== null && $capture['rate'] !== '') {
            // 与 Data Summary 保持一致：保留有效小数，不强制补 0；但小数位最多 8 位
            $rate = money_out($capture['rate'], 8);
            if ($rate === '') {
                $rate = '0';
            }
        }

        // Remark: 不再使用 description_main 或 description_sub（因为它们已经显示在 product 列），只使用 capture_remark
        $remark = $capture['capture_remark'] ?? null;

        $events[] = [
            'row_type' => 'data_capture',
            'transaction_id' => null,
            'transaction_type' => 'DATA_CAPTURE',
            'sort_date_ymd' => historySortDateYmdFromRaw($capture['capture_date'] ?? ''),
            'order_ts' => $captureTimestamp ?: 0,
            'order_index' => $eventIndex++,
            'win_loss' => $capture['processed_amount'],
            'cr_dr' => '0',
            'date' => date('d/m/Y', strtotime($capture['capture_date'])),
            'source' => $capture['transaction_type'] ?? 'DATA_CAPTURE',
            'product' => $product ?: '-',
            'card_owner' => !empty($capture['card_owner_name']) ? trim($capture['card_owner_name']) : '-',
            'is_bank_process_transaction' => false,
            'currency' => $capture['currency_code'] ?? $bfCurrency,
            'percent' => $percent ?: '-',
            'rate' => $rate ?: '-',
            'description' => $descriptionText,
            'sms' => '-',
            'remark' => $remark,
            'created_by' => $capture['capture_created_by'] ?: '-'
        ];
    }

    $account_ids_int = array_map('intval', $account_ids);
    $domainHubRollup = historyCollectDomainHubProfitRollup($transactions, $account_ids_int);
    foreach ($transactions as $t) {
        $ptCurrent = trim((string) ($t['period_type'] ?? ''));
        $pidCurrent = (int) ($t['source_bank_process_id'] ?? 0);
        if ($ptCurrent === 'day_end_tail' && $pidCurrent > 0) {
            $dateKey = trim((string) ($t['transaction_date'] ?? ''));
            $accKey = (int) ($t['account_id'] ?? 0);
            $typeKey = trim((string) ($t['transaction_type'] ?? ''));
            $amtKey = money_normalize($t['amount'] ?? '0', 2);
            $dupKey = $pidCurrent . '|' . $dateKey . '|' . $accKey . '|' . $typeKey . '|' . $amtKey;
            if (isset($hasNonTailByKey[$dupKey])) {
                continue;
            }
        }

        $tidRoll = (int) ($t['id'] ?? 0);
        if ($tidRoll > 0 && !empty($domainHubRollup['skip'][$tidRoll])) {
            continue;
        }

        $is_to_account = in_array((int) $t['account_id'], $account_ids_int);
        $is_from_account = in_array((int) ($t['from_account_id'] ?? 0), $account_ids_int);
        $win_loss = '0';
        $cr_dr = '0';
        $approvalStatus = $has_approval_status ? ($t['approval_status'] ?? null) : null;
        // 原始 description，用于判断显示文案/手动 PROFIT
        $rawDescription = $t['description'] ?? '';
        // resend_consolidated_range 的临时 day_end 会在入账后被清理，优先从描述标记回读
        $resendEndFromDesc = null;
        if (preg_match('/\[RESEND_END=(\d{4}-\d{2}-\d{2})\]/', (string) $rawDescription, $mRe)) {
            $resendEndFromDesc = $mRe[1];
            $rawDescription = trim((string) preg_replace('/\s*\[RESEND_END=\d{4}-\d{2}-\d{2}\]\s*/', ' ', (string) $rawDescription));
            $t['description'] = $rawDescription;
        }
        if ($resendEndFromDesc !== null && $resendEndFromDesc !== '') {
            $t['bp_resend_day_end'] = $resendEndFromDesc;
        }
        // 关联账户间内部转账：to 和 from 都在聚合列表内时，对聚合视图 Cr/Dr 为 0
        $is_internal_transfer = $is_to_account && $is_from_account;
        $isBankProcessTransaction = $has_source_bank_process_id && !empty($t['source_bank_process_id']);
        $isCompensationDescription = preg_match('/^(Inactive\s+Compensation|Compensation)\s*/i', trim((string) $rawDescription)) === 1;
        $isInactiveCompensationSell = preg_match('/^(Inactive\s+Compensation|Compensation)(?:\s*\([^)]*\)|\s+\w+\s+Month)?\s*Sell Price/i', trim((string) $rawDescription)) === 1
            || stripos(trim((string) $rawDescription), 'Inactive Compensation Sell Price') === 0;
        // 手动 PROFIT：WIN/LOSE 且非 Bank Process，且不是系统生成的 Process/Auto/赔款文案
        $isManualProfit = in_array($t['transaction_type'], ['WIN', 'LOSE'], true)
            && !$isBankProcessTransaction
            && stripos((string) $rawDescription, 'Process: ') !== 0
            && stripos((string) $rawDescription, 'Auto: ') !== 0
            && !$isCompensationDescription;

        // 根据交易类型计算 Win/Loss 和 Cr/Dr
        // Win/Loss 只包含 Data Capture，WIN/LOSE 交易移到 Cr/Dr
        switch ($t['transaction_type']) {
            case 'WIN':
                if (!$is_internal_transfer) {
                    if ($isManualProfit) {
                        if ($is_to_account) {
                            $cr_dr = historyNeg($t['amount']);
                        } elseif ($is_from_account) {
                            $cr_dr = $t['amount'] ?? '0';
                        }
                    } elseif ($is_to_account) {
                        $cr_dr = $t['amount'] ?? '0';
                    }
                }
                break;

            case 'LOSE':
                if (!$is_internal_transfer) {
                    if ($isManualProfit) {
                        if ($is_to_account) {
                            $cr_dr = $t['amount'] ?? '0';
                        } elseif ($is_from_account) {
                            $cr_dr = historyNeg($t['amount']);
                        }
                    } elseif ($is_to_account) {
                        $cr_dr = historyNeg($t['amount']);
                    }
                }
                break;

            case 'ADJUSTMENT':
                if (!$is_internal_transfer && $is_to_account) {
                    $win_loss = $t['amount'] ?? '0';
                }
                break;

            case 'RECEIVE':
                if ($is_internal_transfer) {
                    $cr_dr = '0';
                } elseif ($is_to_account) {
                    $cr_dr = historyNeg($t['amount']);
                } else {
                    $cr_dr = $t['amount'] ?? '0';
                }
                break;

            case 'CLAIM':
                if ($is_internal_transfer) {
                    $cr_dr = '0';
                } elseif ($is_to_account) {
                    $cr_dr = historyNeg($t['amount']);
                } else {
                    $cr_dr = $t['amount'] ?? '0';
                }
                break;

            case 'PAYMENT':
                if ($is_internal_transfer) {
                    $cr_dr = '0';
                    break;
                }
                // 显示与 CONTRA 一致：TO（account_id）默认负、FROM（from_account_id）默认正。
                // B/F（calculateBFByCurrency 2b/3）对 PAYMENT：TO 默认 -amount、FROM 默认 +amount；Share/List Fee 等例外与 BF CASE 对齐。
                $smsPay = trim((string) ($t['sms'] ?? ''));
                $descPay = trim((string) $rawDescription);
                if ($is_to_account) {
                    if (
                        stripos($smsPay, '[DOMAIN_SHARE_COMMISSION|') === 0
                        || $smsPay === '[DOMAIN_SHARE_COMMISSION]'
                        || stripos($smsPay, '[AUTO_RENEW|COMMISSION|') === 0
                    ) {
                        $cr_dr = $t['amount'] ?? '0';
                    } elseif (
                        stripos($smsPay, '[DOMAIN_LIST_FEE|') === 0
                        || $smsPay === '[DOMAIN_LIST_FEE]'
                        || stripos($descPay, 'Domain list fee FROM ') === 0
                        || stripos($descPay, 'Pay Domain Fee') === 0
                        || stripos($descPay, 'Pay Domain Fee To ') === 0
                        || historyIsAutoRenewFeeSms($smsPay)
                    ) {
                        $cr_dr = $t['amount'] ?? '0';
                    } else {
                        $cr_dr = historyNeg($t['amount']);
                    }
                } else {
                    if (
                        stripos($smsPay, '[DOMAIN_NET_PROFIT|') === 0
                        || stripos($smsPay, '[AUTO_RENEW|NET_PROFIT|') === 0
                        || stripos($descPay, 'Profit By ') === 0
                    ) {
                        $cr_dr = '0';
                    } elseif (
                        stripos($smsPay, '[DOMAIN_LIST_FEE|') === 0
                        || $smsPay === '[DOMAIN_LIST_FEE]'
                        || stripos($descPay, 'Domain list fee FROM ') === 0
                        || stripos($descPay, 'Pay Domain Fee') === 0
                        || stripos($descPay, 'Pay Domain Fee To ') === 0
                        || historyIsAutoRenewFeeSms($smsPay)
                    ) {
                        // 与 search_api calculateCrDrByCurrency / txn_crdr_from bulk：List Fee、Pay Domain Fee 付款方记 -amount
                        $cr_dr = historyNeg($t['amount']);
                    } else {
                        // FROM 侧其余 PAYMENT：与 CONTRA 一致为正
                        $cr_dr = $t['amount'] ?? '0';
                    }
                }
                break;

            case 'CLEAR':
                // FROM ACCOUNT 正数，TO ACCOUNT 负数
                if ($approvalStatus && strtoupper((string) $approvalStatus) === 'PENDING') {
                    $cr_dr = '0';
                } else {
                    if ($is_internal_transfer) {
                        $cr_dr = '0';
                    } elseif ($is_to_account) {
                        $cr_dr = historyNeg($t['amount']);
                    } else {
                        $cr_dr = $t['amount'] ?? '0';
                    }
                }
                break;
            case 'CONTRA':
                // FROM 显示正数，TO 显示负数
                if ($approvalStatus && strtoupper((string) $approvalStatus) === 'PENDING') {
                    $cr_dr = '0';
                } else {
                    if ($is_internal_transfer) {
                        $cr_dr = '0';
                    } elseif ($is_to_account) {
                        $cr_dr = historyNeg($t['amount']);
                    } else {
                        $cr_dr = $t['amount'] ?? '0';
                    }
                }
                break;

            case 'RATE':
                if ($is_internal_transfer) {
                    $cr_dr = '0';
                } elseif ($is_to_account) {
                    $cr_dr = $t['amount'] ?? '0';
                } else {
                    $cr_dr = historyNeg($t['amount']);
                }
                break;

        }

        // Bank process 的 WIN/LOSE + 手动 PROFIT：
        // History 中金额统一显示在 Win/Loss 列（与主表一致），Cr/Dr 显示 0
        if (($isBankProcessTransaction || $isManualProfit) && in_array($t['transaction_type'], ['WIN', 'LOSE'], true)) {
            $win_loss = $cr_dr;
            $cr_dr = '0';
        }

        // 动态调整 description
        $description = $t['description'] ?: '-';

        // WIN/LOSE（Bank process 入账）：按入账类型显示；
        // Description 金额展示 process 原始 Buy/Sell/Profit（不显示本笔 total amount）。
        if (in_array($t['transaction_type'], ['WIN', 'LOSE'])) {
            $periodType = isset($t['period_type']) ? trim((string) $t['period_type']) : '';
            if ($isCompensationDescription) {
                // 赔款文案保持原始描述（Compensation One/Two/Three Month ...）
                $description = trim((string) $rawDescription);
            } else {
                if ($periodType === 'partial_first_month') {
                    $description = bankProcessProRatedFirstMonthDescription($t);
                } elseif ($periodType === 'once_one_off') {
                    $description = bankProcessOnceOneOffHistoryDescription($t);
                } elseif ($periodType === 'weekly') {
                    $description = bankProcessWeeklyHistoryDescription($t);
                } elseif ($periodType === 'daily' || $periodType === 'daily_consolidated') {
                    $description = bankProcessDailyHistoryDescription($t);
                } else {
                    if ($periodType === 'day_end_tail') {
                        // 统一 day_end 展示文案：Prorated(... | n days)@Monthly（不带 DayEnd 前缀）
                        $description = bankProcessDayEndProratedDescription($t, false);
                    } elseif ($periodType === 'resend_consolidated_range') {
                        // Resend 且带 day_end：优先用 resend 临时 day_end（原 process 可能无 day_end）
                        // 展示为 Prorated(daystart-dayend|days)@Monthly（不带 DayEnd 前缀）
                        $bpDayEndText = trim((string) ($t['bp_resend_day_end'] ?? ''));
                        if ($bpDayEndText === '') {
                            $bpDayEndText = trim((string) ($t['bp_day_end'] ?? ''));
                        }
                        if ($bpDayEndText !== '') {
                            $description = bankProcessDayEndProratedDescription($t, false);
                        } else {
                            // 无 day_end 的 resend 维持原本 monthly 文案
                            $description = 'Monthly bill';
                        }
                    } elseif ($periodType === 'manual_inactive') {
                        $description = 'Inactive bill';
                    } elseif ($periodType === 'monthly' || $periodType === '') {
                        $description = 'Monthly bill';
                    } else {
                        $description = 'Monthly bill';
                    }
                    $amt = $t['amount'] ?? '0';
                    if ($isBankProcessTransaction && $is_to_account) {
                        $txAccountId = (int) ($t['account_id'] ?? 0);
                        $cardMerchantId = (int) ($t['card_merchant_id'] ?? 0);
                        $customerId = (int) ($t['customer_id'] ?? 0);
                        $profitAccountId = (int) ($t['profit_account_id'] ?? 0);
                        if ($txAccountId > 0 && $txAccountId === $cardMerchantId) {
                            $amt = $t['process_cost'] ?? $amt;
                        } elseif ($txAccountId > 0 && $txAccountId === $customerId) {
                            $amt = $t['process_price'] ?? $amt;
                        } elseif ($txAccountId > 0 && $txAccountId === $profitAccountId) {
                            $amt = $t['process_profit'] ?? $amt;
                        }
                    }
                    $bpFreq = strtolower(trim((string) ($t['bp_frequency'] ?? '')));
                    // Resend 单期开账（尤其 1st_of_every_month + 自定义 day_start）会落在 monthly period_type，
                    // 但描述应显示为 Prorated，而非 Monthly bill。
                    $txnDay = 0;
                    try {
                        $txnDay = (int) date('j', strtotime((string) ($t['transaction_date'] ?? '')));
                    } catch (Throwable $e) {
                        $txnDay = 0;
                    }
                    if ($isBankProcessTransaction
                        && ($periodType === 'monthly' || $periodType === '')
                        && in_array($bpFreq, ['1st_of_every_month', ''], true)
                        && $txnDay > 1) {
                        $description = bankProcessProRatedFirstMonthDescription($t);
                    }
                    // 合同内整月账单（period_type=monthly）统一展示 Full Month 文案：
                    // - day_start_frequency = monthly
                    // - day_start_frequency = 1st_of_every_month（首月 partial 后的第2/3笔整月）
                    // - 例外：1st + day_end 月内截断开关 ON 且 day_end 早于月末 → Prorated 文案（与入账比例一致）
                    if ($isBankProcessTransaction
                        && ($periodType === 'monthly' || $periodType === '')
                        && in_array($bpFreq, ['monthly', '1st_of_every_month', ''], true)
                        && $txnDay <= 1) {
                        $capHistDesc = null;
                        if (in_array($bpFreq, ['1st_of_every_month', ''], true)) {
                            $capHistDesc = bankProcessMonthlyDayEndCapHistoryDescription($t);
                        }
                        if ($capHistDesc !== null) {
                            $description = $capHistDesc;
                        } else {
                            $monthLabel = '';
                            $monthTs = strtotime((string) ($t['transaction_date'] ?? ''));
                            if ($monthTs !== false) {
                                $monthNo = (int) date('n', $monthTs);
                                $yearNo = (int) date('Y', $monthTs);
                                $monthMap = [
                                    1 => 'JAN',
                                    2 => 'FEB',
                                    3 => 'MAC',
                                    4 => 'APR',
                                    5 => 'MAY',
                                    6 => 'JUN',
                                    7 => 'JUL',
                                    8 => 'AUG',
                                    9 => 'SEP',
                                    10 => 'OCT',
                                    11 => 'NOV',
                                    12 => 'DEC',
                                ];
                                $monthShort = $monthMap[$monthNo] ?? strtoupper(date('M', $monthTs));
                                $monthLabel = $monthShort . '/' . $yearNo;
                            }
                            $description = $monthLabel !== ''
                                ? ('Full Month (' . $monthLabel . ') @Monthly')
                                : 'Full Month @Monthly';
                        }
                    }
                    $billAmount = money_out($amt, 2);
                    if (stripos((string) $description, 'Pro-rated(') === 0
                        || stripos((string) $description, 'Prorated(') === 0
                        || stripos((string) $description, 'DayEnd - Prorated(') === 0
                        || stripos((string) $description, 'Prorated@Monthly') === 0
                        || stripos((string) $description, 'DayEnd - Prorated@Monthly') === 0) {
                        // Prorated 文案已包含金额括号，不再重复追加
                    } else {
                        $description = $description . ' ' . $billAmount;
                    }
                }
            }
            if ($isBankProcessTransaction) {
                $description = bankProcessAppendBankSuffixToDescription((string) $description, $t);
            }
        }

        // 手动 PROFIT：History 文案按当前账户的 Win/Loss 正负显示方向。
        // 正数表示给对方的 PROFIT；负数表示从对方来的 PROFIT。
        if ($isManualProfit) {
            $otherProfitAccount = $is_to_account
                ? ($t['from_account_code'] ?: '-')
                : ($t['to_account_code'] ?: '-');

            if (money_cmp($win_loss, '0') > 0) {
                $description = 'PROFIT TO ' . $otherProfitAccount;
            } elseif (money_cmp($win_loss, '0') < 0) {
                $description = 'PROFIT FROM ' . $otherProfitAccount;
            } else {
                $description = 'PROFIT';
            }
        }

        // 如果是 CONTRA/CLEAR/PAYMENT/RECEIVE/CLAIM/RATE，根据当前查看的账户调整 description
        if (in_array($t['transaction_type'], ['CONTRA', 'CLEAR', 'PAYMENT', 'RECEIVE', 'CLAIM', 'RATE'])) {
            if (empty($t['description'])) {
                // 如果原始 description 为空，自动生成
                if ($is_to_account) {
                    // 当前账户是 To Account
                    $description = $t['transaction_type'] . ' FROM ' . ($t['from_account_code'] ?: 'N/A');
                } else {
                    // 当前账户是 From Account
                    $description = $t['transaction_type'] . ' TO ' . ($t['to_account_code'] ?: 'N/A');
                }
            } elseif ($t['transaction_type'] === 'RATE' && preg_match('/^Transaction\s+(from|to)\s+(.+?)\s*\((?:Rate|RATE):\s*([^)]+)\)\s*$/i', $t['description'], $rateMatches)) {
                // RATE 存的是 "Transaction from X (Rate: n)" 或 "Transaction to X (Rate: n)"，按视角显示：To 账户显示 FROM 对方，From 账户显示 TO 对方
                if ($is_to_account) {
                    $description = 'TRANSACTION FROM ' . ($t['from_account_code'] ?: 'N/A');
                } else {
                    $description = 'TRANSACTION TO ' . ($t['to_account_code'] ?: 'N/A');
                }
                // member Win/Loss 页不显示 RATE 数值后缀，避免出现 "(Rate: 1.713)"
                if (!$isMemberUser) {
                    $description .= ' (RATE: ' . trim($rateMatches[3]) . ')';
                }
            } else {
                // 如果原始 description 是自动生成的格式，需要根据视角调整
                if (preg_match('/^(CONTRA|CLEAR|PAYMENT|RECEIVE|CLAIM|RATE) (FROM|TO) (.+)$/i', (string) $t['description'], $matches)) {
                    $type = $matches[1];
                    $direction = $matches[2];
                    $other_account = $matches[3];

                    if (!$is_to_account) {
                        // 如果当前查看的是 From Account，需要反转方向
                        $description = $type . ' TO ' . ($t['to_account_code'] ?: $other_account);
                    }
                    // 如果是 To Account，保持原样
                }
            }
        }

        // member Win/Loss: CONTRA 描述固定为 "Contra Account"，不显示对手账户
        if ($isMemberUser && $t['transaction_type'] === 'CONTRA') {
            $description = 'Contra Account';
        }

        // 追加审批标记（只对未批准 CONTRA；CLEAR 没有审批流程，只沿用金额逻辑）
        if ($t['transaction_type'] === 'CONTRA' && $approvalStatus && strtoupper((string) $approvalStatus) === 'PENDING') {
            $description = '[PENDING APPROVAL] ' . $description;
        }

        $displayDateYmd = $t['transaction_date'];
        if ($isBankProcessTransaction && in_array($t['transaction_type'], ['WIN', 'LOSE'], true)) {
            $ptForDisplay = isset($t['period_type']) ? trim((string) $t['period_type']) : '';
            // monthly / partial / tail：仍按 transaction_date 规范化；resend_consolidated 必须保留入账写入的 Day start，勿与 monthly 应付日混用
            if ($ptForDisplay === 'monthly' || $ptForDisplay === 'partial_first_month' || $ptForDisplay === 'day_end_tail') {
                $anchorYmd = historyMonthlyBankProcessDisplayYmd(
                    isset($t['bp_day_start']) ? (string) $t['bp_day_start'] : null,
                    $t['bp_dts_created'] ?? null,
                    (string) $t['transaction_date']
                );
                if ($anchorYmd !== null) {
                    $displayDateYmd = $anchorYmd;
                }
            }
        }
        $transactionTimestamp = historyTransactionOrderTimestamp((string) $displayDateYmd, $t['created_at'] ?? null);

        // 确定交易的 currency：
        // 1. 如果 transactions 表有 currency_id 字段，优先使用 transaction_currency_code
        // 2. 如果指定了 currency filter，使用它
        // 3. 否则，从 data_capture_details 中获取该账户在该交易日期使用的 currency
        $transactionCurrency = null;
        if ($has_currency_id && !empty($t['transaction_currency_code'])) {
            $transactionCurrency = $t['transaction_currency_code'];
        } elseif ($currency) {
            // 如果指定了 currency filter，使用它
            $transactionCurrency = $currency;
        } else {
            // 从 data_capture_details 中获取该账户在该交易日期使用的 currency
            $ph = implode(',', array_fill(0, count($account_ids), '?'));
            $stmt = $pdo->prepare("
                SELECT DISTINCT c.code 
                FROM data_capture_details dcd
                JOIN data_captures dc ON dcd.capture_id = dc.id
                JOIN currency c ON dcd.currency_id = c.id
                WHERE dcd.company_id = ?
                  AND dc.company_id = ?
                  AND CAST(dcd.account_id AS CHAR) IN ($ph)
                  AND dc.capture_date <= ?
                ORDER BY dc.capture_date DESC, c.code ASC
                LIMIT 1
            ");
            $stmt->execute(array_merge([$company_id, $company_id], $account_ids, [$displayDateYmd]));
            $transactionCurrency = $stmt->fetchColumn();

            // 如果找不到，使用 B/F 的 currency
            if (!$transactionCurrency) {
                $transactionCurrency = $bfCurrency;
            }
        }

        // 确定 Created By：优先 login_id / owner_code，其次姓名
        $transactionCreatedBy = '-';
        if (!empty($t['created_by_login_id'])) {
            $transactionCreatedBy = $t['created_by_login_id'];
        } elseif (!empty($t['created_by_owner_code'])) {
            $transactionCreatedBy = $t['created_by_owner_code'];
        } elseif (!empty($t['created_by_name'])) {
            $transactionCreatedBy = $t['created_by_name'];
        } elseif (!empty($t['created_by_owner_name'])) {
            $transactionCreatedBy = $t['created_by_owner_name'];
        }

        // Bank process 历史中 Id Product 列显示 Add Process 的 Name（bank_process.name）；仅 bank process 交易显示 card_owner，其余显示 id product
        $cardOwner = ($has_source_bank_process_id && !empty($t['bank_process_name'])) ? trim($t['bank_process_name']) : (($has_source_bank_process_id && !empty($t['card_owner_name'])) ? trim($t['card_owner_name']) : '-');
        // Id Product：手动 PROFIT（WIN/LOSE，非 Bank Process）统一显示为 PROFIT；
        // Domain Share% 自动生成的 Commission Payment（sms 标记或固定描述前缀）显示为 Commission。
        $isDomainShareCommission = false;
        $isDomainListFee = false;
        $smsText = trim((string) ($t['sms'] ?? ''));
        $descText = trim((string) ($t['description'] ?? ''));
        if (
            $smsText === '[DOMAIN_SHARE_COMMISSION]'
            || stripos($smsText, '[DOMAIN_SHARE_COMMISSION|') === 0
            || stripos($smsText, '[AUTO_RENEW|COMMISSION|') === 0
            || stripos($descText, 'Commision FROM ') === 0
            || stripos($descText, 'Commision for ') === 0
            || preg_match('/^Profit\s+(Commision|Commission|for)\b/i', $descText)
            || (stripos($smsText, '[DOMAIN_SHARE_COMMISSION|') === 0 && preg_match('/\|ROLE:PROFIT\|/i', $smsText))
        ) {
            $isDomainShareCommission = true;
        }
        $isDomainNetProfit = (
            stripos($smsText, '[DOMAIN_NET_PROFIT|') === 0
            || stripos($smsText, '[AUTO_RENEW|NET_PROFIT|') === 0
            || stripos($descText, 'Profit By ') === 0
        );
        if (
            $smsText === '[DOMAIN_LIST_FEE]'
            || stripos($smsText, '[DOMAIN_LIST_FEE|') === 0
            || historyIsAutoRenewFeeSms($smsText)
            || stripos($descText, 'Domain list fee FROM ') === 0
            || stripos($descText, 'Pay Domain Fee') === 0
            || stripos($descText, 'Pay Domain Fee To ') === 0
        ) {
            $isDomainListFee = true;
        }
        // 净利润 DOMAIN_NET_PROFIT：不入各账户 Payment History（主表 DOMAIN 行/虚拟历史仍可体现）
        if ($isDomainNetProfit) {
            continue;
        }
        $domainShareProductKind = null;
        if ($isDomainShareCommission) {
            $roleLabel = historyResolveDomainShareRoleLabel((string) $description, $smsText);
            if (stripos($smsText, '[AUTO_RENEW|COMMISSION|') === 0) {
                $srcCompany = historyResolveAutoRenewCommissionSourceCompany($smsText, $descText);
                $description = $roleLabel . ' Commission From ' . $srcCompany;
                $domainShareProductKind = 'Commission';
            } elseif ($roleLabel === 'PROFIT') {
                $srcCompany = historyParseDomainShareCommissionSourceCompanyCode($smsText);
                if ($srcCompany === null || $srcCompany === '') {
                    $srcCompany = 'LAG';
                }
                $description = historyAppendDomainGroupLabel('Profit From ' . strtoupper($srcCompany), $smsText);
                $domainShareProductKind = 'Profit';
            } else {
                $srcCompany = historyParseDomainShareCommissionSourceCompanyCode($smsText);
                if ($srcCompany === null || $srcCompany === '') {
                    $srcCompany = 'LAG';
                }
                $description = historyAppendDomainGroupLabel(
                    $roleLabel . ' Commission From ' . strtoupper($srcCompany),
                    $smsText
                );
                $domainShareProductKind = 'Commission';
            }
        }
        if ($isDomainListFee) {
            $description = historyAppendDomainGroupLabel(
                stripos($descText, 'Pay Domain Fee') === 0 ? trim($descText) : 'Pay Domain Fee',
                $smsText
            );
        }
        $productLabel = $isManualProfit ? 'PROFIT' : ($domainShareProductKind !== null ? $domainShareProductKind : ($isDomainShareCommission ? 'Commission' : $t['transaction_type']));

        $events[] = [
            'row_type' => 'transaction',
            'transaction_id' => $t['id'],
            'transaction_type' => $t['transaction_type'],
            'sort_date_ymd' => historySortDateYmdFromRaw($displayDateYmd ?? ''),
            'order_ts' => $transactionTimestamp ?: 0,
            'order_index' => $eventIndex++,
            'win_loss' => $win_loss,
            'cr_dr' => $cr_dr,
            'date' => date('d/m/Y', strtotime($displayDateYmd)),
            'source' => $t['transaction_type'],
            'product' => $productLabel,
            'card_owner' => $cardOwner,
            'is_bank_process_transaction' => $isBankProcessTransaction,
            'currency' => $transactionCurrency,
            'percent' => '-',
            'rate' => '-',
            'description' => $description,
            'sms' => ($isDomainShareCommission || $isDomainListFee) ? '-' : ($t['sms'] ?: '-'),
            'raw_transaction_description' => (string) ($t['description'] ?? ''),
            'raw_transaction_sms' => (string) ($t['sms'] ?? ''),
            'raw_from_account_code' => (string) ($t['from_account_code'] ?? ''),
            'is_view_to_account' => $is_to_account ? 1 : 0,
            'created_by' => $transactionCreatedBy
        ];
    }

    // Share% Profit 池：List Fee 入账 + 同源 Sales/CS/IT 佣金划出 → 一条净 Profit（与主表余额一致）
    if (!$apply_pure_history_filter) {
    foreach ($domainHubRollup['rollups'] as $rb) {
        $ft = $rb['fee_tx'];
        $netShow = $rb['net'];
        $srcU = strtoupper(trim((string) $rb['src']));
        $displayDateYmdRb = trim((string) ($ft['transaction_date'] ?? ''));
        $transactionTimestampRb = historyTransactionOrderTimestamp($displayDateYmdRb, $ft['created_at'] ?? null);
        $transactionCurrencyRb = null;
        if ($has_currency_id && !empty($ft['transaction_currency_code'])) {
            $transactionCurrencyRb = $ft['transaction_currency_code'];
        } elseif ($currency) {
            $transactionCurrencyRb = $currency;
        } else {
            $transactionCurrencyRb = $bfCurrency ?: '-';
        }
        $transactionCreatedByRb = '-';
        if (!empty($ft['created_by_login_id'])) {
            $transactionCreatedByRb = trim((string) $ft['created_by_login_id']);
        } elseif (!empty($ft['created_by_owner_code'])) {
            $transactionCreatedByRb = trim((string) $ft['created_by_owner_code']);
        } elseif (!empty($ft['created_by_name'])) {
            $transactionCreatedByRb = trim((string) $ft['created_by_name']);
        } elseif (!empty($ft['created_by_owner_name'])) {
            $transactionCreatedByRb = trim((string) $ft['created_by_owner_name']);
        }
        $events[] = [
            'row_type' => 'transaction',
            'transaction_id' => (int) ($ft['id'] ?? 0),
            'transaction_type' => 'PAYMENT',
            'sort_date_ymd' => historySortDateYmdFromRaw($displayDateYmdRb),
            'order_ts' => $transactionTimestampRb ?: 0,
            'order_index' => $eventIndex++,
            'win_loss' => '0',
            'cr_dr' => $netShow,
            'date' => $displayDateYmdRb !== '' ? date('d/m/Y', strtotime($displayDateYmdRb)) : '-',
            'source' => 'PAYMENT',
            'product' => 'PROFIT',
            'card_owner' => '-',
            'is_bank_process_transaction' => false,
            'currency' => $transactionCurrencyRb,
            'percent' => '-',
            'rate' => '-',
            'description' => historyAppendDomainGroupLabel(
                'Net Profit From ' . $srcU,
                (string) ($ft['sms'] ?? '')
            ),
            'sms' => '-',
            'created_by' => $transactionCreatedByRb,
        ];
    }
    }

    // ==================== 追加 RATE 分录（从 transaction_entry 读取） ====================
    $ratePh = implode(',', array_fill(0, count($account_ids), '?'));
    $rateSql = "SELECT 
                    e.id AS entry_id,
                    e.amount,
                    e.entry_type,
                    e.description AS entry_description,
                    e.currency_id,
                    c.code AS currency_code,
                    e.account_id AS entry_account_id,
                    tr.exchange_rate,
                    tr.rate_middleman_rate,
                    tr.rate_from_amount,
                    tr.rate_transfer_from_account_id,
                    tr.rate_transfer_to_account_id,
                    transfer_from_acc.account_id AS rate_transfer_from_account_code,
                    cf.code AS from_currency_code,
                    ct.code AS to_currency_code,
                    h.id AS header_id,
                    h.transaction_date,
                    h.sms,
                    h.created_at,
                    u.login_id AS created_by_login_id,
                    u.name AS created_by_name,
                    o.owner_code AS created_by_owner_code,
                    o.name AS created_by_owner_name,
                    em.description AS rate_middleman_entry_description,
                    (SELECT eacc.description
                       FROM transaction_entry eacc
                      WHERE eacc.header_id = h.id
                        AND eacc.entry_type IN ('RATE_FIRST_FROM', 'RATE_FIRST_TO', 'RATE_TRANSFER_FROM', 'RATE_TRANSFER_TO')
                      ORDER BY eacc.id ASC
                      LIMIT 1) AS rate_account_leg_description
                FROM transaction_entry e
                JOIN transactions h ON e.header_id = h.id
                LEFT JOIN currency c ON e.currency_id = c.id
                LEFT JOIN transactions_rate tr ON h.id = tr.transaction_id
                LEFT JOIN account transfer_from_acc ON tr.rate_transfer_from_account_id = transfer_from_acc.id
                LEFT JOIN currency cf ON tr.rate_from_currency_id = cf.id
                LEFT JOIN currency ct ON tr.rate_to_currency_id = ct.id
                LEFT JOIN user u ON h.created_by = u.id
                LEFT JOIN owner o ON h.created_by_owner = o.id
                LEFT JOIN transaction_entry em ON em.header_id = h.id AND em.entry_type = 'RATE_MIDDLEMAN'
                WHERE " . historyApiTxnWhereSqlForAlias('h') . "
                  " . ($history_is_group ? '' : 'AND e.company_id = ?') . "
                  AND h.transaction_type = 'RATE'
                  AND e.account_id IN ($ratePh)
                  AND DATE(h.transaction_date) BETWEEN ? AND ?";
    $rateParams = array_merge([$history_txn_bind], $history_is_group ? [] : [$company_id], $account_ids, [$date_from_db, $date_to_db]);

    if ($currency && $currency_id) {
        $rateSql .= " AND e.currency_id = ?";
        $rateParams[] = $currency_id;
    }

    $rateSql .= " ORDER BY h.transaction_date ASC, h.created_at ASC, e.id ASC";

    $rateStmt = $pdo->prepare($rateSql);
    $rateStmt->execute($rateParams);
    $rateRows = $rateStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rateRows as $row) {
        $rateYmd = historySortDateYmdFromRaw($row['transaction_date'] ?? '');
        if ($rateYmd === '9999-12-31') {
            $rateYmd = '';
        }
        $transactionTimestamp = historyTransactionOrderTimestamp($rateYmd, $row['created_at'] ?? null);

        $amount = $row['amount'] ?? '0';
        // RATE 第二行/第四行：TO 负数、FROM 正数（与 CONTRA / PAYMENT 默认展示一致）0
        // Middle-Man（RATE_MIDDLEMAN）保留正数，并显示在 Win/Loss
        $entryType = $row['entry_type'] ?? '';
        if (in_array($entryType, ['RATE_FIRST_FROM', 'RATE_TRANSFER_FROM', 'RATE_FIRST_TO', 'RATE_TRANSFER_TO'], true)) {
            $amount = historyNeg($amount);
        }

        $description = $row['entry_description'] ?: 'RATE';
        $platformFeeRemark = null;

        // RATE 后缀：业务上的 From Account（付款方）= RATE_FIRST_FROM、RATE_TRANSFER_TO；
        // 业务上的 To Account（收款方）= RATE_FIRST_TO、RATE_TRANSFER_FROM —— 注意 RATE_TRANSFER_FROM/TO
        // 这两个 entry_type 名字和账号绑定是反的（见 submit_api.php 对应注释）。
        // 哪一边显示 Rate-Mul 取决于乘除模式，方向相反：
        // - multiply 模式：To Account 显示 Rate-Mul（原样数字），From Account 显示原始汇率。
        // - divide 模式：From Account 显示 Rate-Mul（原样 "/{除数}"），To Account 显示原始汇率。
        // 差价（原汇率 − Rate-Mul）算 Middle-Man 的利润，不计入 From/To 两个 account 之间的汇兑描述，
        // 所以未命中的一侧留空，交给 formatExchangeRateDescription 回退显示原始汇率。
        $displayRateForSuffix = null;
        if (in_array($entryType, ['RATE_FIRST_FROM', 'RATE_FIRST_TO', 'RATE_TRANSFER_FROM', 'RATE_TRANSFER_TO'], true)) {
            $middlemanRate = $row['rate_middleman_rate'] ?? null;
            $isDivideMode = (bool) preg_match('/\(\s*\/[^)]*\)/', (string) ($row['rate_middleman_entry_description'] ?? ''));
            $isBusinessToAccount = in_array($entryType, ['RATE_FIRST_TO', 'RATE_TRANSFER_FROM'], true);
            $showMiddlemanRateHere = $isDivideMode ? !$isBusinessToAccount : $isBusinessToAccount;
            if ($showMiddlemanRateHere && $middlemanRate !== null && $middlemanRate !== '') {
                $displayRateForSuffix = $isDivideMode
                    ? ('/' . money_out($middlemanRate, 6))
                    : money_out($middlemanRate, 6);
            }
        }

        if ($entryType === 'RATE_MIDDLEMAN') {
            $rawMiddleDesc = (string) ($row['entry_description'] ?? '');
            if (preg_match('/\n\[\[PFEE_REMARK\]\](.+)$/s', $rawMiddleDesc, $pfeeMatch)) {
                $platformFeeRemark = trim((string) ($pfeeMatch[1] ?? ''));
                $rawMiddleDesc = preg_replace('/\n\[\[PFEE_REMARK\]\].+$/s', '', $rawMiddleDesc);
            }

            // MARKUP 显示的是 Rate-Mul 相对原汇率的差额，不是 Rate-Mul 原始输入值。
            // - multiply 模式：exchange_rate 和 rate_middleman_rate 都是原样存的乘数，
            //   用「原汇率 − Rate-Mul」，与 rateMulCommission 公式方向一致（输入越小，markup 越大）。
            // - divide 模式：exchange_rate 存的是原汇率的倒数（`/2` 存成 `0.5`），
            //   rate_middleman_rate 存的是 Rate-Mul 除数本身（`/1.9` 存成 `1.9`），
            //   两者单位不同，需要先把 exchange_rate 还原成原除数（1/exchange_rate）再相减（此方向未变）。
            $markupRate = $row['rate_middleman_rate'] ?? null;
            $exchangeRateForMarkup = $row['exchange_rate'] ?? null;
            if ($markupRate !== null && $markupRate !== '' && $exchangeRateForMarkup !== null && $exchangeRateForMarkup !== '') {
                $isDivideMode = (bool) preg_match('/\(\s*\/[^)]*\)/', $rawMiddleDesc);
                if ($isDivideMode) {
                    // 优先用账户腿 description 里保留的原始除数文本，避免对已截断到 6 位小数的
                    // exchange_rate 二次取倒数造成的精度误差（如 1.71 − 1.70000085 ≠ 0.01）。
                    $originalDivisor = extractDivideRateDivisorText($row['rate_account_leg_description'] ?? null);
                    if ($originalDivisor === null && money_cmp($exchangeRateForMarkup, '0') > 0) {
                        $originalDivisor = money_div('1', $exchangeRateForMarkup, 8);
                    }
                    if ($originalDivisor !== null) {
                        $markupRate = money_sub($markupRate, $originalDivisor, 8);
                    }
                } else {
                    $markupRate = money_sub($exchangeRateForMarkup, $markupRate, 8);
                }
            }

            $description = formatMarkupDescription(
                $rawMiddleDesc,
                $row['from_currency_code'] ?? null,
                $row['to_currency_code'] ?? null,
                $markupRate,
                $row['rate_from_amount'] ?? null,
                $row['rate_transfer_from_account_code'] ?? null
            );
        } elseif (in_array($entryType, ['RATE_FEE', 'RATE_PLATFORM_FEE'], true)) {
            // Keep Fee / Platform Fee descriptions as stored (Charge … Service Fees / PlatForm Fee).
        } else {
            $description = formatExchangeRateDescription(
                $description,
                $row['from_currency_code'] ?? null,
                $row['to_currency_code'] ?? null,
                $displayRateForSuffix,
                $row['rate_from_amount'] ?? null
            );
        }

        if ($isMemberUser && $description !== 'RATE') {
            $description = stripTrailingRateSuffix($description);
        }
        $transactionCurrency = $row['currency_code'] ?: $bfCurrency;

        // 确定 Created By：优先 login_id / owner_code，其次姓名
        $transactionCreatedBy = '-';
        if (!empty($row['created_by_login_id'])) {
            $transactionCreatedBy = $row['created_by_login_id'];
        } elseif (!empty($row['created_by_owner_code'])) {
            $transactionCreatedBy = $row['created_by_owner_code'];
        } elseif (!empty($row['created_by_name'])) {
            $transactionCreatedBy = $row['created_by_name'];
        } elseif (!empty($row['created_by_owner_name'])) {
            $transactionCreatedBy = $row['created_by_owner_name'];
        }

        // Desktop: Service Fee is its own RATE_FEE row — RATE_TRANSFER_TO has no Fee Remark.
        // Mobile/legacy: header sms still carries "Service Fees" → keep as Remark on TRANSFER_TO.
        // Negative Platform Fee: remark-only on RATE_MIDDLEMAN.
        $rateServiceFeeRemark = null;
        if ($entryType === 'RATE_TRANSFER_TO') {
            $headerSms = trim((string) ($row['sms'] ?? ''));
            if ($headerSms !== '') {
                $rateServiceFeeRemark = $headerSms;
            }
        } elseif ($entryType === 'RATE_MIDDLEMAN' && !empty($platformFeeRemark)) {
            $rateServiceFeeRemark = $platformFeeRemark;
        }

        $events[] = [
            'row_type' => 'transaction',
            'transaction_id' => $row['header_id'],
            'transaction_type' => 'RATE',
            'sort_date_ymd' => historySortDateYmdFromRaw($row['transaction_date'] ?? ''),
            'order_ts' => $transactionTimestamp ?: 0,
            'order_index' => $eventIndex++,
            'win_loss' => $entryType === 'RATE_MIDDLEMAN' ? $amount : 0,
            'cr_dr' => $entryType === 'RATE_MIDDLEMAN' ? 0 : $amount,
            'date' => date('d/m/Y', strtotime($row['transaction_date'])),
            'source' => 'RATE',
            'product' => mapEntryTypeToProduct($row['entry_type']),
            'card_owner' => '-',
            'is_bank_process_transaction' => false,
            'currency' => $transactionCurrency,
            'percent' => '-',
            'rate' => '-',
            'description' => $description,
            'entry_description_raw' => (string) ($row['entry_description'] ?? ''),
            'sms' => '-',
            'remark' => $rateServiceFeeRemark,
            'created_by' => $transactionCreatedBy,
            'from_currency_code' => $row['from_currency_code'] ?? null,
            'to_currency_code' => $row['to_currency_code'] ?? null,
            'rate_from_amount' => $row['rate_from_amount'] ?? null,
            'exchange_rate' => $row['exchange_rate'] ?? null,
            'rate_middleman_rate' => $row['rate_middleman_rate'] ?? null,
            'rate_middleman_entry_description' => $row['rate_middleman_entry_description'] ?? null,
            'rate_markup_value' => $entryType === 'RATE_MIDDLEMAN' ? ($markupRate ?? null) : null,
            'entry_type' => $entryType
        ];
    }

    // 先按业务日历日升序（旧在上、新在下），同日再按 order_ts；同一 RATE header 下同秒则 FROM 先于 TO，否则按加入序
    usort($events, function ($a, $b) {
        $da = $a['sort_date_ymd'] ?? '9999-12-31';
        $db = $b['sort_date_ymd'] ?? '9999-12-31';
        if ($da !== $db) {
            return $da <=> $db;
        }
        $tsA = (int) ($a['order_ts'] ?? 0);
        $tsB = (int) ($b['order_ts'] ?? 0);
        if ($tsA !== $tsB) {
            return $tsA <=> $tsB;
        }
        $aRate = ($a['transaction_type'] ?? '') === 'RATE';
        $bRate = ($b['transaction_type'] ?? '') === 'RATE';
        if ($aRate && $bRate) {
            $idA = $a['transaction_id'] ?? null;
            $idB = $b['transaction_id'] ?? null;
            if ($idA !== null && $idA !== '' && (string) $idA === (string) $idB) {
                $legA = historyRateLegSortGroup($a['entry_type'] ?? null);
                $legB = historyRateLegSortGroup($b['entry_type'] ?? null);
                if ($legA !== $legB) {
                    return $legA <=> $legB;
                }
            }
        }
        return ($a['order_index'] ?? 0) <=> ($b['order_index'] ?? 0);
    });

    if ($apply_pure_history_filter) {
        $events = array_values(array_filter(
            $events,
            static fn(array $event): bool => typeTxSearchPassesPureHistoryEvent($pure_type_search, $event)
        ));
        foreach ($history as &$bfRow) {
            if (($bfRow['row_type'] ?? '') === 'bf') {
                $bfRow['balance'] = '0.00';
            }
        }
        unset($bfRow);
    }

    // 按货币分别累计余额，避免多币别时 Balance 列显示成「所有币别总和」（Member Win/Loss 每行应显示该币别 running balance）
    $balance_by_currency = [];
    // 未指定 currency 时：B/F 按 bf_per_currency 多行展示，running balance 必须为每个币别分别带入对应 opening，否则会只见第一币别 B/F（其余从 0 累加）
    if (is_array($bf_per_currency) && count($bf_per_currency) > 0) {
        foreach ($bf_per_currency as $code => $bfAmt) {
            $ck = trim((string) $code);
            if ($ck === '') {
                continue;
            }
            $balance_by_currency[$ck] = money_normalize($bfAmt, 6);
        }
    } elseif ($bfCurrency !== null && $bfCurrency !== '') {
        // 指定单一 currency 或 legacy 单笔 B/F：累加用更高精度（8dp）保存，展示时再统一 HALF_UP 到 2dp
        $balance_by_currency[$bfCurrency] = money_normalize($bf, 6);
    }

    if ($apply_pure_history_filter) {
        foreach (array_keys($balance_by_currency) as $curKey) {
            $balance_by_currency[$curKey] = money_normalize('0', 6);
        }
    }

    foreach ($events as $event) {
        $displayCurrency = $event['currency'] ?? $bfCurrency;
        $curKey = ($displayCurrency !== null && (string) $displayCurrency !== '') ? (string) $displayCurrency : '-';
        if (!isset($balance_by_currency[$curKey])) {
            $balance_by_currency[$curKey] = money_normalize('0', 6);
        }

        $rawWl = $event['win_loss'] ?? '0';
        $rawCrDr = $event['cr_dr'] ?? '0';
        $wlForCalc = ($rawWl === '-' || trim((string) $rawWl) === '') ? '0' : $rawWl;
        $crdrForCalc = ($rawCrDr === '-' || trim((string) $rawCrDr) === '') ? '0' : $rawCrDr;

        // 保留 8 位用于 running balance 计算；展示再 HALF_UP 到 2 位
        $eventWinLoss = money_normalize($wlForCalc, 6);
        $eventCrDr = money_normalize($crdrForCalc, 6);

        $balance_by_currency[$curKey] = money_add(
            money_add($balance_by_currency[$curKey], $eventWinLoss, 6),
            $eventCrDr,
            6
        );
        $row_balance = $balance_by_currency[$curKey];

        // 默认使用事件自身的 description；Member Win/Loss 对 RATE / PAYMENT 做文案优化
        $finalDescription = $event['description'];
        if ($isMemberUser) {
            // RATE 行：Currency Exchange / FX Markup 文案
            if (($event['source'] ?? '') === 'RATE') {
                $entryType = $event['entry_type'] ?? '';
                if ($entryType === 'RATE_MIDDLEMAN') {
                    // Middle-Man：显示 Markup (FROM amount > TO) Rate x
                    // Rate 展示的是 Markup 差额（与 admin/Payment History 一致），不是 Rate-Mul 原始输入值。
                    $fromCode = $event['from_currency_code'] ?? null;
                    $toCode = $event['to_currency_code'] ?? null;
                    $fromAmount = $event['rate_from_amount'] ?? null;
                    $markupRateForDisplay = $event['rate_markup_value'] ?? null;
                    if ($markupRateForDisplay === null || $markupRateForDisplay === '') {
                        $markupRateForDisplay = $event['rate_middleman_rate'] ?? null;
                    }
                    if ($fromCode && $toCode) {
                        $finalDescription = 'Markup (' . $fromCode;
                        if ($fromAmount !== null && $fromAmount !== '') {
                        $formattedAmount = historyDisplayDecimal($fromAmount, 6);
                            if ($formattedAmount !== '') {
                                $finalDescription .= ' ' . $formattedAmount;
                            }
                        }
                        $finalDescription .= ' > ' . $toCode . ')';
                        if ($markupRateForDisplay !== null && $markupRateForDisplay !== '') {
                        $formattedRate = historyDisplayDecimal($markupRateForDisplay, 6);
                            if ($formattedRate !== '') {
                                $finalDescription .= ' Rate ' . $formattedRate;
                            }
                        }
                    } else {
                        $finalDescription = 'Markup';
                    }
                } else {
                    // 汇率兑换本身：Currency Exchange (FROM amount > TO)；Rate 按分录类型区分（Member）
                    // - RATE_FIRST_FROM / RATE_FIRST_TO：不展示 Rate
                    // - RATE_TRANSFER_FROM：divide 模式换算净汇率（逻辑不变，无效则回退原始），multiply 模式恒原始
                    // - RATE_TRANSFER_TO：divide 模式恒原始（不变），multiply 模式直接显示 Rate-Mul 原始值
                    $fromCode = $event['from_currency_code'] ?? null;
                    $toCode = $event['to_currency_code'] ?? null;
                    $fromAmount = $event['rate_from_amount'] ?? null;
                    $exchangeRate = $event['exchange_rate'] ?? null;
                    $middlemanRate = $event['rate_middleman_rate'] ?? null;
                    $isDivideMode = (bool) preg_match('/\(\s*\/[^)]*\)/', (string) ($event['rate_middleman_entry_description'] ?? ''));

                    $rateForSuffix = null;
                    // divide 模式下需要与 admin/Payment History 一致，展示 Middle-Man 输入的原始除数
                    // （如 "/1.71"），而不是 exchange_rate 存的倒数小数（如 "0.588235"）或净汇率计算值。
                    $rateForSuffixIsExpression = false;
                    if (!in_array($entryType, ['RATE_FIRST_FROM', 'RATE_FIRST_TO'], true)) {
                        if ($isDivideMode) {
                            if ($middlemanRate !== null && (string) $middlemanRate !== '') {
                                $rateForSuffix = '/' . money_out($middlemanRate, 6);
                                $rateForSuffixIsExpression = true;
                            } elseif ($exchangeRate !== null && $exchangeRate !== '' && money_cmp($exchangeRate, '0') > 0) {
                                $rateForSuffix = '/' . money_out(money_div('1', $exchangeRate, 8), 6);
                                $rateForSuffixIsExpression = true;
                            }
                        } elseif ($entryType === 'RATE_TRANSFER_TO') {
                            $rateForSuffix = ($middlemanRate !== null && $middlemanRate !== '')
                                ? money_out($middlemanRate, 6)
                                : (($exchangeRate !== null && $exchangeRate !== '') ? $exchangeRate : null);
                        } else {
                            // 其余情况（RATE_TRANSFER_FROM 乘法模式、RATE_FEE 等）：使用原始汇率
                            $rateForSuffix = ($exchangeRate !== null && $exchangeRate !== '') ? $exchangeRate : null;
                        }
                    }

                    if ($fromCode && $toCode) {
                        $finalDescription = 'Currency Exchange (' . $fromCode;
                        if ($fromAmount !== null && $fromAmount !== '') {
                            $formattedAmount = historyDisplayDecimal($fromAmount, 6);
                            if ($formattedAmount !== '') {
                                $finalDescription .= ' ' . $formattedAmount;
                            }
                        }
                        $finalDescription .= ' > ' . $toCode . ')';
                        if ($rateForSuffix !== null && $rateForSuffix !== '') {
                            $formattedRate = $rateForSuffixIsExpression
                                ? $rateForSuffix
                                : historyDisplayDecimal($rateForSuffix, 6);
                            if ($formattedRate !== '') {
                                $finalDescription .= ' Rate ' . $formattedRate;
                            }
                        }
                    } else {
                        $finalDescription = 'Currency Exchange';
                    }
                }
            }
            // PAYMENT 行：统一显示 Payment Settlement
            elseif (($event['transaction_type'] ?? '') === 'PAYMENT') {
                $finalDescription = 'Payment Settlement';
            }
            // CLAIM 行：统一显示 Claim Settlement
            elseif (($event['transaction_type'] ?? '') === 'CLAIM') {
                $finalDescription = 'Claim Settlement';
            }
        }

        $history[] = [
            'row_type' => $event['row_type'],
            'transaction_id' => $event['transaction_id'],
            'date' => $event['date'],
            'source' => $event['source'] ?? '-',
            'product' => $event['product'] ?? '-',
            'card_owner' => $event['card_owner'] ?? '-',
            'is_bank_process_transaction' => $event['is_bank_process_transaction'] ?? false,
            'currency' => $displayCurrency,
            'percent' => $event['percent'] ?? '-',
            'rate' => $event['rate'] ?? '-',
            // Payment History 展示口径：2dp 且 HALF_UP（四舍五入）；仅影响展示，不改变后端计算/数据库精度
            'win_loss' => money_cmp($eventWinLoss, '0') !== 0 ? money_round_half_up($eventWinLoss, 2) : '0.00',
            'cr_dr' => money_cmp($eventCrDr, '0') !== 0 ? money_round_half_up($eventCrDr, 2) : '0.00',
            'balance' => money_round_half_up($row_balance, 2),
            'description' => $finalDescription,
            'sms' => $event['sms'],
            'remark' => $event['remark'] ?? null,
            'created_by' => $event['created_by'],
            'transaction_type' => $event['transaction_type']
        ];
    }

    // 返回结果
    historyApiEchoSuccess([
        'account' => [
            'id' => $account['id'],
            'account_id' => $account['account_id'],
            'name' => $account['name'],
            'currency' => $bfCurrency,
        ],
        'date_range' => [
            'from' => $date_from,
            'to' => $date_to,
        ],
        'history' => $history,
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => '数据库错误: ' . $e->getMessage(),
        'data' => null,
        'error' => '数据库错误: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
        'data' => null,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}

// ==================== 辅助函数 ====================

/**
 * 计算 B/F (Balance Forward)
 * 与 search_api.php 中的函数相同
 */
function calculateBF($pdo, $account_id, $date_from, $company_id)
{
    $bf = '0';

    // 1. 计算日期之前所有 data_capture 的 processed_amount
    // 注意：account_id 可能是字符串或整数，使用 CAST 来统一类型进行比较
    $sql = "SELECT COALESCE(SUM(dcd.processed_amount), 0) as total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
              AND dc.capture_date < ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, $date_from]);
    $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);

    // 2. 计算日期之前所有 transactions 的影响
    // WIN/LOSE/RATE/PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM 影响 Cr/Dr；ADJUSTMENT 影响 Win/Loss（作为 To Account）
    $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM', 'RATE') THEN -amount
                        WHEN transaction_type = 'CLEAR' THEN -amount
                        WHEN transaction_type = 'CONTRA' THEN -amount
                        WHEN transaction_type = 'PAYMENT' THEN -amount
                        WHEN transaction_type = 'WIN' THEN amount
                        WHEN transaction_type = 'LOSE' THEN -amount
                        WHEN transaction_type = 'ADJUSTMENT' THEN amount
                        ELSE 0
                    END), 0) as cr_dr
            FROM transactions t
            WHERE " . historyApiTxnWhereSql('t') . "
              AND t.account_id = ?
              AND t.transaction_date < ?
              AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'RATE', 'WIN', 'LOSE', 'ADJUSTMENT')
              AND (t.transaction_type != 'RATE' OR t.from_account_id IS NOT NULL)"
        . historyContraApprovedWhere($pdo, 't');

    $stmt = $pdo->prepare($sql);
    $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from]);
    $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);

    // PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM/RATE 影响 Cr/Dr（作为 From Account）；CONTRA/CLEAR 时 FROM 显示正数
    $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM', 'RATE') THEN amount
                        WHEN transaction_type = 'CONTRA' THEN amount
                        WHEN transaction_type = 'CLEAR' THEN amount
                        ELSE 0
                    END), 0) as cr_dr
            FROM transactions t
            WHERE " . historyApiTxnWhereSql('t') . "
              AND t.from_account_id = ?
              AND t.transaction_date < ?
              AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM', 'RATE')"
        . historyContraApprovedWhere($pdo, 't');

    $stmt = $pdo->prepare($sql);
    $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from]);
    $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);

    return historyTrunc2($bf);
}

/** FROM 端手动 WIN/LOSE 计入 B/F（与 search_api calculateBFByCurrency 一致） */
function historyBfFromAccountManualWinLose(PDO $pdo, $company_id, $account_id, $date_from, $currency_id, bool $txnHasCurrencyId): string
{
    $manual = "((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL)";
    if ($txnHasCurrencyId) {
        $sql = "SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type = 'WIN' THEN t.amount
                  WHEN t.transaction_type = 'LOSE' THEN -t.amount
                  ELSE 0
                END), 0)
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . "
                  AND CAST(t.from_account_id AS CHAR) = CAST(? AS CHAR)
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('WIN', 'LOSE')
                  AND {$manual}
                  AND (
                      (t.currency_id = ?)
                      OR (t.currency_id IS NULL AND EXISTS (
                          SELECT 1 FROM data_capture_details dcd
                          JOIN data_captures dc ON dcd.capture_id = dc.id
                          WHERE dcd.company_id = ? AND dc.company_id = ?
                            AND CAST(dcd.account_id AS CHAR) = CAST(t.from_account_id AS CHAR)
                            AND dcd.currency_id = ?
                      ))
                  )" . historyContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $currency_id, $company_id, $company_id, $currency_id]);
    } else {
        $sql = "SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type = 'WIN' THEN t.amount
                  WHEN t.transaction_type = 'LOSE' THEN -t.amount
                  ELSE 0
                END), 0)
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . " AND t.from_account_id = ? AND t.transaction_date < ?
                  AND t.transaction_type IN ('WIN', 'LOSE')
                  AND {$manual}
                  AND EXISTS (
                      SELECT 1 FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ? AND dc.company_id = ? AND dcd.account_id = t.from_account_id AND dcd.currency_id = ?
                  )" . historyContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $company_id, $company_id, $currency_id]);
    }
    return (string) ($stmt->fetchColumn() ?: '0');
}

/**
 * 按 Currency 计算 B/F (Balance Forward)
 * 与 search_api.php / dashboard_api.php 口径对齐（含 DOMAIN_NET_PROFIT、List Fee、Share Commission、池子期初佣金扣回）
 */
function calculateBFByCurrency($pdo, $account_id, $currency_id, $date_from, $company_id, $account_code = '')
{
    $bf = '0';
    $code_str = trim((string) $account_code);

    // 检查 transactions 表是否有 currency_id 字段（仅检查一次）
    static $has_transaction_currency = null;
    if ($has_transaction_currency === null) {
        $stmt = $pdo->query("SHOW COLUMNS FROM transactions LIKE 'currency_id'");
        $has_transaction_currency = $stmt->rowCount() > 0;
    }

    // 1. 计算起始日期之前所有 data_capture（按 currency 过滤）
    // 与 search_api 一致：account_id 可能存数字 id 或账户代码
    $dcdQhistBf = dcd_processed_amount_sql_quant2('dcd.processed_amount');
    $sql = "SELECT COALESCE(SUM({$dcdQhistBf}), 0) as total
            FROM data_capture_details dcd
            JOIN data_captures dc ON dcd.capture_id = dc.id
            WHERE dcd.company_id = ?
              AND dc.company_id = ?
              AND (
                  CAST(dcd.account_id AS CHAR) = CAST(? AS CHAR)
                  OR (? <> '' AND TRIM(COALESCE(dcd.account_id, '')) = TRIM(?))
              )
              AND dcd.currency_id = ?
              AND dc.capture_date < ?";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$company_id, $company_id, $account_id, $code_str, $code_str, $currency_id, $date_from]);
    $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);

    // 2. 起始日期之前：Win/Loss 来自 WIN/LOSE（含 PROFIT）+ Cr/Dr 来自 PAYMENT/RECEIVE/CONTRA/CLEAR/CLAIM（作为 To Account）；RATE 单独用 transaction_entry 处理
    if ($has_transaction_currency) {
        // 2a. WIN/LOSE（含 PROFIT）：Bank Process 保持 WIN 正 LOSE 负；手动 PROFIT 与 PAYMENT 一致 TO 负 FROM 正
        $sql = "SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN t.amount
                  WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN -t.amount
                  WHEN t.transaction_type = 'WIN' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN -t.amount
                  WHEN t.transaction_type = 'LOSE' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN t.amount
                  WHEN t.transaction_type = 'ADJUSTMENT' THEN t.amount
                  ELSE 0
                END), 0) as total
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . "
                  AND CAST(t.account_id AS CHAR) = CAST(? AS CHAR)
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('WIN', 'LOSE', 'ADJUSTMENT')
                  AND (
                      (t.currency_id = ?)
                      OR (t.currency_id IS NULL AND EXISTS (
                          SELECT 1 FROM data_capture_details dcd
                          JOIN data_captures dc ON dcd.capture_id = dc.id
                          WHERE dcd.company_id = ? AND dc.company_id = ?
                            AND CAST(dcd.account_id AS CHAR) = CAST(t.account_id AS CHAR)
                            AND dcd.currency_id = ?
                      ))
                  )" . historyContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $currency_id, $company_id, $company_id, $currency_id]);
        $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);
        $bf = money_add($bf, historyBfFromAccountManualWinLose($pdo, $company_id, $account_id, $date_from, $currency_id, true), 8);

        // 2b. PAYMENT/RECEIVE/CONTRA/CLAIM 作为 To Account 计入 B/F 的 Cr/Dr 部分（DOMAIN_NET_PROFIT 与 Cr/Dr 列一致记 0，避免重复与错误符号）
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -t.amount
                        WHEN transaction_type = 'CONTRA' THEN -t.amount
                        WHEN transaction_type = 'CLEAR' THEN -t.amount
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' OR t.sms LIKE '[AUTO_RENEW|COMMISSION|%') THEN t.amount
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_NET_PROFIT|%' OR t.sms LIKE '[AUTO_RENEW|NET_PROFIT|%') THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %' OR (t.sms LIKE '[AUTO_RENEW|%' AND t.sms NOT LIKE '[AUTO_RENEW|COMMISSION|%' AND t.sms NOT LIKE '[AUTO_RENEW|NET_PROFIT|%')) THEN t.amount
                        WHEN transaction_type = 'PAYMENT' THEN -t.amount
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . "
                  AND CAST(t.account_id AS CHAR) = CAST(? AS CHAR)
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND t.currency_id = ?"
            . historyContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $currency_id]);
        $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);
    } else {
        // WIN/LOSE 计入 B/F（Bank Process 保持原符号；手动 PROFIT TO 负 FROM 正）
        $sql = "SELECT COALESCE(SUM(CASE
                  WHEN t.transaction_type = 'WIN' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN t.amount
                  WHEN t.transaction_type = 'LOSE' AND (t.description LIKE 'Process: %' OR t.description LIKE 'Inactive Compensation %' OR t.description LIKE 'Compensation %') THEN -t.amount
                  WHEN t.transaction_type = 'WIN' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN -t.amount
                  WHEN t.transaction_type = 'LOSE' AND ((t.description NOT LIKE 'Process: %' AND t.description NOT LIKE 'Inactive Compensation %' AND t.description NOT LIKE 'Compensation %') OR t.description IS NULL) THEN t.amount
                  WHEN t.transaction_type = 'ADJUSTMENT' THEN t.amount
                  ELSE 0
                END), 0) as total
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . " AND t.account_id = ? AND t.transaction_date < ?
                  AND t.transaction_type IN ('WIN', 'LOSE', 'ADJUSTMENT')
                  AND EXISTS (
                      SELECT 1 FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ? AND dc.company_id = ? AND dcd.account_id = t.account_id AND dcd.currency_id = ?
                  )" . historyContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $company_id, $company_id, $currency_id]);
        $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);
        $bf = money_add($bf, historyBfFromAccountManualWinLose($pdo, $company_id, $account_id, $date_from, $currency_id, false), 8);

        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type IN ('RECEIVE', 'CLAIM') THEN -t.amount
                        WHEN transaction_type = 'CONTRA' THEN -t.amount
                        WHEN transaction_type = 'CLEAR' THEN -t.amount
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_NET_PROFIT|%' OR t.sms LIKE '[AUTO_RENEW|NET_PROFIT|%') THEN 0
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %' OR (t.sms LIKE '[AUTO_RENEW|%' AND t.sms NOT LIKE '[AUTO_RENEW|COMMISSION|%' AND t.sms NOT LIKE '[AUTO_RENEW|NET_PROFIT|%')) THEN t.amount
                        WHEN transaction_type = 'PAYMENT' THEN -t.amount
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . "
                  AND t.account_id = ?
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND EXISTS (
                      SELECT 1
                      FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ?
                        AND dc.company_id = ?
                        AND dcd.account_id = t.account_id
                        AND dcd.currency_id = ?
                  )"
            . historyContraApprovedWhere($pdo, 't');
        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $company_id, $company_id, $currency_id]);
        $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);
    }

    // 3. 计算起始日期之前所有 Cr/Dr（作为 From Account，按 currency 过滤；RATE 单独用 transaction_entry 处理）
    if ($has_transaction_currency) {
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type = 'CONTRA' THEN t.amount
                        WHEN transaction_type = 'CLEAR' THEN t.amount
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %' OR (t.sms LIKE '[AUTO_RENEW|%' AND t.sms NOT LIKE '[AUTO_RENEW|COMMISSION|%' AND t.sms NOT LIKE '[AUTO_RENEW|NET_PROFIT|%')) THEN -t.amount
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN t.amount
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . "
                  AND t.from_account_id = ?
                  AND t.currency_id = ?
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')"
            . " AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_SHARE_COMMISSION|%'"
            . " AND COALESCE(t.sms, '') NOT LIKE '[AUTO_RENEW|COMMISSION|%'"
            . " AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_NET_PROFIT|%'"
            . " AND COALESCE(t.sms, '') NOT LIKE '[AUTO_RENEW|NET_PROFIT|%'"
            . historyContraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $currency_id, $date_from]);
    } else {
        $sql = "SELECT 
                    COALESCE(SUM(CASE 
                        WHEN transaction_type = 'CONTRA' THEN t.amount
                        WHEN transaction_type = 'CLEAR' THEN t.amount
                        WHEN transaction_type = 'PAYMENT' AND (t.sms LIKE '[DOMAIN_LIST_FEE|%' OR UPPER(TRIM(COALESCE(t.description, ''))) LIKE 'DOMAIN LIST FEE FROM %' OR (t.sms LIKE '[AUTO_RENEW|%' AND t.sms NOT LIKE '[AUTO_RENEW|COMMISSION|%' AND t.sms NOT LIKE '[AUTO_RENEW|NET_PROFIT|%')) THEN -t.amount
                        WHEN transaction_type IN ('PAYMENT', 'RECEIVE', 'CLAIM') THEN t.amount
                        ELSE 0
                    END), 0) as cr_dr
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . "
                  AND t.from_account_id = ?
                  AND t.transaction_date < ?
                  AND t.transaction_type IN ('PAYMENT', 'RECEIVE', 'CONTRA', 'CLEAR', 'CLAIM')
                  AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_SHARE_COMMISSION|%'
                  AND COALESCE(t.sms, '') NOT LIKE '[AUTO_RENEW|COMMISSION|%'
                  AND COALESCE(t.sms, '') NOT LIKE '[DOMAIN_NET_PROFIT|%'
                  AND COALESCE(t.sms, '') NOT LIKE '[AUTO_RENEW|NET_PROFIT|%'
                  AND EXISTS (
                      SELECT 1
                      FROM data_capture_details dcd
                      JOIN data_captures dc ON dcd.capture_id = dc.id
                      WHERE dcd.company_id = ?
                        AND dc.company_id = ?
                        AND dcd.account_id = t.from_account_id
                        AND dcd.currency_id = ?
                  )"
            . historyContraApprovedWhere($pdo, 't');

        $stmt = $pdo->prepare($sql);
        $stmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $company_id, $company_id, $currency_id]);
    }
    $bf = money_add($bf, $stmt->fetchColumn() ?: '0', 8);

    // 4. 追加起始日期之前的所有 RATE 分录（统一从 transaction_entry 计算）
    $rateEntryCompanySql = historyApiIsGroupLedger() ? '' : ' AND e.company_id = ?';
    $rateStmt = $pdo->prepare("
        SELECT COALESCE(SUM(CASE
          WHEN e.entry_type IN ('RATE_FIRST_FROM','RATE_TRANSFER_FROM') THEN -e.amount
          WHEN e.entry_type IN ('RATE_FIRST_TO','RATE_TRANSFER_TO') THEN -e.amount
          WHEN e.entry_type = 'RATE_MIDDLEMAN' THEN e.amount
          ELSE e.amount
        END), 0) AS total
        FROM transaction_entry e
        JOIN transactions h ON e.header_id = h.id
        WHERE " . historyApiTxnWhereSqlForAlias('h') . "
          {$rateEntryCompanySql}
          AND h.transaction_type = 'RATE'
          AND e.account_id = ?
          AND e.currency_id = ?
          AND h.transaction_date < ?
    ");
    $rateStmtParams = array_merge(
        [historyApiTxnWhereBind()],
        historyApiIsGroupLedger() ? [] : [$company_id],
        [$account_id, $currency_id, $date_from]
    );
    $rateStmt->execute($rateStmtParams);
    $bf = money_add($bf, $rateStmt->fetchColumn() ?: '0', 8);

    // 5. 池子账户：起始日前已付的 Domain Share Commission 从 B/F 扣回（与 dashboard_api / 交易列表 searchApiApplyDomainSourceCompanyRows 一致）
    if ($has_transaction_currency && (int) $currency_id > 0) {
        try {
            $adjStmt = $pdo->prepare("
                SELECT COALESCE(SUM(t.amount), 0)
                FROM transactions t
                WHERE " . historyApiTxnWhereSql('t') . "
                  AND t.transaction_type = 'PAYMENT'
                  AND t.from_account_id = ?
                  AND t.transaction_date < ?
                  AND t.currency_id = ?
                  AND (t.sms LIKE '[DOMAIN_SHARE_COMMISSION|%' OR t.sms LIKE '[AUTO_RENEW|COMMISSION|%')
            ");
            $adjStmt->execute([historyApiTxnWhereBind(), $account_id, $date_from, $currency_id]);
            // SUM 保留符号：佣金合计为正则扣减 B/F；若存在负数冲正则代数相减
            $adj = $adjStmt->fetchColumn() ?: '0';
            if (money_cmp(money_abs($adj), '0.00001') > 0) {
                $bf = money_sub($bf, $adj, 8);
            }
        } catch (Throwable $e) {
        }
    }

    return historyTrunc2($bf);
}
?>