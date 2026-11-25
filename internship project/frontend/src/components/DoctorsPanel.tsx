import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

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
  return name.replace(/^Dr\.\s*/i, "").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function DoctorsPanel({ doctors, loading, bootstrapError, refreshKey, onUpdated }: Props) {
  const [scheduleDate, setScheduleDate] = useState(() => localDate());
  const [scheduleByDoctor, setScheduleByDoctor] = useState<Record<string, DoctorScheduleSlot[]>>({});
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [newTime, setNewTime] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  const doctorIds = useMemo(() => doctors.map((doctor) => doctor.id).join(","), [doctors]);
  const specialtyOptions = useMemo(
    () => [...new Set(doctors.map((doctor) => doctor.specialty))].sort((a, b) => a.localeCompare(b)),
    [doctors],
  );
  const filteredDoctors = doctors.filter((doctor) => {
    const matchesSpecialty = specialtyFilter === "all" || doctor.specialty === specialtyFilter;
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || `${doctor.name} ${doctor.specialty}`.toLocaleLowerCase().includes(query);
    return matchesSpecialty && matchesSearch;
  });
  const today = localDate();
  const lastDay = shiftDate(today, 2);
  const editingDoctor = doctors.find((doctor) => doctor.id === editingId) ?? null;
  const editingSlots = editingId ? scheduleByDoctor[editingId] ?? [] : [];

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
        if (current) setScheduleByDoctor(Object.fromEntries(schedules.map((schedule) => [schedule.doctorId, schedule.slots])));
      })
      .catch((cause) => {
        if (current) setScheduleError(cause instanceof Error ? cause.message : "Could not load doctor schedules.");
      })
      .finally(() => { if (current) setLoadingSchedule(false); });
    return () => { current = false; };
  }, [doctorIds, scheduleDate, refreshKey]);

  useEffect(() => {
    if (!editingId) return;
    const dialog = drawerRef.current;
    dialog?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEditor();
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])"));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [editingId]);

  const changeDoctorSlots = useCallback((doctorId: string, update: (slots: DoctorScheduleSlot[]) => DoctorScheduleSlot[]) => {
    setScheduleByDoctor((current) => ({ ...current, [doctorId]: update(current[doctorId] ?? []) }));
  }, []);

  function beginEdit(doctor: Doctor, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    setEditingId(doctor.id);
    setName(doctor.name);
    setSpecialty(doctor.specialty);
    setScheduleError(null);
    setNotice(null);
  }

  function closeEditor() {
    setEditingId(null);
    setScheduleError(null);
    setNotice(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  async function saveDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setScheduleError(null);
    setNotice(null);
    try {
      await api.updateDoctor(editingId, name.trim(), specialty.trim());
      setNotice("Doctor details saved.");
      onUpdated();
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : "Could not save doctor details.");
    } finally { setSaving(false); }
  }

  async function saveSchedule() {
    if (!editingId) return;
    setSaving(true);
    setScheduleError(null);
    setNotice(null);
    try {
      const schedule = await api.updateDoctorSchedule(
        editingId,
        scheduleDate,
        editingSlots.filter((slot) => slot.available || slot.booked).map((slot) => slot.time),
      );
      setScheduleByDoctor((current) => ({ ...current, [editingId]: schedule.slots }));
      setNotice("Availability saved.");
      onUpdated();
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : "Could not save availability.");
    } finally { setSaving(false); }
  }

  function addTime() {
    if (!editingId || editingSlots.some((slot) => slot.time === newTime)) return;
    changeDoctorSlots(editingId, (slots) => [...slots, { time: newTime, available: true, booked: false }].sort((a, b) => a.time.localeCompare(b.time)));
  }

  return (
    <section className="management-page doctors-page" aria-labelledby="doctors-title">
      <header className="management-heading">
        <div><p className="eyebrow">Clinical schedule</p><h1 id="doctors-title">Doctors</h1></div>
        <span className="heading-meta">{doctors.length} {doctors.length === 1 ? "doctor" : "doctors"}</span>
      </header>

      <div className="management-toolbar">
        <label className="search-field">
          <Icon name="search" size={17} /><span className="sr-only">Search doctors</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search doctors" />
        </label>
        <label className="filter-field">
          <Icon name="filter" size={16} /><span className="sr-only">Filter by specialty</span>
          <select value={specialtyFilter} onChange={(event) => setSpecialtyFilter(event.target.value)}>
            <option value="all">All specialties</option>
            {specialtyOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <div className="date-control" aria-label="Schedule date">
          <button className="bare-icon-button" type="button" onClick={() => setScheduleDate(shiftDate(scheduleDate, -1))} disabled={scheduleDate <= today} aria-label="Previous day"><Icon name="chevron-left" size={17} /></button>
          <label><span className="sr-only">Schedule date</span><input type="date" value={scheduleDate} min={today} max={lastDay} onChange={(event) => setScheduleDate(event.target.value)} /></label>
          <button className="bare-icon-button" type="button" onClick={() => setScheduleDate(shiftDate(scheduleDate, 1))} disabled={scheduleDate >= lastDay} aria-label="Next day"><Icon name="chevron-right" size={17} /></button>
        </div>
      </div>

      <div className="schedule-caption"><span>Doctor</span><span>Available times · {formatDate(scheduleDate)}</span><span>Manage</span></div>

      {loading && doctors.length === 0 ? (
        <div className="page-state" role="status">Loading doctors…</div>
      ) : bootstrapError && doctors.length === 0 ? (
        <div className="page-state is-error" role="alert">Doctor data is unavailable.</div>
      ) : scheduleError && Object.keys(scheduleByDoctor).length === 0 ? (
        <div className="page-state is-error" role="alert">{scheduleError}</div>
      ) : loadingSchedule && Object.keys(scheduleByDoctor).length === 0 ? (
        <div className="page-state" role="status">Loading live availability…</div>
      ) : filteredDoctors.length === 0 ? (
        <div className="page-state">{doctors.length ? "No doctors match your search." : "No doctors are available."}</div>
      ) : (
        <div className="doctor-list" aria-busy={loadingSchedule}>
          {filteredDoctors.map((doctor, index) => {
            const slots = scheduleByDoctor[doctor.id] ?? [];
            const openCount = slots.filter((slot) => slot.available && !slot.booked).length;
            return (
              <article className="doctor-row" key={doctor.id}>
                <div className="doctor-identity">
                  <span className={`doctor-avatar doctor-tone-${index % 4}`} aria-hidden="true">{initials(doctor.name)}</span>
                  <span><strong>{doctor.name}</strong><small>{doctor.specialty}</small></span>
                </div>
                <div className="doctor-slots">
                  {slots.length === 0 ? <span className="quiet-label">No times listed</span> : slots.map((slot) => (
                    <span className={`slot-label ${slot.booked ? "is-booked" : slot.available ? "is-open" : "is-closed"}`} key={slot.time}>
                      <strong>{slot.time}</strong><small>{slot.booked ? "Booked" : slot.available ? "Available" : "Closed"}</small>
                    </span>
                  ))}
                </div>
                <div className="doctor-row-manage">
                  <span>{openCount} open</span>
                  <button className="text-action" type="button" aria-label={`Edit ${doctor.name} and availability`} onClick={(event) => beginEdit(doctor, event.currentTarget)}>Edit</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingDoctor && (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <aside className="edit-drawer" role="dialog" aria-modal="true" aria-labelledby="edit-doctor-title" tabIndex={-1} ref={drawerRef}>
            <header className="drawer-heading">
              <div><p className="eyebrow">Doctor details</p><h2 id="edit-doctor-title">Edit availability</h2></div>
              <button className="bare-icon-button" type="button" onClick={closeEditor} aria-label="Close editor"><Icon name="close" size={19} /></button>
            </header>

            <form className="doctor-details-form" onSubmit={saveDoctor}>
              <label>Doctor name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label>
              <label>Specialty<input value={specialty} onChange={(event) => setSpecialty(event.target.value)} maxLength={100} required /></label>
              <button className="secondary-action" type="submit" disabled={saving}>Save details</button>
            </form>

            <section className="drawer-schedule" aria-labelledby="drawer-schedule-title">
              <div className="drawer-section-heading"><h3 id="drawer-schedule-title">Schedule · {formatDate(scheduleDate)}</h3><p>Confirmed appointments are protected.</p></div>
              <div className="drawer-slot-list">
                {editingSlots.map((slot) => (
                  <label className={`drawer-slot ${slot.booked ? "is-booked" : ""}`} key={slot.time}>
                    <input type="checkbox" checked={slot.available || slot.booked} disabled={slot.booked || saving} onChange={(event) => changeDoctorSlots(editingDoctor.id, (slots) => slots.map((item) => item.time === slot.time ? { ...item, available: event.target.checked } : item))} />
                    <span>{slot.time}</span><small>{slot.booked ? "Booked" : slot.available ? "Open" : "Closed"}</small>
                  </label>
                ))}
              </div>
              <div className="add-slot-row">
                <label>Add a time<input type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} /></label>
                <button className="tertiary-action" type="button" onClick={addTime} disabled={saving || editingSlots.some((slot) => slot.time === newTime)}>Add slot</button>
              </div>
              {scheduleError && <p className="form-feedback is-error" role="alert">{scheduleError}</p>}
              {notice && <p className="form-feedback" role="status">{notice}</p>}
            </section>

            <footer className="drawer-footer">
              <button className="quiet-action" type="button" onClick={closeEditor}>Cancel</button>
              <button className="primary-action" type="button" onClick={() => void saveSchedule()} disabled={saving}>{saving ? "Saving…" : "Save availability"}</button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  );
}
