import { useEffect, useMemo, useRef, useState } from "react";

import { formatDate, maskPhone } from "../lib/phone";
import type { Appointment } from "../lib/types";
import { Icon } from "./Icon";

type Props = {
  appointments: Appointment[];
  flash: { id: string; kind: "booked" | "cancelled" } | null;
  loading: boolean;
  error: string | null;
  selectedAppointmentId: string | null;
  onSelectedAppointment: (id: string | null) => void;
};

export function AppointmentsTable({ appointments, flash, loading, error, selectedAppointmentId, onSelectedAppointment }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visiblePhones, setVisiblePhones] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [detailCopied, setDetailCopied] = useState(false);
  const [detailPhoneVisible, setDetailPhoneVisible] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const activeCount = appointments.filter((appointment) => appointment.status === "confirmed").length;
  const selectedAppointment = appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null;
  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return appointments.filter((appointment) => {
      const statusMatches = statusFilter === "all" || appointment.status === statusFilter;
      const text = [appointment.patientName, appointment.callerName, appointment.doctorName, appointment.date, appointment.time, appointment.id, appointment.phone].join(" ").toLocaleLowerCase();
      return statusMatches && (!query || text.includes(query));
    });
  }, [appointments, search, statusFilter]);

  useEffect(() => {
    setDetailPhoneVisible(false);
    if (!selectedAppointmentId) {
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
      return;
    }
    const dialog = dialogRef.current;
    dialog?.focus();
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelectedAppointment(null);
      if (event.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus();
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  }, [selectedAppointmentId, onSelectedAppointment]);

  function togglePhone(id: string) {
    setVisiblePhones((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function showDetails(id: string, trigger: HTMLElement) {
    returnFocusRef.current = trigger;
    onSelectedAppointment(id);
  }

  async function copyReference(appointment: Appointment, trigger: HTMLElement) {
    try {
      await navigator.clipboard.writeText(appointment.id);
      setCopiedId(appointment.id);
      window.setTimeout(() => setCopiedId((current) => current === appointment.id ? null : current), 1800);
    } catch {
      showDetails(appointment.id, trigger);
    }
  }

  async function copySelectedReference() {
    if (!selectedAppointment) return;
    try {
      await navigator.clipboard.writeText(selectedAppointment.id);
      setDetailCopied(true);
      window.setTimeout(() => setDetailCopied(false), 1800);
    } catch {
      setDetailCopied(false);
    }
  }

  return (
    <section className="management-page appointments-page" aria-labelledby="appointments-title">
      <header className="management-heading">
        <div><p className="eyebrow">Visit ledger</p><h1 id="appointments-title">Appointments</h1></div>
        <span className="heading-meta">{activeCount} active</span>
      </header>

      <div className="management-toolbar appointment-toolbar">
        <label className="search-field">
          <Icon name="search" size={17} /><span className="sr-only">Search appointments</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, doctor, date or reference" />
        </label>
        <label className="filter-field status-filter">
          <Icon name="filter" size={16} /><span className="sr-only">Filter by status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>

      {loading && appointments.length === 0 ? (
        <div className="page-state" role="status">Loading appointments…</div>
      ) : error && appointments.length === 0 ? (
        <div className="page-state is-error" role="alert">Appointment data is unavailable.</div>
      ) : appointments.length === 0 ? (
        <div className="page-empty"><strong>No appointments yet.</strong><span>Start a call to book an appointment.</span></div>
      ) : filteredAppointments.length === 0 ? (
        <div className="page-state">No appointments match your search.</div>
      ) : (
        <div className="appointment-table-wrap">
          <table className="appointment-table">
            <thead><tr>
              <th scope="col">Patient</th><th scope="col">Doctor</th><th scope="col">Date &amp; time</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {filteredAppointments.map((appointment) => {
                const phoneVisible = visiblePhones.has(appointment.id);
                return (
                  <tr key={appointment.id} className={`${flash?.id === appointment.id ? `row-flash-${flash.kind}` : ""} ${appointment.status === "cancelled" ? "appointment-cancelled" : ""}`}>
                    <td data-label="Patient"><span className="patient-name">{appointment.patientName || "Name not provided"}</span></td>
                    <td data-label="Doctor">{appointment.doctorName}</td>
                    <td data-label="Date & time"><time className="appointment-when" dateTime={`${appointment.date}T${appointment.time}`}><span>{formatDate(appointment.date)}</span><strong>{appointment.time}</strong></time></td>
                    <td data-label="Contact">
                      <span className="contact-value">{phoneVisible ? appointment.formattedPhone : maskPhone(appointment.formattedPhone)}</span>
                      <button className="contact-toggle" type="button" onClick={() => togglePhone(appointment.id)} aria-label={`${phoneVisible ? "Mask" : "Reveal"} contact for ${appointment.patientName || "appointment"}`}>{phoneVisible ? "Hide" : "Show"}</button>
                    </td>
                    <td data-label="Status"><span className={`status-label status-${appointment.status}`}><span aria-hidden="true" />{appointment.status === "confirmed" ? "Confirmed" : "Cancelled"}</span></td>
                    <td data-label="Actions" className="appointment-actions-cell">
                      <details className="action-menu">
                        <summary aria-label={`Actions for ${appointment.patientName || "appointment"}`}><Icon name="more" size={19} /></summary>
                        <div className="action-menu-popover">
                          <button type="button" onClick={(event) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; showDetails(appointment.id, event.currentTarget); }}>View details</button>
                          <button type="button" onClick={(event) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; void copyReference(appointment, event.currentTarget); }}>{copiedId === appointment.id ? "Reference copied" : "Copy reference"}</button>
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedAppointment && (
        <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onSelectedAppointment(null); }}>
          <aside className="edit-drawer appointment-drawer" role="dialog" aria-modal="true" aria-labelledby="appointment-detail-title" tabIndex={-1} ref={dialogRef}>
            <header className="drawer-heading">
              <div><p className="eyebrow">Appointment details</p><h2 id="appointment-detail-title">{selectedAppointment.patientName || "Patient not named"}</h2></div>
              <button className="bare-icon-button" type="button" onClick={() => onSelectedAppointment(null)} aria-label="Close appointment details"><Icon name="close" size={19} /></button>
            </header>
            <dl className="appointment-detail-list">
              <div><dt>Doctor</dt><dd>{selectedAppointment.doctorName}</dd></div>
              <div><dt>Date &amp; time</dt><dd>{formatDate(selectedAppointment.date)} · {selectedAppointment.time}</dd></div>
              <div><dt>Status</dt><dd><span className={`status-label status-${selectedAppointment.status}`}><span aria-hidden="true" />{selectedAppointment.status === "confirmed" ? "Confirmed" : "Cancelled"}</span></dd></div>
              {selectedAppointment.callerName && selectedAppointment.callerName.trim().toLowerCase() !== selectedAppointment.patientName.trim().toLowerCase() && <div><dt>Caller</dt><dd>{selectedAppointment.callerName}</dd></div>}
              <div><dt>Contact</dt><dd className="detail-contact">{detailPhoneVisible ? selectedAppointment.formattedPhone : maskPhone(selectedAppointment.formattedPhone)}<button className="text-action" type="button" onClick={() => setDetailPhoneVisible((value) => !value)}>{detailPhoneVisible ? "Hide" : "Reveal"}</button></dd></div>
              <div><dt>Reference</dt><dd><code>{selectedAppointment.id}</code></dd></div>
            </dl>
            <footer className="drawer-footer"><button className="tertiary-action" type="button" onClick={() => void copySelectedReference()}>{detailCopied ? "Reference copied" : "Copy reference"}</button><button className="primary-action" type="button" onClick={() => onSelectedAppointment(null)}>Done</button></footer>
          </aside>
        </div>
      )}
    </section>
  );
}
