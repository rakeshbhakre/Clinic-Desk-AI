import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(root, "certs", "localhost-key.pem");
const certPath = path.join(root, "certs", "localhost-cert.pem");

// Microphone/WebRTC only work in a secure context. localhost is secure by
// default, but a phone opening the LAN address needs HTTPS instead.
const https =
  existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    https,
    proxy: {
      "/api": "http://localhost:7860",
      "/start": "http://localhost:7860",
      "/sessions": "http://localhost:7860",
    },
  },
});
