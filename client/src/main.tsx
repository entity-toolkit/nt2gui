import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { adoptServerFromLink } from "./config";
import "./styles/index.css";

// A `?server=` link (printed by `nt2gui client`) points the UI at the API.
adoptServerFromLink();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Failed to find the root element");
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
