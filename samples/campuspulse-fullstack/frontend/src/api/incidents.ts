// Typed endpoint functions: components never build URLs themselves.
import { api } from "./client.ts";

export type Status = "investigating" | "monitoring" | "resolved";
export type Service = "printing" | "wifi" | "shuttle" | "d2l";
export type Incident = { id: string; title: string; service: Service; status: Status; updatedAt: string };
export type NewIncident = Pick<Incident, "title" | "service">;
export type Filters = { status?: Status; q?: string; delayMs?: number };

export const STATUSES: Status[] = ["investigating", "monitoring", "resolved"];
export const SERVICES: Service[] = ["printing", "wifi", "shuttle", "d2l"];

// GET /incidents?status=…&q=…   (axios builds and encodes the query string)
export async function listIncidents(filters: Filters = {},
                                    signal?: AbortSignal) {
  const { data } = await api.get<{ items: Incident[]; count: number }>(
    "/incidents", { params: filters, signal });
  return data.items;
}

// GET /incidents/:id
export async function getIncident(id: string) {
  const { data } = await api.get<Incident>(
    `/incidents/${encodeURIComponent(id)}`);
  return data;
}

// POST /incidents — axios serializes the object to JSON and sets Content-Type
export async function createIncident(input: NewIncident) {
  const response = await api.post<Incident>("/incidents", input);
  return { incident: response.data,
           location: response.headers["location"] as string };
}

// PUT /incidents/:id — send the whole editable record
export async function replaceIncident(incident: Incident) {
  const { id, title, service, status } = incident;
  const url = `/incidents/${encodeURIComponent(id)}`;
  return (await api.put<Incident>(url, { title, service, status })).data;
}

// PATCH /incidents/:id — send only what changed
export async function updateStatus(id: string, status: Status) {
  const url = `/incidents/${encodeURIComponent(id)}`;
  return (await api.patch<Incident>(url, { status })).data;
}

// DELETE /incidents/:id — 204, no body
export async function deleteIncident(id: string) {
  await api.delete(`/incidents/${encodeURIComponent(id)}`);
}

export async function checkHealth() {
  const { data } = await api.get<{ ok: boolean }>("/healthz");
  return data.ok;
}
