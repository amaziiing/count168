import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { applyLoginTheme, readLoginTheme } from "./lib/loginTheme.js";
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

const routerBasename = import.meta.env.PROD ? "/c168_mobile" : undefined;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);