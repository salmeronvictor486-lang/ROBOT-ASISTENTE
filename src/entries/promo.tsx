import { createRoot } from "react-dom/client";
import { Promo } from "../promo/Promo";
import { mount } from "./mount";

// Sin StrictMode: el anuncio se renderiza fotograma a fotograma y no queremos efectos dobles.
mount(<Promo />, createRoot);
