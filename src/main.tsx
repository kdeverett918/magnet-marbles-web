import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installBuildInfo } from "./game/buildInfo";
import { registerServiceWorker } from "./game/serviceWorker";
import { ErrorBoundary } from "./game/ui/ErrorBoundary";
import "./styles.css";

installBuildInfo();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
