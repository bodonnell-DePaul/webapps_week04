// Assemble the API. Order matters: request id, CORS, parsers, routes, then errors.
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { corsOptions, DEFAULT_ORIGINS } from "./cors-options.mjs";
import { HttpError, createStore, incidentsRouter } from "./incidents.mjs";

export function createApp({
  allowedOrigins = DEFAULT_ORIGINS,
  store = createStore(),
  log = () => {},
} = {}) {
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {                 // first, so EVERY response gets an id
    const id = req.get("X-Request-Id") || randomUUID();
    res.set("X-Request-Id", id);
    res.on("finish", () =>
      log(`${req.method} ${req.originalUrl} ${res.statusCode} ${id}`));
    next();
  });

  app.use(cors(corsOptions(allowedOrigins)));  // answers allowed preflights
  // A refused preflight falls through to here: 204 with no CORS headers.
  app.options("/{*any}", (req, res) => res.status(204).end());
  app.use(express.json({ limit: "16kb" }));     // JSON body -> req.body

  app.get("/api/healthz", (req, res) => res.json({ ok: true }));
  app.use("/api/incidents", incidentsRouter(store));

  app.use((req, res) => {                       // unknown route: JSON 404
    const message = `${req.method} ${req.path}`;
    res.status(404).json({ error: { code: "not_found", message } });
  });

  // Every error becomes the same JSON shape the frontend knows how to read.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err instanceof HttpError ? err.status : err.status ?? 500;
    const code = err instanceof HttpError ? err.code
      : err.type === "entity.parse.failed" ? "invalid_json"
      : err.type === "entity.too.large" ? "too_large"
      : "internal_error";
    const message = status >= 500 ? "unexpected server error" : err.message;
    if (status >= 500) log(`ERROR ${err.stack ?? err}`);
    res.status(status).json({ error: { code, message } });
  });

  return app;
}
