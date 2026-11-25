import type { Bootstrap, Doctor, DoctorSchedule } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string };
      if (data.detail) message = data.detail;
    } catch {
      // Keep the HTTP status message when the server has no JSON detail.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const api = {
  bootstrap: () => getJson<Bootstrap>("/api/bootstrap"),
  doctorSchedule: (doctorId: string, date: string) =>
    getJson<DoctorSchedule>(`/api/doctors/${encodeURIComponent(doctorId)}/availability?date=${date}`),
  updateDoctor: (doctorId: string, name: string, specialty: string) =>
    putJson<{ doctor: Doctor }>(`/api/doctors/${encodeURIComponent(doctorId)}`, { name, specialty }),
  updateDoctorSchedule: (doctorId: string, date: string, times: string[]) =>
    putJson<DoctorSchedule>(
      `/api/doctors/${encodeURIComponent(doctorId)}/availability?date=${date}`,
      { times },
    ),
};
