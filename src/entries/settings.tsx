import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsApp } from "../settings/SettingsApp";
import { mount } from "./mount";

mount(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
  createRoot,
);
