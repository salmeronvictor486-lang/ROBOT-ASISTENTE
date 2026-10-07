import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IslandApp } from "../island/IslandApp";
import { mount } from "./mount";

mount(
  <StrictMode>
    <IslandApp />
  </StrictMode>,
  createRoot,
);
