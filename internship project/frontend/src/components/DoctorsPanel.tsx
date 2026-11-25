import { useEffect, useState, type FormEvent } from "react";

import { api } from "../lib/api";
import { formatDate } from "../lib/phone";
import type { Doctor, DoctorScheduleSlot } from "../lib/types";

type Props = {
  doctors: Doctor[];
  onUpdated?: () => void;
};

function localDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function DoctorsPanel({ doctors, onUpdated }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [scheduleDate, setScheduleDate] = useState(() => localDate());
  const [scheduleSlots, setScheduleSlots] = useState<DoctorScheduleSlot[]>([]);
  const [newTime, setNewTime] = useState("17:00");
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!editingId) return;
    let current = true;
    setLoadingSchedule(true);
    setError(null);
    api
      .doctorSchedule(editingId, scheduleDate)
      .then((schedule) => {
        if (current) setScheduleSlots(schedule.slots);
      })
      .catch((cause) => {
        if (current) setError(cause instanceof Error ? cause.message : "Could not load availability.");
      })
      .finally(() => {
        if (current) setLoadingSchedule(false);
      });
    return () => {
      current = false;
    };
  }, [editingId, scheduleDate]);

  async function copySlot(slotId: string) {
    try {
      await navigator.clipboard.writeText(slotId);
      setCopied(slotId);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  function beginEdit(doctor: Doctor) {
    if (editingId === doctor.id) {
      setEditingId(null);
      setError(null);
      return;
    }
    setEditingId(doctor.id);
    setName(doctor.name);
    setSpecialty(doctor.specialty);
    setScheduleDate(localDate());
    setError(null);
    setNotice(null);
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.updateDoctor(editingId, name, specialty);
      setName(result.doctor.name);
      setSpecialty(result.doctor.specialty);
      setNotice("Doctor details saved.");
      onUpdated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save doctor details.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.updateDoctorSchedule(
        editingId,
        scheduleDate,
        scheduleSlots.filter((slot) => slot.available || slot.booked).map((slot) => slot.time),
      );
      setScheduleSlots(result.slots);
      setNotice("Availability saved.");
      onUpdated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save availability.");
    } finally {
      setSaving(false);
    }
  }

  function addTime() {
    if (scheduleSlots.some((slot) => slot.time === newTime)) return;
    setScheduleSlots((previous) =>
      [...previous, { time: newTime, available: true, booked: false }].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    );
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
            .replace(/^Dr\.\s*/i, "")
            .split(" ")
            .map((part) => part[0])
            .join("");
          const isEditing = editingId === doctor.id;
          return (
            <article className="doctor-card" key={doctor.id}>
              <div className={`doctor-avatar tone-${index % 4}`}>{initials}</div>
              <div className="doctor-body">
                <div className="doctor-card-head">
                  <div className="doctor-title">
                    <h3>{doctor.name}</h3>
                    <span>{doctor.specialty}</span>
                  </div>
                  <button
                    type="button"
                    className="doctor-edit-button"
                    onClick={() => beginEdit(doctor)}
                    aria-expanded={isEditing}
                  >
                    {isEditing ? "Close" : "Edit"}
                  </button>
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

                {isEditing && (
                  <div className="doctor-editor">
                    <form className="doctor-profile-form" onSubmit={saveDoctor}>
                      <label>
                        Doctor name
                        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
                      </label>
                      <label>
                        Specialty
                        <input
                          value={specialty}
                          onChange={(event) => setSpecialty(event.target.value)}
                          maxLength={100}
                          required
                        />
                      </label>
                      <button className="editor-save" type="submit" disabled={saving}>
                        Save details
                      </button>
                    </form>

                    <div className="schedule-editor">
                      <div className="schedule-editor-heading">
                        <div>
                          <p className="eyebrow">Availability</p>
                          <strong>Open slots</strong>
                        </div>
                        <label className="schedule-date-label">
                          Date
                          <input
                            type="date"
                            value={scheduleDate}
                            min={localDate()}
                            max={shiftDate(localDate(), 2)}
                            onChange={(event) => setScheduleDate(event.target.value)}
                          />
                        </label>
                      </div>
                      {loadingSchedule ? (
                        <p className="schedule-hint">Loading schedule…</p>
                      ) : scheduleSlots.length === 0 ? (
                        <p className="schedule-hint">No slots are configured for this day.</p>
                      ) : (
                        <div className="schedule-slot-list">
                          {scheduleSlots.map((slot) => (
                            <label className={`schedule-slot ${slot.booked ? "is-booked" : ""}`} key={slot.time}>
                              <input
                                type="checkbox"
                                checked={slot.available || slot.booked}
                                disabled={slot.booked || saving}
                                onChange={(event) =>
                                  setScheduleSlots((previous) =>
                                    previous.map((item) =>
                                      item.time === slot.time
                                        ? { ...item, available: event.target.checked }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              <span>{slot.time}</span>
                              {slot.booked && <small>Booked</small>}
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="add-slot-row">
                        <label>
                          Add a time
                          <input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
                        </label>
                        <button type="button" className="editor-secondary" onClick={addTime} disabled={loadingSchedule}>
                          Add slot
                        </button>
                        <button type="button" className="editor-save" onClick={() => void saveSchedule()} disabled={saving || loadingSchedule}>
                          Save availability
                        </button>
                      </div>
                    </div>

                    {(error || notice) && (
                      <p className={`editor-feedback ${error ? "has-error" : ""}`} role="status">
                        {error ?? notice}
                      </p>
                    )}
                    <p className="schedule-hint">Booked times are protected and can&apos;t be removed or changed.</p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="panel-footnote">
        Edit doctor details and daily slots here. The voice agent uses the saved schedule when offering times.
      </div>
    </section>
  );
}
