<?php
/**
 * 公告更新 API
 * 路径: api/announcements/announcement_update_api.php
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

function announcementExists(PDO $pdo, int $id): bool {
    $stmt = $pdo->prepare("SELECT id FROM announcements WHERE id = ? AND company_code = 'C168'");
    $stmt->execute([$id]);
    return $stmt->rowCount() > 0;
}

function updateAnnouncement(PDO $pdo, int $id, string $title, string $content): void {
    $stmt = $pdo->prepare("UPDATE announcements SET title = ?, content = ?, updated_at = NOW() WHERE id = ? AND company_code = 'C168'");
    $stmt->execute([$title, $content, $id]);
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

    $announcementId = isset($_POST['id']) ? (int) $_POST['id'] : 0;
    $title = trim($_POST['title'] ?? '');
    $content = sanitizeRichTextHtml((string)($_POST['content'] ?? ''));
    $contentPlain = richTextHtmlToPlainText($content);

    if ($announcementId <= 0) {
        http_response_code(400);
        jsonResponse(false, 'Announcement ID cannot be empty', null);
        return;
    }
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

    if (!announcementExists($pdo, $announcementId)) {
        http_response_code(404);
        jsonResponse(false, 'Announcement does not exist or you do not have permission to update it', null);
        return;
    }

    updateAnnouncement($pdo, $announcementId, $title, $content);
    $company_id = (int) ($_SESSION['company_id'] ?? 0);
    if ($company_id > 0) {
        require_once __DIR__ . '/../includes/realtime.php';
        realtime_publish_companies([$company_id], 'announcements', 'update');
    }
    jsonResponse(true, 'Announcement updated successfully', null);

} catch (PDOException $e) {
    error_log('Announcement update API DB error: ' . $e->getMessage());
    http_response_code(500);
    jsonResponse(false, 'Database error: ' . $e->getMessage(), null);
} catch (Exception $e) {
    http_response_code(400);
    jsonResponse(false, $e->getMessage(), null);
}