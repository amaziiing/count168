import test from "node:test";
import assert from "node:assert/strict";

import { sessionLostFromPayload } from "./sessionExpiryGuard.js";

test("current_user_api style: success:false + 'Not logged in'", () => {
  assert.equal(sessionLostFromPayload({ success: false, message: "Not logged in", data: null }), true);
});

test("session_check style: status:error + redirect:/login", () => {
  assert.equal(
    sessionLostFromPayload({ status: "error", message: "Session expired. Please login again.", redirect: "/login" }),
    true
  );
  assert.equal(sessionLostFromPayload({ status: "error", message: "Please login first.", redirect: "/login" }), true);
  assert.equal(sessionLostFromPayload({ status: "error", message: "Account is inactive.", redirect: "/login" }), true);
});

test("other endpoint styles: 401 bodies in English and Chinese", () => {
  assert.equal(sessionLostFromPayload({ success: false, message: "用户未登录", data: null }), true);
  assert.equal(sessionLostFromPayload({ success: false, message: "User not logged in", data: null }), true);
  assert.equal(sessionLostFromPayload({ success: false, error: "User not authenticated" }), true);
  assert.equal(sessionLostFromPayload({ success: false, message: "Unauthorized" }), true);
});

test("business errors are NOT session-lost", () => {
  assert.equal(sessionLostFromPayload({ success: false, message: "Secondary password is incorrect" }), false);
  assert.equal(sessionLostFromPayload({ success: false, message: "Login failed" }), false);
  assert.equal(sessionLostFromPayload({ success: false, message: "缺少公司信息", data: null }), false);
  assert.equal(sessionLostFromPayload({ success: false, error: "Database connection failed" }), false);
  assert.equal(sessionLostFromPayload({ success: true, message: "" }), false);
  assert.equal(sessionLostFromPayload(null), false);
  assert.equal(sessionLostFromPayload("error"), false);
});

test("status:error without login redirect is NOT session-lost", () => {
  assert.equal(sessionLostFromPayload({ status: "error", message: "Something else" }), false);
});
