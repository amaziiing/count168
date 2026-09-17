<?php
/**
 * Short-lived SSE ticket for app-wide realtime subscribe.
 * Path: api/realtime/ticket_api.php
 *
 * Query: same company/group scope params as transaction APIs
 * (company_id, view_group, group_id, group_aggregate, …).
 */

session_start();
session_write_close();

require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../api_response.php';
require_once __DIR__ . '/../transactions/transaction_scope.php';
require_once __DIR__ . '/../includes/realtime.php';
require_once __DIR__ . '/../c168/c168_domain_access.php';
require_once __DIR__ . '/../datacapture/data_capture_scope_common.php';

try {
    if (!isset($_SESSION['user_id'])) {
        api_error('请先登录', 401);
        exit;
    }

    if (!$pdo instanceof PDO) {
        api_error('Database connection failed', 503);
        exit;
    }

    $cfg = realtime_config();
    if (!$cfg['enabled']) {
        api_success(realtime_ticket_disabled_payload(), 'Realtime disabled');
        exit;
    }

    $scopeParams = $_GET;
    $viewGroupForAccess = dcNormalizeGroupId(
        $scopeParams['view_group'] ?? $scopeParams['group_id'] ?? ''
    );

    $listScope = tx_resolve_transaction_list_scope($pdo, $scopeParams);
    $permCompanyId = tx_permission_company_id_for_scope($pdo, $listScope);
    if ($permCompanyId <= 0 && ($listScope['mode'] ?? '') !== 'group') {
        throw new Exception('缺少公司或集团信息');
    }
    if ($permCompanyId > 0) {
        dcAssertUserCanAccessCompany(
            $pdo,
            $permCompanyId,
            $viewGroupForAccess !== '' ? $viewGroupForAccess : null
        );
    }

    $channels = realtime_channels_from_scope($listScope);
    if ($channels === []) {
        api_success(realtime_ticket_disabled_payload(), 'No realtime channels for scope');
        exit;
    }

    // Long-lived enough that EventSource blips can reconnect without minting a new
    // ticket every time; channel access is still HMAC-scoped (not a session cookie).
    $expiresAt = time() + 6 * 3600;
    $payload = [
        'exp' => $expiresAt,
        'channels' => $channels,
        'uid' => (int) ($_SESSION['user_id'] ?? 0),
        'ut' => (string) ($_SESSION['user_type'] ?? 'user'),
    ];
    $ticket = realtime_sign_ticket($payload, $cfg['secret']);

    api_success([
        'enabled' => true,
        'ticket' => $ticket,
        'channels' => $channels,
        'sse_path' => '/realtime/sse',
        'expires_at' => $expiresAt,
    ]);
} catch (InvalidArgumentException $e) {
    if (realtime_ticket_is_scope_access_error($e)) {
        api_success(realtime_ticket_disabled_payload(), $e->getMessage());
        exit;
    }
    api_error($e->getMessage(), 400);
} catch (Throwable $e) {
    error_log('realtime/ticket_api: ' . $e->getMessage());
    if (realtime_ticket_is_scope_access_error($e)) {
        api_success(realtime_ticket_disabled_payload(), $e->getMessage());
        exit;
    }
    api_error($e->getMessage() ?: 'Failed to issue realtime ticket', 500);
}
