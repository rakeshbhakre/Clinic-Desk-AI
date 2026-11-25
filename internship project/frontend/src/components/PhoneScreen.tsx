import { formatDuration, maskPhone } from "../lib/phone";
import type { useCall } from "../hooks/useCall";
import { BookingCard } from "./BookingCard";
import { AgentActivity } from "./AgentActivity";
import { Icon } from "./Icon";
import { Transcript } from "./Transcript";
import { Waveform } from "./Waveform";

type Call = ReturnType<typeof useCall>;
type Props = { call: Call; onStart: () => void; onClose: () => void };

function callState(call: Call) {
  if (call.status === "requesting_permission") return "Microphone access";
  if (call.status === "connecting") return "Connecting";
  if (call.status === "connected") return call.activityState === "executing_tool" ? "Working" : call.activityState[0].toUpperCase() + call.activityState.slice(1);
  if (call.status === "ending") return "Ending call";
  if (call.status === "ended") return "Call ended";
  if (call.status === "error") return "Connection issue";
  return "Ready";
}

export function PhoneScreen({ call, onStart, onClose }: Props) {
  const connected = call.status === "connected";
  const pending = ["requesting_permission", "connecting", "ending"].includes(call.status);

  return (
    <aside className={`phone-device ${connected ? `phone-${call.activityState}` : ""}`} aria-label="Ava voice call">
      <div className="phone-camera" aria-hidden="true"><span /></div>
      <div className="phone-screen">
        <header className="phone-header">
          <div className="phone-agent-mark" aria-hidden="true">N</div>
          <div className="phone-agent-copy"><strong>Ava</strong><span>Nexov-AI Clinic</span></div>
          <span className={`phone-status-dot ${call.status === "error" ? "is-error" : connected ? "is-connected" : ""}`} aria-hidden="true" />
          <button className="phone-hide-button" type="button" onClick={onClose} aria-label="Hide mobile view"><Icon name="close" size={17} /></button>
        </header>

        <section className="phone-call-summary" aria-label="Call status and duration">
          <div><span className="phone-overline">{callState(call)}</span><strong>{connected ? "Ava is here" : call.status === "error" ? "Call unavailable" : "Voice assistant"}</strong><span>{call.verifiedPhone ? `Confirmed · ${maskPhone(call.verifiedPhone)}` : "Contact number not confirmed"}</span></div>
          <time className="phone-timer" dateTime={`PT${call.seconds}S`}>{formatDuration(call.seconds)}</time>
        </section>

        <Waveform levels={call.levels} active={connected} activity={call.activityState} />
        <div className="phone-divider" />

        <div className="phone-conversation">
          {call.error && <p className="phone-error" role="alert">{call.error}</p>}
          {call.confirmation && <BookingCard appointment={call.confirmation} />}
          {call.cancellation && <BookingCard appointment={call.cancellation} cancelled />}
          {call.activity.length > 0 && <details className="phone-activity"><summary>Verified session activity <span>{call.activity.length}</span></summary><AgentActivity items={call.activity} /></details>}
          <Transcript lines={call.transcript} />
        </div>

        <div className="phone-controls">
          {connected ? (
            <>
              <button type="button" className={`phone-control ${call.muted ? "is-muted" : ""}`} onClick={call.toggleMute} aria-pressed={call.muted}>
                <Icon name={call.muted ? "mic-off" : "mic"} size={19} />{call.muted ? "Unmute" : "Mute"}
              </button>
              <button type="button" className="phone-control phone-end-call" onClick={call.end}>
                <Icon name="phone-off" size={19} />End call
              </button>
            </>
          ) : call.status === "error" || call.status === "ended" || call.status === "idle" ? (
            <button type="button" className="phone-control phone-start-call" onClick={onStart}>
              <Icon name="phone" size={18} />{call.status === "error" ? "Try again" : call.status === "ended" ? "Call again" : "Start a call"}
            </button>
          ) : (
            <p className="phone-connecting" role="status">{callState(call)}{pending ? "…" : ""}</p>
          )}
        </div>
      </div>
      <div className="phone-home-indicator" aria-hidden="true" />
    </aside>
  );
}
