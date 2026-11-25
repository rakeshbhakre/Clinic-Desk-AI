import { useCallback } from "react";

import { AppointmentsTable } from "./components/AppointmentsTable";
import { CallWidget } from "./components/CallWidget";
import { DoctorsPanel } from "./components/DoctorsPanel";
import { Sidebar } from "./components/Sidebar";
import { useAppointments } from "./hooks/useAppointments";
import { useCall } from "./hooks/useCall";
import type { ServerEvent } from "./lib/types";

export default function App() {
  const { doctors, appointments, activeCount, loading, error, flash, refresh, highlight } =
    useAppointments();

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      void refresh();
      if (event.appointment) {
        highlight(
          event.appointment.id,
          event.type === "appointment_created" ? "booked" : "cancelled",
        );
      }
    },
    [refresh, highlight],
  );

  const call = useCall({ onEvent: handleEvent });
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{today}</p>
            <h1>Good morning, front desk.</h1>
          </div>
          <div className="topbar-right">
            <span className={`system-chip ${call.status === "connected" ? "live" : ""}`}>
              <span className="pulse-dot" />
              {call.status === "connected" ? "Call live" : "System ready"}
            </span>
            <div className="operator">
              <span>FD</span>
              <div>
                <strong>Front Desk</strong>
                <small>Northstar Clinic</small>
              </div>
            </div>
          </div>
        </header>

        <section className="stats" aria-label="Overview">
          <article className="stat-card">
            <p>Active appointments</p>
            <strong>{activeCount}</strong>
            <span>Confirmed for next 3 days</span>
          </article>
          <article className="stat-card">
            <p>Doctors on board</p>
            <strong>{doctors.length}</strong>
            <span>Availability synced live</span>
          </article>
          <article className="stat-card accent">
            <p>Voice channel</p>
            <strong>{call.status === "connected" ? "Connected" : "Standby"}</strong>
            <span>Browser calling · WebRTC</span>
          </article>
        </section>

        {error && <div className="dashboard-error">{error}</div>}

        <div className="content-grid">
          <AppointmentsTable appointments={appointments} flash={flash} />
          <DoctorsPanel doctors={doctors} />
        </div>

        <footer className="workspace-foot">
          <span>{loading ? "Syncing..." : "All systems synced"}</span>
          <span>Pipecat · ElevenLabs · OpenRouter</span>
        </footer>
      </main>

      <CallWidget call={call} />
    </div>
  );
}
