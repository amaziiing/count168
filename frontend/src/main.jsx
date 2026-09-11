import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { installSessionExpiryGuard } from "./utils/auth/sessionExpiryGuard.js";
/* 1) Tailwind  2) tokens + dashboard — app-shell.css  3) login width lock (must be last) */
import "./index.css";
import "./styles/app-shell.css";
import "./styles/maintenanceToolbarUnified.css";
import "./styles/login-surface-lock.css";
import "./styles/login-auth-fields.css";
import "./styles/password-field.css";
import "./styles/sidebar-shell-overrides.css";
import "./styles/sidebar-scroll.css";
import "../public/css/modal-close-unified.css";
import "../public/css/confirm-delete-unified.css";
import "../public/css/select-unified.css";

// Kick to the login page as soon as any API response says the session is gone,
// instead of leaving the user stuck on the page with a "not logged in" toast.
installSessionExpiryGuard();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
