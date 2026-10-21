import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AccessGate } from "./features/access/AccessGate";
import { initTheme } from "./theme";

// Before the first render, so a dark-mode user never gets a white flash.
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccessGate>
      <App />
    </AccessGate>
  </React.StrictMode>,
);
