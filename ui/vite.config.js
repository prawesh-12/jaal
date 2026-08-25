import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Loopback only. Nothing here should be reachable from the network.
  server: { host: "127.0.0.1", port: 5173 },
});
