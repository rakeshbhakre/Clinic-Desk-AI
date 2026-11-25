import { useCallback, useEffect, useRef, useState } from "react";

import { AppHeader, type WorkspaceTab } from "./components/AppHeader";
import { AppointmentsTable } from "./components/AppointmentsTable";
import { CallWidget } from "./components/CallWidget";
import { DoctorsPanel } from "./components/DoctorsPanel";
import { Icon } from "./components/Icon";
import { SessionInfo } from "./components/SessionInfo";
import { Transcript } from "./components/Transcript";
import { VoiceOrb } from "./components/VoiceOrb";
import { useAppointments } from "./hooks/useAppointments";
import { useCall } from "./hooks/useCall";
import type { Appointment, ServerEvent } from "./lib/types";

type Notification = { appointment: Appointment; message: string } | null;

function callLabel(status: ReturnType<typeof useCall>["status"]) {
  if (status === "requesting_permission") return "Requesting microphone access";
  if (status === "connecting") return "Connecting to Ava";
  if (status === "connected") return "Connected";
  if (status === "ending") return "Ending call";
  if (status === "ended") return "Call ended";
  if (status === "error") return "Connection issue";
  return "Ready for a call";
}

export default function App() {
  const { doctors, appointments, loading, error, flash, revision, refresh, highlight } = useAppointments();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("workspace");
  const [mobileViewOpen, setMobileViewOpen] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1100px)").matches,
  );
  const [notification, setNotification] = useState<Notification>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const notificationTimer = useRef<number | null>(null);

  const handleEvent = useCallback((event: ServerEvent) => {
    if (event.type !== "appointment_created" && event.type !== "appointment_cancelled") return;
    void refresh();
    if (!event.appointment) return;
    const booked = event.type === "appointment_created";
    highlight(event.appointment.id, booked ? "booked" : "cancelled");
    setNotification({
      appointment: event.appointment,
      message: booked ? "Appointment confirmed" : "Appointment cancelled",
    });
    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => setNotification(null), 6500);
  }, [highlight, refresh]);

  const call = useCall({ onEvent: handleEvent });
  const callInProgress = ["requesting_permission", "connecting", "connected", "ending"].includes(call.status);

  useEffect(() => () => {
    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
  }, []);

  const startCall = useCallback(() => {
    setMobileViewOpen(true);
    call.start();
  }, [call.start]);

  const primaryLabel = call.status === "error"
    ? "Try again"
    : call.status === "ended"
      ? "Start another call"
      : callInProgress
        ? call.status === "connected" ? mobileViewOpen ? "Call in progress" : "End call" : "Connecting"
        : "Start a call";
  const primaryAction = call.status === "connected" && !mobileViewOpen ? call.end : startCall;
  const primaryDisabled = ["requesting_permission", "connecting", "ending"].includes(call.status) || (call.status === "connected" && mobileViewOpen);

  const clinicStatus = error
    ? "Clinic service unavailable"
    : loading
      ? "Checking clinic service"
      : "Clinic service available";

  function viewAppointment(appointmentId: string) {
    setSelectedAppointmentId(appointmentId);
    setActiveTab("appointments");
    setNotification(null);
  }

  return (
    <div className="app-shell">
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        mobileViewOpen={mobileViewOpen}
        onToggleMobileView={() => setMobileViewOpen((value) => !value)}
      />

      <main className={`page-content page-${activeTab}`}>
        {activeTab === "workspace" && (
          <div className={`workspace-layout ${mobileViewOpen ? "has-phone-view" : "is-centered"}`}>
            <section className="voice-workspace" aria-labelledby="workspace-title">
              <p className={`assistant-availability ${error ? "is-unavailable" : loading ? "is-checking" : ""}`} role="status">
                <span aria-hidden="true" />{clinicStatus}
              </p>

              <h1 className="editorial-heading" id="workspace-title">
                Healthcare,<br /><em>made human.</em>
              </h1>

              <VoiceOrb status={call.status} activity={call.activityState} levels={call.levels} />

              <div className="agent-identity">
                <span className="agent-monogram" aria-hidden="true">N</span>
                <div><strong>Ava assistant</strong><span>{callLabel(call.status)}</span></div>
              </div>

              {call.error && <p className="call-error-message" role="alert">{call.error}</p>}

              <div className="workspace-actions">
              <button className={`start-call-button ${call.status === "connected" && !mobileViewOpen ? "is-ending-action" : ""}`} type="button" onClick={primaryAction} disabled={primaryDisabled}>
                <Icon name={call.status === "connected" && !mobileViewOpen ? "phone-off" : "phone"} size={18} />
                {primaryLabel}
              </button>
              {call.status === "connected" && !mobileViewOpen && (
                <button className="workspace-mute-button" type="button" onClick={call.toggleMute} aria-pressed={call.muted}>
                  <Icon name={call.muted ? "mic-off" : "mic"} size={17} />{call.muted ? "Unmute" : "Mute"}
                </button>
              )}
              </div>

              <div className="workspace-divider" />
              <SessionInfo call={call} />

              {!mobileViewOpen && call.status !== "idle" && (
                <div className="workspace-live-transcript">
                  <Transcript lines={call.transcript} />
                </div>
              )}
            </section>

            {mobileViewOpen && (
              <CallWidget call={call} onStart={startCall} onClose={() => setMobileViewOpen(false)} />
            )}
          </div>
        )}

        {activeTab === "doctors" && (
          <DoctorsPanel
            doctors={doctors}
            loading={loading}
            bootstrapError={error}
            refreshKey={revision}
            onUpdated={() => void refresh()}
          />
        )}

        {activeTab === "appointments" && (
          <AppointmentsTable
            appointments={appointments}
            flash={flash}
            loading={loading}
            error={error}
            selectedAppointmentId={selectedAppointmentId}
            onSelectedAppointment={setSelectedAppointmentId}
          />
        )}
      </main>

      {notification && (
        <aside className="appointment-notification" role="status" aria-live="polite">
          <span className="notification-mark" aria-hidden="true"><Icon name="check" size={16} /></span>
          <span className="notification-copy"><strong>{notification.message}</strong><small>{notification.appointment.doctorName} · {notification.appointment.date} · {notification.appointment.time}</small></span>
          <button type="button" onClick={() => viewAppointment(notification.appointment.id)}>View appointment</button>
          <button className="notification-close" type="button" onClick={() => setNotification(null)} aria-label="Dismiss notification"><Icon name="close" size={16} /></button>
        </aside>
      )}
    </div>
  );
}
