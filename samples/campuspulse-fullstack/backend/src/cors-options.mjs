// CORS policy for the CampusPulse API (Week 4 Block C).
// CORS is enforced by the BROWSER: this server only says which origins may
// read its responses. curl, Postman and other servers ignore these headers.

export const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function parseOrigins(value) {
  if (!value) return DEFAULT_ORIGINS;
  return value.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function corsOptions(allowedOrigins = DEFAULT_ORIGINS) {
  const allowed = new Set(allowedOrigins);
  return {
    // Exact allowlist. Never reflect any origin while sending credentials.
    origin(origin, done) {
      // No Origin header: same-origin, curl, health checks. Let it through.
      if (!origin) return done(null, true);
      done(null, allowed.has(origin)); // false = no CORS headers at all
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-Request-Id"],
    exposedHeaders: ["Location", "X-Request-Id"], // readable by axios
    maxAge: 600, // the browser may cache a preflight answer for 10 minutes
  };
}
