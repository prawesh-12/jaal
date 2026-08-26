import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
// Devanagari only, and only for one glyph. Neither Geist nor Inter carries the
// rupee sign, so every figure on this page was relying on whatever font the
// operating system happened to substitute.
import "@fontsource/mukta/devanagari-400.css";
import "@fontsource/mukta/devanagari-500.css";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
