<?php
/**
 * App-wide realtime invalidate bus (SSE hub: services/tx-realtime).
 *
 * Publish after successful writes. Clients refetch — never push full business rows.
 * Never throws to callers — business APIs must not fail because of realtime.
 */

if (!function_exists('realtime_ticket_disabled_payload')) {
    /**
     * Soft-disable payload for ticket APIs (HTTP 200, no Network red-X).
     *
     * @return array{enabled: bool, ticket: null, channels: array, sse_path: string, expires_at: null}
     */
    function realtime_ticket_disabled_payload(): array
    {
        return [
            'enabled' => false,
            'ticket' => null,
            'channels' => [],
            'sse_path' => '/realtime/sse',
            'expires_at' => null,
        ];
    }
}

if (!function_exists('realtime_ticket_is_scope_access_error')) {
    /** True when scope/permission denial should soft-disable SSE instead of HTTP 5xx. */
    function realtime_ticket_is_scope_access_error(Throwable $e): bool
    {
        $msg = $e->getMessage();
        if ($msg === '') {
            return false;
        }
        return (bool) preg_match(
            '/无权|无权限|缺少公司|缺少 group|缺少 company|无效的 group|无效的 company|Group Ledger|No permission|用户未登录/iu',
            $msg
        );
    }
}

if (!function_exists('realtime_config')) {
    /**
     * @return array{enabled: bool, publish_url: string, secret: string}
     */
    function realtime_config(): array
    {
        global $tx_realtime_publish_url, $tx_realtime_secret, $tx_realtime_enabled;

        $secret = trim((string) ($tx_realtime_secret ?? ''));
        $url = trim((string) ($tx_realtime_publish_url ?? 'http://127.0.0.1:3911/publish'));
        $explicit = $tx_realtime_enabled ?? null;
        $enabled = $explicit === null ? ($secret !== '' && $url !== '') : (bool) $explicit;

        return [
            'enabled' => $enabled && $secret !== '' && $url !== '',
            'publish_url' => $url,
            'secret' => $secret,
        ];
    }
}

if (!function_exists('realtime_channels_from_scope')) {
    /**
     * Channel ids shared with the Node hub (company / group).
     *
     * @param array{mode?: string, company_id?: int, group_scope_id?: int} $listScope
     * @return string[]
     */
    function realtime_channels_from_scope(array $listScope): array
    {
        $channels = [];
        if (($listScope['mode'] ?? '') === 'group') {
            $gid = (int) ($listScope['group_scope_id'] ?? 0);
            if ($gid > 0) {
                $channels[] = 'tx:g:' . $gid;
            }
        }
        $cid = (int) ($listScope['company_id'] ?? 0);
        if ($cid > 0) {
            $channels[] = 'tx:c:' . $cid;
        }

        return array_values(array_unique($channels));
    }
}

if (!function_exists('realtime_channels_from_company_ids')) {
    /**
     * @param int[]|string[] $companyIds
     * @return string[]
     */
    function realtime_channels_from_company_ids(array $companyIds): array
    {
        $channels = [];
        foreach ($companyIds as $id) {
            $cid = (int) $id;
            if ($cid > 0) {
                $channels[] = 'tx:c:' . $cid;
            }
        }

        return array_values(array_unique($channels));
    }
}

if (!function_exists('realtime_sign_ticket')) {
    /**
     * @param array<string, mixed> $payload
     */
    function realtime_sign_ticket(array $payload, string $secret): string
    {
        $body = rtrim(strtr(base64_encode(json_encode($payload, JSON_UNESCAPED_UNICODE)), '+/', '-_'), '=');
        $sig = rtrim(strtr(base64_encode(hash_hmac('sha256', $body, $secret, true)), '+/', '-_'), '=');

        return $body . '.' . $sig;
    }
}

if (!function_exists('realtime_normalize_domain')) {
    function realtime_normalize_domain(string $domain): string
    {
        $d = strtolower(trim($domain));
        if ($d === '') {
            return 'app';
        }
        // Keep channel-safe token
        $d = preg_replace('/[^a-z0-9_-]/', '', $d) ?? 'app';

        return $d !== '' ? $d : 'app';
    }
}

if (!function_exists('dashboard_subsidiary_capture_cache_clear')) {
    /**
     * Clears dashboard_api.php's APCu per-subsidiary capture cache (prefix 'dash_cap_v1:').
     * Called from realtime_publish() below for ledger/ownership writes — every dashboard
     * number derived from transactions or equity % becomes stale the moment either changes.
     * Also clears the full-response cache (prefix 'dash_main_v1:') so KPI/full/chart
     * answers do not serve stale figures after a write.
     * Defined here (not in dashboard_api.php) because dashboard_api.php runs top-level
     * request bootstrap on require — it must never be included from another endpoint.
     */
    function dashboard_subsidiary_capture_cache_clear(): void
    {
        if (!class_exists('APCUIterator') || !function_exists('apcu_delete')) {
            return;
        }
        try {
            apcu_delete(new APCUIterator('/^dash_cap_v1:/'));
            apcu_delete(new APCUIterator('/^dash_main_v1:/'));
        } catch (\Throwable $e) {
            // Best-effort — a cache-clear failure must never break the write request.
        }
    }
}

if (!function_exists('dashboard_main_cache_clear')) {
    /**
     * Clears dashboard_api.php's full-response APCu cache (prefix 'dash_main_v1:').
     * Called from realtime_publish() for account / process / user permission writes —
     * the dashboard's account whitelist (filterAccountsByPermissions) is derived from
     * user_company_permissions, so any of those changes must not serve a stale
     * full-response cache. Also invoked from dashboard_subsidiary_capture_cache_clear()
     * on ledger/ownership writes (numeric staleness).
     */
    function dashboard_main_cache_clear(): void
    {
        if (!class_exists('APCUIterator') || !function_exists('apcu_delete')) {
            return;
        }
        try {
            apcu_delete(new APCUIterator('/^dash_main_v1:/'));
        } catch (\Throwable $e) {
            // Best-effort — a cache-clear failure must never break the write request.
        }
    }
}

if (!function_exists('realtime_publish')) {
    /**
     * @param string[] $channels
     * @param array<string, mixed> $extra
     */
    function realtime_publish(
        array $channels,
        string $domain,
        string $source = 'unknown',
        array $extra = [],
        string $type = 'domain_changed'
    ): void {
        // Dashboard cache invalidation runs regardless of the realtime broadcast toggle
        // below — unrelated concerns that happen to share this chokepoint.
        // Numeric dashboard data (transactions / equity) is invalidated on ledger +
        // ownership writes; account / process / user permission changes also affect
        // what a viewer may see on the dashboard (filterAccountsByPermissions), so
        // they invalidate the full-response cache too — never serve a whitelist that
        // is no longer current.
        $invalidateDomain = strtolower(trim($domain));
        if ($invalidateDomain === 'ledger' || $invalidateDomain === 'ownership') {
            dashboard_subsidiary_capture_cache_clear();
        } elseif (
            $invalidateDomain === 'accounts'
            || $invalidateDomain === 'processes'
            || $invalidateDomain === 'users'
        ) {
            dashboard_main_cache_clear();
        }

        $channels = array_values(array_filter(array_map(static function ($c) {
            return trim((string) $c);
        }, $channels)));
        if ($channels === []) {
            return;
        }

        $cfg = realtime_config();
        if (!$cfg['enabled']) {
            return;
        }

        $domain = realtime_normalize_domain($domain);
        $type = trim($type) !== '' ? trim($type) : 'domain_changed';
        // Ledger keeps legacy event name for older clients.
        if ($domain === 'ledger' && $type === 'domain_changed') {
            $type = 'ledger_changed';
        }

        $payload = array_merge([
            'type' => $type,
            'domain' => $domain,
            'source' => $source,
            'channels' => $channels,
            'rev' => (string) (int) round(microtime(true) * 1000),
            'ts' => time(),
        ], $extra);

        $body = json_encode($payload, JSON_UNESCAPED_UNICODE);
        if ($body === false) {
            return;
        }

        $url = $cfg['publish_url'];
        $secret = $cfg['secret'];

        try {
            if (function_exists('curl_init')) {
                $ch = curl_init($url);
                if ($ch === false) {
                    return;
                }
                $ok = false;
                $transient = [CURLE_COULDNT_RESOLVE_HOST, CURLE_COULDNT_CONNECT, CURLE_OPERATION_TIMEDOUT, CURLE_GOT_NOTHING, CURLE_SEND_ERROR, CURLE_RECV_ERROR];
                for ($attempt = 0; $attempt < 2; $attempt++) {
                    curl_setopt_array($ch, [
                        CURLOPT_POST => true,
                        CURLOPT_HTTPHEADER => [
                            'Content-Type: application/json',
                            'X-Realtime-Secret: ' . $secret,
                        ],
                        CURLOPT_POSTFIELDS => $body,
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_CONNECTTIMEOUT_MS => 400,
                        CURLOPT_TIMEOUT_MS => 1000,
                    ]);
                    curl_exec($ch);
                    $errno = curl_errno($ch);
                    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    if ($errno === 0 && $code >= 200 && $code < 300) {
                        $ok = true;
                        break;
                    }
                    // 401/403 等不会因重试好转；只对超时/连不上再打一次
                    if ($attempt === 0 && !in_array($errno, $transient, true)) {
                        break;
                    }
                }
                if (!$ok) {
                    error_log('realtime_publish failed: errno=' . curl_errno($ch) . ' http=' . (int) curl_getinfo($ch, CURLINFO_HTTP_CODE));
                }
                curl_close($ch);
                return;
            }

            $context = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Content-Type: application/json\r\nX-Realtime-Secret: {$secret}\r\n",
                    'content' => $body,
                    'timeout' => 1,
                    'ignore_errors' => true,
                ],
            ]);
            @file_get_contents($url, false, $context);
        } catch (Throwable $e) {
            error_log('realtime_publish: ' . $e->getMessage());
        }
    }
}

if (!function_exists('realtime_publish_scope')) {
    /**
     * @param array{mode?: string, company_id?: int, group_scope_id?: int} $listScope
     * @param array<string, mixed> $extra
     */
    function realtime_publish_scope(
        array $listScope,
        string $domain,
        string $source = 'unknown',
        array $extra = []
    ): void {
        realtime_publish(
            realtime_channels_from_scope($listScope),
            $domain,
            $source,
            $extra
        );
    }
}

if (!function_exists('realtime_publish_companies')) {
    /**
     * @param int[]|string[] $companyIds
     * @param array<string, mixed> $extra
     */
    function realtime_publish_companies(
        array $companyIds,
        string $domain,
        string $source = 'unknown',
        array $extra = []
    ): void {
        realtime_publish(
            realtime_channels_from_company_ids($companyIds),
            $domain,
            $source,
            $extra
        );
    }
}
