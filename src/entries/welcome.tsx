import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WelcomeApp } from "../welcome/WelcomeApp";
import { mount } from "./mount";

mount(
  <StrictMode>
    <WelcomeApp />
  </StrictMode>,
  createRoot,
);
