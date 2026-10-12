import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/lilita-one/400.css";
import "@fontsource/silkscreen/400.css";
import "@fontsource-variable/rubik/index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/stage.css";
import "./styles/play.css";
import "./styles/screens.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
