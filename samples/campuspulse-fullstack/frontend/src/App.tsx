import { useEffect, useRef, useState, type FormEvent } from "react";
import { API_URL, ApiError, onActivity, toApiError, type Activity } from "./api/client.ts";
import {
  SERVICES, STATUSES, checkHealth, createIncident, deleteIncident, listIncidents,
  replaceIncident, updateStatus, type Incident, type Service, type Status,
} from "./api/incidents.ts";

const describe = (error: ApiError) =>
  error.status
    ? `${error.status} ${error.code ?? ""}: ${error.message}${error.requestId ? ` (request ${error.requestId})` : ""}`
    : `${error.kind}: ${error.message}`;

export function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [status, setStatus] = useState<Status | "">("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [reload, setReload] = useState(0);

  // GET on mount and whenever a filter changes. The cleanup aborts the
  // previous request so a slow, stale answer can never overwrite a newer one.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listIncidents({ status: status || undefined, q: q || undefined }, controller.signal)
      .then((items) => { setIncidents(items); setError(""); })
      .catch((err: ApiError) => {
        if (err.kind !== "canceled") setError(describe(err));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, q, reload]);

  useEffect(() => {
    checkHealth().then(setHealthy).catch(() => setHealthy(false));
  }, []);

  // Wrap every mutation the same way: run it, then refresh or show the error.
  // Returns false on failure so a form can keep the user's input.
  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
      setReload((n) => n + 1);
      return true;
    } catch (err) {
      setError(describe(toApiError(err)));
      return false;
    }
  }

  return (
    <main>
      <header>
        <h1>CampusPulse incidents</h1>
        <p className="api">
          API <code>{API_URL}</code>{" "}
          <span className={`badge ${healthy ? "ok" : healthy === false ? "down" : ""}`} role="status">
            {healthy === null ? "checking…" : healthy ? "healthy" : "unreachable"}
          </span>
        </p>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <CreateForm onCreate={(input) => run(() => createIncident(input))} />

      <section aria-labelledby="list-heading">
        <div className="toolbar">
          <h2 id="list-heading">Incidents {loading && <small>loading…</small>}</h2>
          <label>Status{" "}
            <select value={status} onChange={(e) => setStatus(e.target.value as Status | "")}>
              <option value="">all</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Search <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="title contains…" /></label>
        </div>
        <ul className="incidents">
          {incidents.map((incident) => (
            <IncidentRow key={incident.id} incident={incident}
              onStatus={(next) => run(() => updateStatus(incident.id, next))}
              onRename={(title) => run(() => replaceIncident({ ...incident, title }))}
              onDelete={() => run(() => deleteIncident(incident.id))} />
          ))}
          {!loading && incidents.length === 0 && <li className="empty">No incidents match.</li>}
        </ul>
      </section>

      <SlowRequestDemo />
      <ActivityLog />
    </main>
  );
}

function CreateForm({ onCreate }: { onCreate: (input: { title: string; service: Service }) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [service, setService] = useState<Service>("wifi");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onCreate({ title, service })) setTitle("");
  }
  return (
    <form className="create" onSubmit={submit}>
      <h2>Report an incident <small>POST</small></h2>
      <input aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is broken?" />
      <select aria-label="Service" value={service} onChange={(e) => setService(e.target.value as Service)}>
        {SERVICES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <button type="submit">Create</button>
    </form>
  );
}

type RowProps = {
  incident: Incident;
  onStatus: (status: Status) => void;
  onRename: (title: string) => Promise<boolean>;
  onDelete: () => void;
};

function IncidentRow({ incident, onStatus, onRename, onDelete }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(incident.title);
  return (
    <li className={`incident ${incident.status}`}>
      {editing ? (
        <form className="rename" onSubmit={async (e) => {
          e.preventDefault();
          if (await onRename(title)) setEditing(false);
        }}>
          <input aria-label="New title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <button type="submit">Save <small>PUT</small></button>
          <button type="button" onClick={() => { setTitle(incident.title); setEditing(false); }}>Cancel</button>
        </form>
      ) : (
        <span className="title">{incident.title} <em>{incident.service}</em></span>
      )}
      <label className="sr-only" htmlFor={`status-${incident.id}`}>Status for {incident.title}</label>
      <select id={`status-${incident.id}`} value={incident.status}
        onChange={(e) => onStatus(e.target.value as Status)} title="PATCH">
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      {!editing && <button onClick={() => setEditing(true)}>Rename <small>PUT</small></button>}
      <button className="danger" onClick={onDelete} aria-label={`Delete ${incident.title}`}>
        Delete <small>DELETE</small>
      </button>
    </li>
  );
}

// Cancel a request the user no longer needs, and watch a timeout happen.
function SlowRequestDemo() {
  const controller = useRef<AbortController | null>(null);
  const [result, setResult] = useState("Idle");
  async function start(delayMs: number) {
    controller.current?.abort();
    controller.current = new AbortController();
    setResult(`Waiting up to ${delayMs} ms…`);
    try {
      const items = await listIncidents({ delayMs }, controller.current.signal);
      setResult(`Done: ${items.length} incidents`);
    } catch (err) {
      setResult(describe(toApiError(err)));
    }
  }
  return (
    <section className="demo" aria-labelledby="demo-heading">
      <h2 id="demo-heading">Slow requests</h2>
      <button onClick={() => start(2500)}>Slow GET (2.5 s)</button>
      <button onClick={() => controller.current?.abort()}>Cancel</button>
      <button onClick={() => start(4500)}>GET past the 4 s timeout</button>
      <p role="status">{result}</p>
    </section>
  );
}

function ActivityLog() {
  const [entries, setEntries] = useState<Activity[]>([]);
  useEffect(() => onActivity((entry) => setEntries((list) => [entry, ...list].slice(0, 8))), []);
  return (
    <section className="log" aria-labelledby="log-heading">
      <h2 id="log-heading">Requests <small>from the axios interceptors</small></h2>
      <table>
        <thead><tr><th>Method</th><th>URL</th><th>Result</th><th>ms</th><th>X-Request-Id</th></tr></thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id + entry.status}>
              <td>{entry.method}</td><td>{entry.url}</td><td>{entry.status}</td>
              <td>{entry.ms}</td><td><code>{entry.id.slice(0, 8)}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
