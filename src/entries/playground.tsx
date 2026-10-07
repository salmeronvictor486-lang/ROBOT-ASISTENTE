import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Playground } from "../robot/Playground";
import { mount } from "./mount";

mount(
  <StrictMode>
    <Playground />
  </StrictMode>,
  createRoot,
);
