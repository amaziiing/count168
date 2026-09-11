import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { applyLoginTheme, readLoginTheme } from "./lib/loginTheme.js";
import { applyChosenSiteRedirect } from "./lib/siteSwitch.js";
import "./styles/tokens.css";
import "./styles/page-body.css";
import "./styles/account-roles.css";
import "./styles/money.css";
import "./styles/filter-bar.css";
import "./styles/scope-breadcrumb.css";
import "./styles/bottom-sheet.css";
import "./styles/filter-sheet.css";
import "./styles/login.css";
import "./styles/password-field.css";
import "./index.css";

applyLoginTheme(readLoginTheme());
// 安卓壳固定在 count168.site 启动；用户选过其它站点时立刻跳回去（各域名数据各自独立）
applyChosenSiteRedirect();

const routerBasename = import.meta.env.PROD ? "/c168_mobile" : undefined;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);