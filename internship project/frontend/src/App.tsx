import { useCallback, useEffect, useRef, useState } from "react";

import { AppointmentsTable } from "./components/AppointmentsTable";
import { CallWidget } from "./components/CallWidget";
import { DoctorsPanel } from "./components/DoctorsPanel";
import { Icon } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import { useAppointments } from "./hooks/useAppointments";
import { useCall } from "./hooks/useCall";
import type { ServerEvent } from "./lib/types";

type Section = "overview" | "doctors" | "appointments";

export default function App() {
  const { doctors, appointments, activeCount, loading, error, flash, revision, refresh, highlight } =
    useAppointments();
  const [openSlotCount, setOpenSlotCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const tryCallButtonRef = useRef<HTMLButtonElement | null>(null);
  const hadOpenCall = useRef(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleEvent = useCallback((event: ServerEvent) => {
    if (event.type !== "appointment_created" && event.type !== "appointment_cancelled") return;
    void refresh();
    if (event.appointment) {
      highlight(event.appointment.id, event.type === "appointment_created" ? "booked" : "cancelled");
    }
  }, [refresh, highlight]);

  const call = useCall({ onEvent: handleEvent });
  const callOpen = call.status !== "idle";
  const serviceStatus = call.status === "connected"
    ? "Agent connected"
    : ["requesting_permission", "connecting"].includes(call.status)
      ? "Call connecting"
      : loading
        ? "Checking service"
        : error
          ? "Backend unavailable"
          : "Backend available";

  useEffect(() => {
    if (callOpen) hadOpenCall.current = true;
    else if (hadOpenCall.current) {
      hadOpenCall.current = false;
      tryCallButtonRef.current?.focus();
    }
  }, [callOpen]);
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date());

  useEffect(() => {
    const sections = ["overview", "doctors", "appointments"]
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id as Section);
    }, { rootMargin: "-64px 0px -58% 0px", threshold: [0, 0.2, 0.5] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`app-shell ${callOpen ? "call-open" : ""}`}>
      <Sidebar
        activeSection={activeSection}
        open={menuOpen}
        onNavigate={closeMenu}
        agentReady={!loading && !error}
      />

      <main className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            aria-controls="sidebar-navigation"
          >
            <Icon name="menu" />
          </button>
          <div className="page-context" id="overview">
            <p className="eyebrow">{today}</p>
            <h1>Overview</h1>
          </div>
          <div className="topbar-actions">
            <div className={`readiness ${error ? "is-unavailable" : ""}`} role="status">
              <span className="readiness-dot" />
              {serviceStatus}
            </div>
          <button ref={tryCallButtonRef} className="try-call-button" type="button" onClick={call.open} disabled={callOpen}>
              <Icon name="phone" size={16} />
              {callOpen ? "Call open" : "Try call"}
            </button>
          </div>
        </header>

        {error && <div className="dashboard-error" role="alert">{error}</div>}

        <section className="overview-summary" aria-label="Today at a glance">
          <div className="summary-intro"><span>Today at a glance</span><small>Live operational data</small></div>
          <div className="summary-metric"><strong>{doctors.length}</strong><span>Doctors</span></div>
          <div className="summary-metric"><strong>{openSlotCount}</strong><span>Available slots</span></div>
          <div className="summary-metric"><strong>{activeCount}</strong><span>Appointments</span></div>
          {loading && <span className="summary-sync" role="status">Syncing</span>}
        </section>

        <div className="operations-stack">
          <DoctorsPanel
            doctors={doctors}
            loading={loading}
            bootstrapError={error}
            refreshKey={revision}
            onUpdated={() => void refresh()}
            onOpenSlotCount={setOpenSlotCount}
          />
          <AppointmentsTable appointments={appointments} flash={flash} loading={loading} error={error} />
        </div>

        <footer className="workspace-foot">
          <span>{error ? "Connection needs attention" : loading ? "Syncing schedule" : "Data synced with the clinic service"}</span>
          <span>Pipecat <i /> ElevenLabs <i /> OpenRouter</span>
        </footer>
      </main>

      <CallWidget call={call} />
    </div>
  );
}
