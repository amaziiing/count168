<?php
/**
 * Formula Maintenance List API - 返回 data_capture_templates 作为公式维护数据源
 * 路径: api/formula_maintenance/list_api.php
 */

session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/formula_fields_helper.php';
require_once __DIR__ . '/formula_maintenance_scope.php';

function jsonResponse($success, $message, $data = null, $httpCode = null) {
    if ($httpCode !== null) {
        http_response_code($httpCode);
    }
    echo json_encode([
        'success' => (bool) $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * 从请求（GET/POST）中解析并验证 company_id
 */
function getCompanyIdForRequest(PDO $pdo) {
    $params = $_GET;
    if (isset($_POST['company_id'])) {
        $params['company_id'] = $_POST['company_id'];
    }
    $scope = formulaMaintenanceResolveRequestScope($pdo, $params);

    return (int) $scope['company_id'];
}

/**
 * 获取公式列表（含搜索、process 筛选），返回原始行
 * 直接 JOIN process 表，避免 GROUP BY 导致同一 process 代码下多条 process 行时只匹配 MIN(id)、
 * 其余模板在 Maintenance 不显示却在 Data Capture Summary 仍显示的问题。
 */
function fetchFormulaListRaw(
    PDO $pdo,
    array $scopeCtx,
    string $search,
    ?int $processIdFilter,
    string $scopeProcessSql = '',
    bool $isGroupScope = false
) {
    $companyId = (int) ($scopeCtx['company_id'] ?? 0);
    $ledger = formulaMaintenanceBuildTemplateLedgerFilter($pdo, $scopeCtx);
    $sql = "SELECT 
                dct.id,
                dct.process_id,
                dct.id_product,
                dct.product_type,
                dct.parent_id_product,
                dct.account_id,
                dct.account_display,
                dct.currency_id,
                dct.currency_display,
                dct.columns_display,
                dct.source_columns,
                dct.input_method,
                dct.formula_display,
                dct.formula_operators,
                dct.source_percent,
                dct.enable_source_percent,
                dct.last_source_value,
                dct.description,
                COALESCE(p.process_id, dct.process_id) AS process_code,
                p.description_id,
                d.name AS description_name,
                " . formulaMaintenanceSqlProcessOnGroupEntityFlag('p') . " AS process_on_group_entity,
                a.account_id AS account_code,
                a.name AS account_name,
                c.code AS currency_code
            FROM data_capture_templates dct
            " . formulaMaintenanceSqlTemplateProcessJoin($pdo, $companyId, $isGroupScope) . "
            LEFT JOIN description d ON p.description_id = d.id
            LEFT JOIN account a ON dct.account_id = a.id
            LEFT JOIN currency c ON dct.currency_id = c.id
            WHERE 1=1 {$ledger['sql']}";
    $params = $ledger['params'];
    if ($scopeProcessSql !== '') {
        $sql .= $scopeProcessSql;
    }
    $sql .= formulaMaintenanceSqlTemplateProcessFilter($pdo, $companyId, $processIdFilter, $isGroupScope);
    if ($search !== '') {
        $like = '%' . $search . '%';
        $sql .= " AND (
            dct.description LIKE ?
            OR dct.formula_display LIKE ?
            OR dct.columns_display LIKE ?
            OR dct.source_columns LIKE ?
            OR dct.id_product LIKE ?
            OR COALESCE(a.account_id, dct.account_display) LIKE ?
            OR a.name LIKE ?
            OR d.name LIKE ?
            OR p.process_id LIKE ?
        )";
        $params = array_merge($params, [$like, $like, $like, $like, $like, $like, $like, $like, $like]);
    }
    $sql .= " ORDER BY p.process_id ASC, dct.id ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * 将原始行转换为前端需要的格式（no, process, account, source, formula 等）
 */
function mapRowsToDisplay(array $rows, bool $isGroupScope = false) {
    // 以「界面上能看到的字段」为维度去重，
    // 确保同一 Process 下，Maintenance - Formula 的可见行数与 Data Summary 一致，
    // 但不影响底层 data_capture_templates 中的所有记录（仅列表展示去重）。
    $displayRowsByKey = [];
    foreach ($rows as $row) {
        $sourceRef = $row['columns_display'] ?? $row['source_columns'] ?? '';
        // Source / Formula：与 shared/formula resolveTemplateFormulaBaseAndPercent 一致
        list($resolvedBase, $resolvedSource, $resolvedEnable) = resolveTemplateFormulaBaseAndPercent($row);
        $sourceDisplay = formatSourcePercentForMaintenanceList($resolvedSource);
        // Raw (un-evaluated) source, e.g. "0.1/2" — used only to re-populate the Edit
        // form so re-saving without touching Source doesn't bake in the evaluated number.
        $sourceRaw = (string) $resolvedSource;
        $formulaDisplayParen = buildFormulaDisplayParenFromParts($resolvedBase, $resolvedSource, $resolvedEnable);
        $formulaEdit = buildFormulaEditFromRow($row);
        $processCode = $row['process_code'] ?? '';
        $descriptionName = $row['description_name'] ?? '';
        $processOnGroupEntity = !empty($row['process_on_group_entity']);
        $processDisplay = formulaMaintenanceFormatProcessDisplay(
            $processCode,
            $descriptionName,
            $processOnGroupEntity,
            $isGroupScope
        );
        $accountDisplay = $row['account_code'] ?? ($row['account_display'] ?? '');
        $currencyDisplay = $row['currency_code'] ?? ($row['currency_display'] ?? '');
        $product = $row['id_product'] ?? '';
        $inputMethod = $row['input_method'] ?? '';
        $description = $row['description'] ?? '';
        $productType = $row['product_type'] ?? 'main';
        // description 必须参与去重 key：主产品与「红股%」等子说明共用同一 id_product、同 account 时，
        // 若省略则会被合并为一条，导致 Maintenance 行数少于 Data Capture Summary（例如少显示第 4 行）。
        $descriptionKey = strtolower(trim((string) $description));

        // 同一「Process + Account + Currency + Product + 类型 + 说明 + 公式 base」视为同一条，
        // 只保留评分最高 / id 最大的一条。加入 formulaBase 避免不同公式被合并导致数据丢失。
        $formulaBaseKey = strtolower(trim((string)$resolvedBase));
        $keyParts = [
            strtolower(trim((string)$processDisplay)),
            strtolower(trim((string)$accountDisplay)),
            strtolower(trim((string)$currencyDisplay)),
            strtolower(trim((string)$product)),
            $productType,
            $descriptionKey,
            $formulaBaseKey,
        ];
        $dedupKey = implode('|', $keyParts);

        $currentId = isset($row['id']) ? (int)$row['id'] : 0;
        $currentScore = scoreTemplateRowForMaintenanceDedup($row);
        $entry = [
            'id' => $currentId,
            'process' => $processDisplay,
            'account' => $accountDisplay,
            'account_id' => $row['account_id'],
            'account_name' => $row['account_name'] ?? '',
            'currency' => $currencyDisplay,
            'source' => $sourceDisplay,
            'source_raw' => $sourceRaw,
            'source_ref' => is_string($sourceRef) ? trim($sourceRef) : trim((string) $sourceRef),
            'product' => $product,
            'input_method' => $inputMethod,
            'formula' => $formulaDisplayParen,
            'formula_edit' => $formulaEdit,
            'description' => $description,
            'product_type' => $productType,
            '_score' => $currentScore,
        ];

        if (!isset($displayRowsByKey[$dedupKey])) {
            $displayRowsByKey[$dedupKey] = ['entry' => $entry, 'raw' => $row];
        } else {
            $existingScore = (int)($displayRowsByKey[$dedupKey]['entry']['_score'] ?? 0);
            $existingId = (int)$displayRowsByKey[$dedupKey]['entry']['id'];
            $shouldReplace = $currentScore > $existingScore
                || ($currentScore === $existingScore && $currentId > $existingId);
            if ($shouldReplace) {
                $displayRowsByKey[$dedupKey] = ['entry' => $entry, 'raw' => $row];
            }
        }
    }

    $data = [];
    foreach ($displayRowsByKey as $item) {
        $entry = $item['entry'];
        unset($entry['_score']);
        $data[] = $entry;
    }

    $no = 1;
    foreach ($data as $idx => $row) {
        $data[$idx]['no'] = $no++;
        $data[$idx]['id'] = (int)$row['id'];
    }
    return $data;
}

try {
    if (!isset($_SESSION['user_id'])) {
        throw new Exception('用户未登录');
    }
    $scopeParams = array_merge($_GET, $_POST);
    $scopeCtx = formulaMaintenanceResolveRequestScope($pdo, $scopeParams);
    $companyId = (int) $scopeCtx['company_id'];
    $formula_scope_group = (bool) $scopeCtx['is_group_scope'];
    $scopeProcessSql = (string) $scopeCtx['scope_process_sql'];

    if ($formula_scope_group) {
        $groupPk = (int) ($scopeCtx['group_scope_id'] ?? $scopeCtx['scope_id'] ?? 0);
        // Dual-tenant pure Group: company_id may be 0; ledger uses scope_id.
        if ($companyId <= 0 && (empty($scopeCtx['dual_tenant']) || $groupPk <= 0)) {
            jsonResponse(true, 'success', ['list' => [], 'total' => 0]);
            exit;
        }
    } elseif ($companyId > 0 && dcCompanyIdIsGroupEntity($pdo, $companyId)) {
        jsonResponse(true, 'success', ['list' => [], 'total' => 0]);
        exit;
    }

    $category = trim($_GET['category'] ?? $_GET['permission'] ?? '');
    $catUpper = $category !== '' ? strtoupper($category) : '';
    if (in_array($catUpper, ['LOAN', 'RATE', 'MONEY'], true)) {
        jsonResponse(true, 'success', ['list' => [], 'total' => 0]);
        exit;
    }

    $search = isset($_GET['search']) ? trim((string)$_GET['search']) : '';
    if ($search === '' && isset($_POST['search'])) {
        $search = trim((string)$_POST['search']);
    }
    $processParam = isset($_GET['process']) ? trim((string) $_GET['process']) : '';
    if ($processParam === '' && isset($_POST['process'])) {
        $processParam = trim((string) $_POST['process']);
    }
    $processResolved = formulaMaintenanceResolveProcessFilter(
        $pdo,
        $processParam,
        $companyId,
        $formula_scope_group
    );
    $processIdFilter = $processResolved['process_id'];
    if ($processParam !== '' && $processIdFilter === null && $processResolved['legacy_code'] !== null) {
        jsonResponse(true, 'success', ['list' => [], 'total' => 0]);
        exit;
    }
    $rows = fetchFormulaListRaw($pdo, $scopeCtx, $search, $processIdFilter, $scopeProcessSql, $formula_scope_group);
    $list = mapRowsToDisplay($rows, $formula_scope_group);
    jsonResponse(true, 'success', ['list' => $list, 'total' => count($list)]);
} catch (PDOException $e) {
    jsonResponse(false, '数据库错误: ' . $e->getMessage(), null, 500);
} catch (Exception $e) {
    jsonResponse(false, $e->getMessage(), null, 400);
}