import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PetApp } from "../pet/PetApp";
import { mount } from "./mount";

mount(
  <StrictMode>
    <PetApp />
  </StrictMode>,
  createRoot,
);
