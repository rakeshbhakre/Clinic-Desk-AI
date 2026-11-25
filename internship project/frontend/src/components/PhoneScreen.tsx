import { useEffect, useRef, useState } from "react";

import type { useCall } from "../hooks/useCall";
import { formatDuration, maskPhone } from "../lib/phone";
import { AgentActivity } from "./AgentActivity";
import { BookingCard } from "./BookingCard";
import { Icon } from "./Icon";
import { PreCallSheet } from "./PreCallSheet";
import { Transcript } from "./Transcript";
import { Waveform } from "./Waveform";

type Call = ReturnType<typeof useCall>;
type Props = { call: Call; onClose: () => void };

const statusLabel: Record<Call["status"], string> = {
  idle: "Ready",
  precall: "Ready",
  requesting_permission: "Microphone access",
  connecting: "Connecting",
  connected: "Connected",
  ending: "Ending call",
  ended: "Call ended",
  error: "Connection issue",
};

const activityLabel = {
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  executing_tool: "Checking records",
} as const;

export function PhoneScreen({ call, onClose }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [mobileDialog, setMobileDialog] = useState(false);
  const pending = ["requesting_permission", "connecting", "ending"].includes(call.status);
  const connected = call.status === "connected";
  const person = call.callerName || (call.verifiedPhone ? maskPhone(call.verifiedPhone) : "Caller");

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setMobileDialog(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileDialog) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ["precall", "ended", "error"].includes(call.status)) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileDialog, call.status, onClose]);

  return (
    <aside
      className="call-panel"
      ref={panelRef}
      role="dialog"
      aria-labelledby="call-dialog-title"
      aria-modal={mobileDialog || undefined}
      tabIndex={mobileDialog ? -1 : undefined}
    >
      <header className="call-panel-header">
        <div className="call-panel-brand">
          <span className="call-brand-mark" aria-hidden="true">N</span>
          <span><strong id="call-dialog-title">Voice assistant</strong><small>Nexov-AI Clinic</small></span>
        </div>
        <span className={`call-connection ${connected ? "is-connected" : call.status === "error" ? "is-error" : ""}`}>
          <span />{statusLabel[call.status]}
        </span>
        {(call.status === "precall" || call.status === "ended" || call.status === "error") && (
          <button className="icon-button call-close" type="button" onClick={onClose} aria-label="Close call panel">
            <Icon name="close" size={17} />
          </button>
        )}
      </header>

      {call.status === "precall" ? (
        <PreCallSheet onContinue={call.start} onCancel={onClose} />
      ) : (
        <div className="call-panel-content">
          <section className={`call-presence ${connected ? `activity-${call.activityState}` : ""}`}>
            <div className="call-presence-top">
              <div>
                <span className="call-eyebrow">{connected ? activityLabel[call.activityState] : statusLabel[call.status]}</span>
                <h2>{connected ? person : call.status === "error" ? "Call unavailable" : call.status === "ended" ? "Conversation complete" : "Preparing the line"}</h2>
                <p>{call.verifiedPhone ? `Confirmed · ${maskPhone(call.verifiedPhone)}` : call.proposedPhone ? "Number awaiting confirmation" : "Caller number not confirmed"}</p>
              </div>
              <time className="call-timer" dateTime={`PT${call.seconds}S`}>{formatDuration(call.seconds)}</time>
            </div>
            <Waveform levels={call.levels} active={connected} activity={call.activityState} />
            {pending && <p className="call-status-hint">{call.status === "requesting_permission" ? "Allow microphone access to continue." : call.status === "ending" ? "Disconnecting from the voice agent…" : "Establishing an audio connection…"}</p>}
          </section>

          {call.error && (
            <div className="call-error" role="alert">
              <span>{call.error}</span>
              <button type="button" onClick={() => { call.reset(); call.open(); }}>Try again</button>
            </div>
          )}

          {call.confirmation && <BookingCard appointment={call.confirmation} />}

          <AgentActivity items={call.activity} />
          <Transcript lines={call.transcript} />

          {connected ? (
            <div className="call-controls">
              <button
                type="button"
                className={`call-control ${call.muted ? "is-muted" : ""}`}
                onClick={call.toggleMute}
                aria-pressed={call.muted}
              >
                <Icon name={call.muted ? "mic-off" : "mic"} />
                {call.muted ? "Unmute" : "Mute"}
              </button>
              <button type="button" className="call-control end-call" onClick={call.end}>
                <Icon name="phone-off" />
                End call
              </button>
            </div>
          ) : call.status === "ended" ? (
            <div className="call-end-summary">
              <div><span>Duration</span><strong>{formatDuration(call.seconds)}</strong></div>
              <div><span>Booked</span><strong>{call.bookedCount}</strong></div>
              <div><span>Cancelled</span><strong>{call.cancelledCount}</strong></div>
              <button type="button" className="call-primary-action" onClick={() => { call.reset(); call.open(); }}>
                Call again
              </button>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  );
}
