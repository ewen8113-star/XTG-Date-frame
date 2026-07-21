import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./login.css";
import "./styles.css";
import "./readability.css";

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const account = window.sessionStorage.getItem("xtg-current-account") || "系统";
  const headers = new Headers(init.headers);
  headers.set("X-System-Account", encodeURIComponent(account));
  return nativeFetch(input, { ...init, headers });
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
