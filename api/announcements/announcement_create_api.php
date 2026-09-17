<?php
/**
 * 公告创建 API
 * 路径: api/announcements/announcement_create_api.php
 */
header('Content-Type: application/json');
require_once __DIR__ . '/../../includes/config.php';
require_once __DIR__ . '/../c168/c168_domain_access.php';
require_once __DIR__ . '/../includes/rich_text_sanitizer.php';
session_start();
session_write_close(); // 释放 session 锁，允许并发 AJAX 请求并行执行

function hasC168AnnouncementAccess(PDO $pdo): bool {
    $companyCode = strtoupper($_SESSION['company_code'] ?? '');
    if ($companyCode === 'C168') {
        return true;
    }
    $companyId = $_SESSION['company_id'] ?? null;
    if (!$companyId) {
        return false;
    }
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM company WHERE id = ? AND UPPER(company_id) = 'C168'");
    $stmt->execute([$companyId]);
    return $stmt->fetchColumn() > 0;
}

function insertAnnouncement(PDO $pdo, string $title, string $content, int $createdBy, string $userType): int {
    $sql = "INSERT INTO announcements (title, content, company_code, created_by, user_type, status)
            VALUES (?, ?, 'C168', ?, ?, 'active')";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$title, $content, $createdBy, $userType]);
    return (int) $pdo->lastInsertId();
}

function jsonResponse(bool $success, string $message, $data = null): void {
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ]);
}

try {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        jsonResponse(false, 'User not logged in', null);
        return;
    }

    $userRole = strtolower($_SESSION['role'] ?? '');
    if (!userHasC168AnnouncementPageAccess($userRole)) {
        http_response_code(403);
        jsonResponse(false, 'No permission to access this function', null);
        return;
    }

    if (!hasC168AnnouncementAccess($pdo)) {
        http_response_code(403);
        jsonResponse(false, 'No permission to access this function', null);
        return;
    }

    $title = trim($_POST['title'] ?? '');
    $content = sanitizeRichTextHtml((string)($_POST['content'] ?? ''));
    $contentPlain = richTextHtmlToPlainText($content);

    if ($title === '') {
        http_response_code(400);
        jsonResponse(false, 'Title cannot be empty', null);
        return;
    }
    if ($contentPlain === '') {
        http_response_code(400);
        jsonResponse(false, 'Content cannot be empty', null);
        return;
    }
    if (strlen($title) > 500) {
        http_response_code(400);
        jsonResponse(false, 'Title cannot exceed 500 characters', null);
        return;
    }

    $userType = $_SESSION['user_type'] ?? 'user';
    $createdBy = $_SESSION['user_id'];
    if ($userType === 'owner') {
        $createdBy = $_SESSION['owner_id'] ?? $createdBy;
    }

    $id = insertAnnouncement($pdo, $title, $content, $createdBy, $userType);
    $company_id = (int) ($_SESSION['company_id'] ?? 0);
    if ($company_id > 0) {
        require_once __DIR__ . '/../includes/realtime.php';
        realtime_publish_companies([$company_id], 'announcements', 'create');
    }
    jsonResponse(true, 'Announcement created successfully', ['id' => $id]);

} catch (PDOException $e) {
    error_log('Announcement create API DB error: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, 'Database error: ' . $e->getMessage(), null);
} catch (Exception $e) {
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
}