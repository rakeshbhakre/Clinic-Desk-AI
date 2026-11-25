import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/standard-italic.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles/tokens.css";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(<App />);
