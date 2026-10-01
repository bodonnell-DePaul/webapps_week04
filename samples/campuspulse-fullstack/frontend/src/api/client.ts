// One configured axios instance for the whole app (Week 4 Block B).
import axios, { AxiosError } from "axios";

export const API_URL = import.meta.env?.VITE_API_URL ?? "http://localhost:3001/api";

export const api = axios.create({
  baseURL: API_URL,     // every call is relative to this
  timeout: 4000,        // fail fast instead of spinning forever
  headers: { Accept: "application/json" },
});

/** The single error type every component handles. */
export class ApiError extends Error {
  constructor(
    public kind: "http" | "network" | "timeout" | "canceled",
    message: string,
    public status?: number,
    public code?: string,
    public requestId?: string,   // from the X-Request-Id response header
  ) {
    super(message);
  }
}

// Our backend always sends errors as { error: { code, message } } (Block C).
type ErrorBody = { error?: { code?: string; message?: string } };

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;  // already normalized
  if (axios.isCancel(error))
    return new ApiError("canceled", "Request canceled");
  if (!(error instanceof AxiosError))
    return new ApiError("network", String(error));
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
    return new ApiError("timeout", `No answer in ${api.defaults.timeout} ms`);
  if (error.response) {                         // server answered 4xx/5xx
    const body = error.response.data as ErrorBody;
    return new ApiError("http", body?.error?.message ?? error.message,
                        error.response.status, body?.error?.code,
                        error.response.headers?.["x-request-id"]);
  }
  return new ApiError("network",                // down, DNS, TLS, or CORS
    "Network error — is the API running and is this origin allowed (CORS)?");
}

export type Activity = { id: string; method: string; url: string; status: number | string; ms: number };
const listeners = new Set<(entry: Activity) => void>();
const started = new Map<string, number>();

/** Subscribe to a log of every request — the "Network tab" inside the app. */
export function onActivity(listener: (entry: Activity) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function report(id: string, method = "get", url = "", status: number | string) {
  const ms = Math.round(performance.now() - (started.get(id) ?? performance.now()));
  started.delete(id);
  for (const listener of listeners) listener({ id, method: method.toUpperCase(), url, status, ms });
}

// Request interceptor: runs before EVERY request leaves the browser.
api.interceptors.request.use((config) => {
  const id = crypto.randomUUID();
  config.headers.set("X-Request-Id", id); // custom header ⇒ CORS preflight
  started.set(id, performance.now());
  return config;
});

// Response interceptor: pass successes through, normalize every failure.
api.interceptors.response.use(
  (response) => {
    const id = String(response.config.headers.get("X-Request-Id"));
    report(id, response.config.method, response.config.url, response.status);
    return response;
  },
  (error) => {
    const apiError = toApiError(error);
    const config = error instanceof AxiosError ? error.config : undefined;
    if (config) {
      report(String(config.headers.get("X-Request-Id")), config.method, config.url,
        apiError.status ?? apiError.kind);
    }
    return Promise.reject(apiError);
  },
);
