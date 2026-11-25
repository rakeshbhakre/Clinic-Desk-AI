import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "../lib/api";
import { formatDate } from "../lib/phone";
import type { Doctor, DoctorScheduleSlot } from "../lib/types";
import { Icon } from "./Icon";

type Props = {
  doctors: Doctor[];
  loading: boolean;
  bootstrapError: string | null;
  refreshKey: number;
  onUpdated: () => void;
  onOpenSlotCount: (count: number) => void;
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

function initials(name: string) {
  return name
    .replace(/^Dr\.\s*/i, "")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function DoctorsPanel({ doctors, loading, bootstrapError, refreshKey, onUpdated, onOpenSlotCount }: Props) {
  const [scheduleDate, setScheduleDate] = useState(() => localDate());
  const [scheduleByDoctor, setScheduleByDoctor] = useState<Record<string, DoctorScheduleSlot[]>>({});
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [newTime, setNewTime] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const doctorIds = useMemo(() => doctors.map((doctor) => doctor.id).join(","), [doctors]);
  const specialtyOptions = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialty))].sort((a, b) => a.localeCompare(b)),
    [doctors],
  );
  const filteredDoctors = doctors.filter(
    (doctor) => specialtyFilter === "all" || doctor.specialty === specialtyFilter,
  );
  const today = localDate();
  const lastDay = shiftDate(today, 2);

  useEffect(() => {
    const ids = doctorIds ? doctorIds.split(",") : [];
    if (ids.length === 0) {
      setScheduleByDoctor({});
      setLoadingSchedule(false);
      return;
    }
    let current = true;
    setLoadingSchedule(true);
    setScheduleError(null);
    Promise.all(ids.map((id) => api.doctorSchedule(id, scheduleDate)))
      .then((schedules) => {
        if (!current) return;
        setScheduleByDoctor(Object.fromEntries(schedules.map((schedule) => [schedule.doctorId, schedule.slots])));
      })
      .catch((cause) => {
        if (current) setScheduleError(cause instanceof Error ? cause.message : "Could not load doctor schedules.");
      })
      .finally(() => {
        if (current) setLoadingSchedule(false);
      });
    return () => {
      current = false;
    };
  }, [doctorIds, scheduleDate, refreshKey]);

  useEffect(() => {
    const total = Object.values(scheduleByDoctor)
      .flat()
      .filter((slot) => slot.available && !slot.booked).length;
    onOpenSlotCount(total);
  }, [scheduleByDoctor, onOpenSlotCount]);

  const changeDoctorSlots = useCallback((doctorId: string, update: (slots: DoctorScheduleSlot[]) => DoctorScheduleSlot[]) => {
    setScheduleByDoctor((current) => ({
      ...current,
      [doctorId]: update(current[doctorId] ?? []),
    }));
  }, []);

  function beginEdit(doctor: Doctor) {
    if (editingId === doctor.id) {
      setEditingId(null);
      setScheduleError(null);
      setNotice(null);
      return;
    }
    setEditingId(doctor.id);
    setName(doctor.name);
    setSpecialty(doctor.specialty);
    setScheduleError(null);
    setNotice(null);
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setScheduleError(null);
    setNotice(null);
    try {
      await api.updateDoctor(editingId, name, specialty);
      setNotice("Doctor details saved.");
      onUpdated();
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : "Could not save doctor details.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule(doctorId: string) {
    setSaving(true);
    setScheduleError(null);
    setNotice(null);
    try {
      const slots = scheduleByDoctor[doctorId] ?? [];
      const schedule = await api.updateDoctorSchedule(
        doctorId,
        scheduleDate,
        slots.filter((slot) => slot.available || slot.booked).map((slot) => slot.time),
      );
      setScheduleByDoctor((current) => ({ ...current, [doctorId]: schedule.slots }));
      setNotice("Availability saved.");
      onUpdated();
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : "Could not save availability.");
    } finally {
      setSaving(false);
    }
  }

  function addTime(doctorId: string) {
    if ((scheduleByDoctor[doctorId] ?? []).some((slot) => slot.time === newTime)) return;
    changeDoctorSlots(doctorId, (slots) =>
      [...slots, { time: newTime, available: true, booked: false }].sort((a, b) => a.time.localeCompare(b.time)),
    );
  }

  return (
    <section className="operations-section doctors-section" id="doctors" aria-labelledby="doctors-title">
      <header className="section-heading schedule-heading">
        <div>
          <p className="section-kicker">Clinical schedule</p>
          <h2 id="doctors-title">Doctors</h2>
        </div>
        <div className="schedule-tools">
          <div className="date-stepper" aria-label="Schedule date">
            <button
              className="icon-button"
              type="button"
              onClick={() => setScheduleDate(shiftDate(scheduleDate, -1))}
              disabled={scheduleDate <= today}
              aria-label="Previous day"
            ><Icon name="chevron-left" size={16} /></button>
            <label>
              <span className="sr-only">Schedule date</span>
              <input
                type="date"
                value={scheduleDate}
                min={today}
                max={lastDay}
                onChange={(event) => setScheduleDate(event.target.value)}
              />
            </label>
            <button
              className="icon-button"
              type="button"
              onClick={() => setScheduleDate(shiftDate(scheduleDate, 1))}
              disabled={scheduleDate >= lastDay}
              aria-label="Next day"
            ><Icon name="chevron-right" size={16} /></button>
          </div>
          <label className="specialty-filter">
            <Icon name="filter" size={15} />
            <span className="sr-only">Filter by specialty</span>
            <select value={specialtyFilter} onChange={(event) => setSpecialtyFilter(event.target.value)}>
              <option value="all">All specialties</option>
              {specialtyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="doctor-schedule-head" aria-hidden="true">
        <span>Doctor</span><span>Schedule · {scheduleDate === today ? "Today" : formatDate(scheduleDate)}</span><span>Manage</span>
      </div>

      {loading && doctors.length === 0 ? (
        <div className="schedule-loading" role="status"><span /> Loading doctors</div>
      ) : bootstrapError && doctors.length === 0 ? (
        <div className="section-error" role="alert">Doctor data is unavailable.</div>
      ) : loadingSchedule && Object.keys(scheduleByDoctor).length === 0 ? (
        <div className="schedule-loading" role="status"><span /> Loading schedule</div>
      ) : scheduleError ? (
        <div className="section-error" role="alert">{scheduleError}</div>
      ) : filteredDoctors.length === 0 ? (
        <div className="empty-state compact-empty"><strong>{doctors.length === 0 ? "No doctors are available." : "No doctors match this specialty."}</strong></div>
      ) : (
        <>
        {loadingSchedule && <p className="schedule-refresh" role="status">Updating availability</p>}
        <div className="doctor-schedule-list">
          {filteredDoctors.map((doctor, index) => {
            const slots = scheduleByDoctor[doctor.id] ?? [];
            const openCount = slots.filter((slot) => slot.available && !slot.booked).length;
            const isEditing = editingId === doctor.id;
            return (
              <article className="doctor-schedule-row" key={doctor.id}>
                <div className="doctor-identity">
                  <span className={`doctor-avatar tone-${index % 4}`} aria-hidden="true">{initials(doctor.name)}</span>
                  <span className="doctor-identity-copy"><strong>{doctor.name}</strong><small>{doctor.specialty}</small></span>
                </div>
                <div className="doctor-time-area">
                  {slots.length === 0 ? (
                    <span className="schedule-empty">No slots scheduled</span>
                  ) : (
                    <div className="schedule-time-list">
                      {slots.map((slot) => {
                        const status = slot.booked ? "booked" : slot.available ? "open" : "closed";
                        const label = slot.booked ? "Booked" : slot.available ? "Open" : "Closed";
                        return (
                          <span className={`schedule-time schedule-time-${status}`} key={slot.time}>
                            <strong>{slot.time}</strong><small>{label}</small>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="doctor-row-action">
                  <span className="doctor-open-count">{openCount} open</span>
                  <button className="text-button" type="button" onClick={() => beginEdit(doctor)} aria-expanded={isEditing}>
                    {isEditing ? "Done" : "Edit"}
                  </button>
                </div>

                {isEditing && (
                  <div className="doctor-editor">
                    <form className="doctor-profile-form" onSubmit={saveDoctor}>
                      <label>Doctor name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label>
                      <label>Specialty<input value={specialty} onChange={(event) => setSpecialty(event.target.value)} maxLength={100} required /></label>
                      <button className="small-primary" type="submit" disabled={saving}>Save details</button>
                    </form>
                    <div className="editor-availability">
                      <div className="editor-subheading"><strong>Open times for {formatDate(scheduleDate)}</strong><span>Booked times are protected.</span></div>
                      {slots.length > 0 && (
                        <div className="editor-slot-list">
                          {slots.map((slot) => (
                            <label className={`editor-slot ${slot.booked ? "is-booked" : ""}`} key={slot.time}>
                              <input
                                type="checkbox"
                                checked={slot.available || slot.booked}
                                disabled={slot.booked || saving}
                                onChange={(event) => changeDoctorSlots(doctor.id, (current) => current.map((item) => item.time === slot.time ? { ...item, available: event.target.checked } : item))}
                              />
                              <span>{slot.time}</span>
                              {slot.booked && <small>Booked</small>}
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="editor-add-time">
                        <label>Add time<input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} /></label>
                        <button className="small-secondary" type="button" onClick={() => addTime(doctor.id)} disabled={saving || slots.some((slot) => slot.time === newTime)}>Add slot</button>
                        <button className="small-primary" type="button" onClick={() => void saveSchedule(doctor.id)} disabled={saving}>Save schedule</button>
                      </div>
                    </div>
                    {(scheduleError || notice) && <p className={`editor-feedback ${scheduleError ? "has-error" : ""}`} role="status">{scheduleError ?? notice}</p>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
        </>
      )}
    </section>
  );
}
