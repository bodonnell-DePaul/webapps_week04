// /api/incidents — one resource, every HTTP method the frontend uses.
import { Router } from "express";
import { randomUUID } from "node:crypto";

export const STATUSES = ["investigating", "monitoring", "resolved"];
export const SERVICES = ["printing", "wifi", "shuttle", "d2l"];

const SEED = [
  { title: "Synthetic printing delay",
    service: "printing", status: "investigating" },
  { title: "Synthetic Wi-Fi drops in the library",
    service: "wifi", status: "monitoring" },
  { title: "Synthetic shuttle tracker offline",
    service: "shuttle", status: "resolved" },
];

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const bad = (message) => new HttpError(400, "validation_failed", message);

function readTitle(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 3 || title.length > 120) {
    throw bad("title must be 3-120 characters");
  }
  return title;
}

function readService(body) {
  if (!SERVICES.includes(body.service)) {
    throw bad(`service must be one of: ${SERVICES.join(", ")}`);
  }
  return body.service;
}

function readStatus(body) {
  if (!STATUSES.includes(body.status)) {
    throw bad(`status must be one of: ${STATUSES.join(", ")}`);
  }
  return body.status;
}

function requireObject(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw bad("send a JSON object with Content-Type: application/json");
  }
  return body;
}

export function createStore(seed = SEED) {
  const rows = new Map();
  const now = () => new Date().toISOString();
  const insert = (fields) => {
    const incident = { id: randomUUID(), ...fields, updatedAt: now() };
    rows.set(incident.id, incident);
    return incident;
  };
  for (const fields of seed) insert(fields);
  return {
    list: () => [...rows.values()],
    get: (id) => rows.get(id),
    insert,
    update(id, fields) {
      const next = { ...rows.get(id), ...fields, id, updatedAt: now() };
      rows.set(id, next);
      return next;
    },
    remove: (id) => rows.delete(id),
  };
}

export function incidentsRouter(store = createStore()) {
  const router = Router();
  const find = (id) => {
    const incident = store.get(id);
    if (!incident) throw new HttpError(404, "not_found", `no incident ${id}`);
    return incident;
  };

  // GET /api/incidents?status=resolved&q=wifi — read a filtered collection
  router.get("/", async (req, res) => {
    const { status, q } = req.query;
    if (status !== undefined) readStatus({ status }); // 400 if unknown
    // ?delayMs= makes the request slow on purpose (timeout/cancel demo)
    const delayMs = Math.min(Number(req.query.delayMs) || 0, 5000);
    if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs));
    const needle = typeof q === "string" ? q.toLowerCase() : "";
    const items = store.list()
      .filter((row) => !status || row.status === status)
      .filter((row) => !needle || row.title.toLowerCase().includes(needle));
    res.json({ items, count: items.length });
  });

  // GET /api/incidents/:id — read one
  router.get("/:id", (req, res) => res.json(find(req.params.id)));

  // POST /api/incidents — create; 201 + Location header
  router.post("/", (req, res) => {
    const body = requireObject(req.body);
    const incident = store.insert({
      title: readTitle(body),
      service: readService(body),
      status: "investigating",
    });
    res.status(201).location(`/api/incidents/${incident.id}`).json(incident);
  });

  // PUT /api/incidents/:id — replace every editable field
  router.put("/:id", (req, res) => {
    find(req.params.id);
    const body = requireObject(req.body);
    res.json(store.update(req.params.id, {
      title: readTitle(body),
      service: readService(body),
      status: readStatus(body),
    }));
  });

  // PATCH /api/incidents/:id — change only the status
  router.patch("/:id", (req, res) => {
    find(req.params.id);
    const status = readStatus(requireObject(req.body));
    res.json(store.update(req.params.id, { status }));
  });

  // DELETE /api/incidents/:id — 204 No Content
  router.delete("/:id", (req, res) => {
    find(req.params.id);
    store.remove(req.params.id);
    res.status(204).end();
  });

  return router;
}
