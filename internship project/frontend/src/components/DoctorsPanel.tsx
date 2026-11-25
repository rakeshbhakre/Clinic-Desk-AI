import { useState } from "react";

import { formatDate } from "../lib/phone";
import type { Doctor } from "../lib/types";

type Props = {
  doctors: Doctor[];
};

export function DoctorsPanel({ doctors }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copySlot(slotId: string) {
    try {
      await navigator.clipboard.writeText(slotId);
      setCopied(slotId);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section className="panel doctors-panel" id="doctors">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Today&apos;s board</p>
          <h2>Doctors &amp; slots</h2>
        </div>
        <span className="count-badge">{doctors.length}</span>
      </header>

      <div className="doctor-list">
        {doctors.map((doctor, index) => {
          const initials = doctor.name
            .replace("Dr. ", "")
            .split(" ")
            .map((part) => part[0])
            .join("");
          return (
            <article className="doctor-card" key={doctor.id}>
              <div className={`doctor-avatar tone-${index % 4}`}>{initials}</div>
              <div className="doctor-body">
                <div className="doctor-title">
                  <h3>{doctor.name}</h3>
                  <span>{doctor.specialty}</span>
                </div>
                <div className="slot-row">
                  {doctor.slots.length === 0 ? (
                    <span className="slot-empty">No open slots</span>
                  ) : (
                    doctor.slots.slice(0, 3).map((slot) => (
                      <button
                        type="button"
                        className="slot-chip"
                        key={slot.id}
                        onClick={() => void copySlot(slot.id)}
                        title="Copy slot id for the voice agent"
                      >
                        <strong>{formatDate(slot.date)}</strong>
                        <span>{slot.time}</span>
                        {copied === slot.id && <em>Copied</em>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="panel-footnote">
        Ask the caller for a doctor and time. Availability updates after every booking.
      </div>
    </section>
  );
}
