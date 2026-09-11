/** Maps English API `message` strings to localized text (login + secondary password). */
const AUTH_API_MESSAGES = {
  "Account ID, Company ID or password is incorrect": {
    en: "Account ID, Company ID or password is incorrect",
    zh: "账号 ID、公司 ID 或密码不正确",
  },
  "Username or password is incorrect": {
    en: "Username or password is incorrect",
    zh: "用户名或密码不正确",
  },
  "Please enter secondary password": {
    en: "Please enter secondary password",
    zh: "请输入二级密码",
  },
  "Secondary password must be exactly 6 digits": {
    en: "Secondary password must be exactly 6 digits",
    zh: "二级密码必须为 6 位数字",
  },
  "Secondary password is incorrect": {
    en: "Secondary password is incorrect",
    zh: "二级密码不正确",
  },
  "Company or Group has expired.": {
    en: "Company or Group has expired.",
    zh: "公司或集团已过期。",
  },
  "Please enter account ID": {
    en: "Please enter account ID",
    zh: "请输入账号 ID",
  },
  "Please enter username": {
    en: "Please enter username",
    zh: "请输入用户名",
  },
  "Invalid request": {
    en: "Invalid request",
    zh: "无效请求",
  },
  "Database connection failed": {
    en: "Database connection failed",
    zh: "数据库连接失败",
  },
  "Database error, please try again later": {
    en: "Database error, please try again later",
    zh: "数据库错误，请稍后重试",
  },
  "An error occurred. Please try again.": {
    en: "An error occurred. Please try again.",
    zh: "发生错误，请稍后重试。",
  },
  Unauthorized: {
    en: "Unauthorized",
    zh: "未授权，请重新登录",
  },
};

const LOGIN_ERROR_PREFIX = "An error occurred during login:";

export function localizeAuthApiMessage(message, lang = "en") {
  const normalizedLang = lang === "zh" ? "zh" : "en";
  const text = String(message || "").trim();
  if (!text) return "";

  const mapped = AUTH_API_MESSAGES[text];
  if (mapped) return mapped[normalizedLang] || text;

  if (text.startsWith(LOGIN_ERROR_PREFIX)) {
    const detail = text.slice(LOGIN_ERROR_PREFIX.length).trim();
    return normalizedLang === "zh"
      ? `登录时发生错误：${detail}`
      : text;
  }

  return text;
}

export const LOGIN_I18N = {
  en: {
    admin: "Admin",
    member: "Member",
    companyPlaceholder: "Company / Group ID",
    accountPlaceholder: "Account Id",
    usernamePlaceholder: "Username",
    passwordPlaceholder: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    rememberMe: "Remember me",
    forgotPassword: "Forget Password?",
    login: "Login",
    loggingIn: "Logging in...",
    notice: "Notice",
    loginFailed: "Login failed",
    loginError: "An error occurred during login",
    loginServerError: "Server error (HTTP {status}). Database may be misconfigured on the server.",
    loginInvalidResponse: "Server returned an invalid response. Check database config on EC2.",
    confirm: "Confirm",
    maintenanceLabel: "System Maintenance:",
    unknownError: "Unknown error",
    sessionExpired: "Your session has expired. Please login again.",
  },
  zh: {
    admin: "管理员",
    member: "会员",
    companyPlaceholder: "公司 / 集团 ID",
    accountPlaceholder: "账号 ID",
    usernamePlaceholder: "用户名",
    passwordPlaceholder: "密码",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    rememberMe: "记住我",
    forgotPassword: "忘记密码？",
    login: "登录",
    loggingIn: "登录中...",
    notice: "提示",
    loginFailed: "登录失败",
    loginError: "登录时发生错误",
    loginServerError: "服务器错误 (HTTP {status})。请检查 EC2 数据库配置是否已导入。",
    loginInvalidResponse: "服务器返回异常。请在 EC2 上检查 includes/config.local.php 与 MySQL。",
    confirm: "确认",
    maintenanceLabel: "系统维护中:",
    unknownError: "未知错误",
    sessionExpired: "登录已过期，请重新登录",
  },
};

export const RESET_PASSWORD_I18N = {
  en: {
    pageTitle: "Reset Password",
    companyPlaceholder: "Company / Group ID (or Owner Code)",
    emailPlaceholder: "Enter your email address",
    tacPlaceholder: "TAC",
    send: "SEND",
    sending: "Sending...",
    newPasswordPlaceholder: "New Password",
    confirmPasswordPlaceholder: "Confirm New Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    resetButton: "Reset Password",
    resetting: "Resetting...",
    backToLogin: "Back to Login",
    notice: "Notice",
    success: "Success",
    confirm: "Confirm",
    companyIdFirst: "Please enter Company ID first",
    emailFirst: "Please enter your email address first",
    invalidEmailFormat: "Please enter a valid email address",
    tacSent: "TAC code has been sent to your email",
    verifyCodeLine: "Your verification code:",
    tacFailed: "Failed to send TAC. Please try again.",
    networkError: "Network error. Please try again.",
    passwordsNoMatch: "Passwords do not match",
    enterTac: "Please enter the TAC code",
    companyEmailRequired: "Company ID and email are required",
    resetSuccess: "Password reset successful! Please sign in with your new password.",
    resetFailed: "Failed to reset password. Please try again.",
    switchLang: "Switch language",
  },
  zh: {
    pageTitle: "重置密码",
    companyPlaceholder: "公司 / 集团 ID（或业主代码）",
    emailPlaceholder: "请输入邮箱地址",
    tacPlaceholder: "验证码（TAC）",
    send: "发送",
    sending: "发送中...",
    newPasswordPlaceholder: "新密码",
    confirmPasswordPlaceholder: "确认新密码",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    resetButton: "重置密码",
    resetting: "提交中...",
    backToLogin: "返回登录",
    notice: "提示",
    success: "成功",
    confirm: "确认",
    companyIdFirst: "请先填写公司 / 集团 ID",
    emailFirst: "请先填写邮箱地址",
    invalidEmailFormat: "请输入有效的邮箱地址",
    tacSent: "验证码已发送至您的邮箱",
    verifyCodeLine: "您的验证码：",
    tacFailed: "验证码发送失败，请稍后重试。",
    networkError: "网络异常，请稍后重试。",
    passwordsNoMatch: "两次输入的密码不一致",
    enterTac: "请填写验证码（TAC）",
    companyEmailRequired: "请填写公司 ID 与邮箱",
    resetSuccess: "密码重置成功！请使用新密码登录。",
    resetFailed: "密码重置失败，请稍后重试。",
    switchLang: "切换语言",
  },
};

export const SECONDARY_VERIFY_I18N = {
  en: {
    title: "Secondary Password Verification",
    lead: "Please enter your 6-digit secondary password to continue",
    placeholder: "Enter 6-digit password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    verify: "Verify",
    verifying: "Verifying...",
    digitsSix: "Please enter exactly 6 digits",
    genericError: "An error occurred. Please try again.",
    switchLang: "Switch language",
    backToLogin: "Back to login",
  },
  zh: {
    title: "二级密码验证",
    lead: "请输入 6 位数字二级密码",
    placeholder: "请输入 6 位数字密码",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    verify: "验证",
    verifying: "验证中...",
    digitsSix: "请输入完整的 6 位数字",
    genericError: "发生错误，请稍后重试。",
    switchLang: "切换语言",
    backToLogin: "返回登录",
  },
};
