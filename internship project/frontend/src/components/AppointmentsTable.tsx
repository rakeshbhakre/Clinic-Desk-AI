import { useState } from "react";

import { formatDate, maskPhone } from "../lib/phone";
import type { Appointment } from "../lib/types";

type Props = {
  appointments: Appointment[];
  flash: { id: string; kind: "booked" | "cancelled" } | null;
  loading: boolean;
  error: string | null;
};

export function AppointmentsTable({ appointments, flash, loading, error }: Props) {
  const [visiblePhones, setVisiblePhones] = useState<Set<string>>(() => new Set());
  const visible = appointments.slice(0, 12);
  const activeCount = appointments.filter((appointment) => appointment.status === "confirmed").length;

  function togglePhone(id: string) {
    setVisiblePhones((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="operations-section appointments-section" id="appointments" aria-labelledby="appointments-title">
      <header className="section-heading">
        <div>
          <p className="section-kicker">Visit ledger</p>
          <h2 id="appointments-title">Appointments</h2>
        </div>
        <span className="section-count">{activeCount} active</span>
      </header>

      {loading && appointments.length === 0 ? (
        <div className="table-loading" role="status">Loading appointments…</div>
      ) : error && appointments.length === 0 ? (
        <div className="section-error" role="alert">Appointment data is unavailable.</div>
      ) : appointments.length === 0 ? (
        <div className="empty-state">
          <span className="empty-mark" aria-hidden="true">—</span>
          <strong>No appointments yet</strong>
          <span>Start a call to book an appointment.</span>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="appointment-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Caller</th>
                <th scope="col">Doctor</th>
                <th scope="col">Date &amp; time</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((appointment) => {
                const phoneVisible = visiblePhones.has(appointment.id);
                return (
                  <tr
                    key={appointment.id}
                    className={`${flash?.id === appointment.id ? `row-flash-${flash.kind}` : ""} ${appointment.status === "cancelled" ? "appointment-cancelled" : ""}`}
                  >
                    <td data-label="Reference">
                      <span className="cell-label">Reference</span>
                      <code className="appointment-reference">{appointment.id}</code>
                    </td>
                    <td data-label="Caller">
                      <span className="cell-label">Caller</span>
                      <span className="caller-detail">
                        <strong>{appointment.patientName || "Caller"}</strong>
                        <span className="phone-value" title={phoneVisible ? "Phone number visible" : "Phone number masked"}>
                          {phoneVisible ? appointment.formattedPhone : maskPhone(appointment.formattedPhone)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="privacy-toggle"
                        onClick={() => togglePhone(appointment.id)}
                        aria-label={`${phoneVisible ? "Mask" : "Reveal"} phone number for ${appointment.patientName || "caller"}`}
                      >
                        {phoneVisible ? "Hide" : "Show"}
                      </button>
                    </td>
                    <td data-label="Doctor">
                      <span className="cell-label">Doctor</span>
                      <span>{appointment.doctorName}</span>
                    </td>
                    <td data-label="Date & time">
                      <span className="cell-label">Date &amp; time</span>
                      <time className="appointment-when" dateTime={`${appointment.date}T${appointment.time}`}>
                        <span>{formatDate(appointment.date)}</span>
                        <strong>{appointment.time}</strong>
                      </time>
                    </td>
                    <td data-label="Status">
                      <span className="cell-label">Status</span>
                      <span className={`status-indicator status-${appointment.status}`}>
                        <span aria-hidden="true" />
                        {appointment.status === "confirmed" ? "Confirmed" : "Cancelled"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {appointments.length > visible.length && (
            <p className="table-footnote">Showing the latest {visible.length} of {appointments.length} appointments.</p>
          )}
        </div>
      )}
    </section>
  );
}
