import { formatDate } from "../lib/phone";
import type { Appointment } from "../lib/types";

type Props = {
  appointments: Appointment[];
  flash: { id: string; kind: "booked" | "cancelled" } | null;
};

export function AppointmentsTable({ appointments, flash }: Props) {
  const visible = appointments.slice(0, 8);

  return (
    <section className="panel appointments-panel" id="appointments">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Live ledger</p>
          <h2>Appointments</h2>
        </div>
        <span className="count-badge">{appointments.filter((a) => a.status === "confirmed").length}</span>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Caller</th>
              <th>Doctor</th>
              <th>When</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-row">
                  No appointments yet. Start a call to book the first one.
                </td>
              </tr>
            ) : (
              visible.map((item) => (
                <tr
                  key={item.id}
                  className={`${flash?.id === item.id ? `flash-${flash.kind}` : ""} ${
                    item.status === "cancelled" ? "row-cancelled" : ""
                  }`}
                >
                  <td>
                    <span className="caller-cell">
                      <span className="caller-dot" />
                      <span className="caller-lines">
                        <strong>{item.patientName || item.formattedPhone}</strong>
                        {item.patientName && <small>{item.formattedPhone}</small>}
                      </span>
                    </span>
                  </td>
                  <td>{item.doctorName}</td>
                  <td>
                    <span className="when-cell">
                      {formatDate(item.date)} <em>{item.time}</em>
                    </span>
                  </td>
                  <td>
                    <span className={`status-pill ${item.status}`}>{item.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
