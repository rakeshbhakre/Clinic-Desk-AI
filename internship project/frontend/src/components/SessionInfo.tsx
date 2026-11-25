import type { useCall } from "../hooks/useCall";
import { formatDate, maskPhone } from "../lib/phone";

type Props = { call: ReturnType<typeof useCall> };

function statusText(call: Props["call"]) {
  if (call.cancellation) return "Cancelled";
  if (call.confirmation) return "Confirmed";
  if (call.status === "error") return "Connection issue";
  if (call.status === "connected") return "In progress";
  if (call.status === "ended") return "Call ended";
  return "Not booked";
}

export function SessionInfo({ call }: Props) {
  const appointment = call.confirmation ?? call.cancellation;
  const appointmentTime = appointment
    ? `${formatDate(appointment.date)} · ${appointment.time}`
    : call.requestedDate
      ? `${formatDate(call.requestedDate)} · Not selected`
      : "Not selected";

  const items = [
    { label: "Caller", value: call.callerName || "Not provided" },
    { label: "Patient", value: call.patientName || appointment?.patientName || "Not provided" },
    { label: "Contact", value: call.verifiedPhone ? maskPhone(call.verifiedPhone) : "Awaiting confirmation" },
    { label: "Doctor", value: appointment?.doctorName || call.requestedDoctor || "Not selected" },
    { label: "Date & time", value: appointmentTime },
    { label: "Booking status", value: statusText(call) },
  ];

  return (
    <section className="session-information" aria-labelledby="session-information-title">
      <div className="session-information-heading"><h2 id="session-information-title">Session information</h2><span>Live details</span></div>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd className={item.label === "Booking status" && call.confirmation ? "is-confirmed" : ""}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
