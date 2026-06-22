import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installBuildInfo } from "./game/buildInfo";
import "./styles.css";

installBuildInfo();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
