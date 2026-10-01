import { defineConfig } from "vite";

// The frontend deliberately calls the API on another origin (port 3001) so
// the browser applies CORS. `npm run dev:wrong-origin` uses port 5174, which
// the backend does NOT allow — use it to see a real CORS failure.
export default defineConfig({
  server: { port: 5173, strictPort: true },
});
