import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { Live } from "./live/Live";
import "@fontsource-variable/geist";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {location.pathname === "/live" ? <Live /> : <App />}
    </BrowserRouter>
  </StrictMode>,
);
