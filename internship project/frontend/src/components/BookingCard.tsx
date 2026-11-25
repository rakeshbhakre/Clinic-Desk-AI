import { formatDate } from "../lib/phone";
import type { Appointment } from "../lib/types";

type Props = {
  appointment: Appointment;
};

export function BookingCard({ appointment }: Props) {
  return (
    <div className="booking-card" role="status">
      <div className="booking-check" aria-hidden="true">
        ✓
      </div>
      <div>
        <p className="eyebrow">Appointment confirmed</p>
        <strong>{appointment.doctorName}</strong>
        <span>
          {formatDate(appointment.date)} · {appointment.time}
        </span>
        {appointment.patientName && (
          <span>
            {appointment.patientName} · {appointment.formattedPhone}
          </span>
        )}
        {appointment.reason && (
          <span className="booking-reason">Reason: {appointment.reason}</span>
        )}
      </div>
    </div>
  );
}
