import { formatDate } from "../lib/phone";
import type { Appointment } from "../lib/types";
import { Icon } from "./Icon";

type Props = { appointment: Appointment };

export function BookingCard({ appointment }: Props) {
  return (
    <section className="booking-confirmation" aria-label="Appointment confirmed">
      <span className="booking-confirmation-icon"><Icon name="check" size={16} /></span>
      <div className="booking-confirmation-copy">
        <span className="booking-confirmation-title">Appointment confirmed</span>
        <strong>{appointment.doctorName}</strong>
        <span>{formatDate(appointment.date)} <span aria-hidden="true">·</span> {appointment.time}</span>
        <code>{appointment.id}</code>
      </div>
    </section>
  );
}
