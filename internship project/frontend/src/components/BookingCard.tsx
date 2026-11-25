import { formatDate } from "../lib/phone";
import type { Appointment } from "../lib/types";
import { Icon } from "./Icon";

type Props = { appointment: Appointment; cancelled?: boolean };

export function BookingCard({ appointment, cancelled = false }: Props) {
  return (
    <section className={`booking-confirmation ${cancelled ? "is-cancelled" : ""}`} aria-label={cancelled ? "Appointment cancelled" : "Appointment confirmed"}>
      <span className="booking-confirmation-icon"><Icon name="check" size={16} /></span>
      <div className="booking-confirmation-copy">
        <span className="booking-confirmation-title">{cancelled ? "Appointment cancelled" : "Appointment confirmed"}</span>
        {appointment.patientName && <span>Patient · {appointment.patientName}</span>}
        <strong>{appointment.doctorName}</strong>
        <span>{formatDate(appointment.date)} <span aria-hidden="true">·</span> {appointment.time}</span>
        <code>{appointment.id}</code>
      </div>
    </section>
  );
}
