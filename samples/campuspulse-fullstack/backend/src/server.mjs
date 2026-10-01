// Entry point: node src/server.mjs  (PORT and CORS_ORIGINS are optional)
import { createApp } from "./app.mjs";
import { parseOrigins } from "./cors-options.mjs";

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = parseOrigins(process.env.CORS_ORIGINS);
const app = createApp({ allowedOrigins, log: (line) => console.log(line) });

app.listen(port, () => {
  console.log(`CampusPulse API on http://localhost:${port}/api`);
  console.log(`CORS allowlist: ${allowedOrigins.join(", ")}`);
});
