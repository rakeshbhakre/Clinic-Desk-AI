import type { useCall } from "../hooks/useCall";
import { formatDuration } from "../lib/phone";
import { BookingCard } from "./BookingCard";
import { PreCallSheet } from "./PreCallSheet";
import { Transcript } from "./Transcript";
import { Waveform } from "./Waveform";

type Call = ReturnType<typeof useCall>;

type Props = {
  call: Call;
  onClose: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  ringing: "Ringing",
  connecting: "Connecting",
  connected: "Connected",
  ended: "Call ended",
  error: "Call failed",
};

export function PhoneScreen({ call, onClose }: Props) {
  if (call.status === "precall") {
    return (
      <div className="phone-body">
        <PreCallSheet onContinue={(phone) => void call.start(phone)} onCancel={onClose} />
      </div>
    );
  }

  if (call.status === "ringing" || call.status === "connecting") {
    const isRinging = call.status === "ringing";
    return (
      <div className="phone-body connecting-body">
        <div className="connecting-mark">
          <div className={`pulse-ring ${isRinging ? "" : "spin"}`} />
          <div className="phone-avatar large">N</div>
        </div>
        <p className="eyebrow">{STATUS_LABEL[call.status]}</p>
        <h3>{isRinging ? "Calling Voice Desk" : "Opening the line"}</h3>
        <p className="connecting-number">{call.proposedPhone}</p>
        <p className="connecting-hint">Keep this window in focus. Microphone access may appear.</p>
        <button className="end-call wide" type="button" onClick={call.end}>
          Cancel
        </button>
      </div>
    );
  }

  const isConnected = call.status === "connected";

  return (
    <div className="phone-body call-body">
      <div className="call-header">
        <div className="phone-avatar">A</div>
        <div className="call-identity">
          <div className="call-name">Voice Desk</div>
          <div className={`call-number ${call.verifiedPhone ? "verified" : ""}`}>
            {call.callerName ? `${call.callerName} · ` : ""}
            {call.verifiedPhone
              ? `Verified ${call.verifiedPhone}`
              : `Calling as ${call.proposedPhone ?? "your number"} · unconfirmed`}
          </div>
        </div>
        <div className="call-timer">{formatDuration(call.seconds)}</div>
      </div>

      <div className="call-status-line">
        <span className={`live-dot ${isConnected ? "" : "off"}`} />
        {STATUS_LABEL[call.status]}
      </div>

      <Waveform levels={call.levels} active={isConnected} />

      {call.confirmation && <BookingCard appointment={call.confirmation} />}

      {call.error && <div className="call-error">{call.error}</div>}

      <Transcript lines={call.transcript} />

      {isConnected ? (
        <div className="call-controls">
          <button
            type="button"
            className={`control-button ${call.muted ? "muted" : ""}`}
            onClick={call.toggleMute}
          >
            <span aria-hidden="true">{call.muted ? "⊘" : "◉"}</span>
            {call.muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" className="control-button end-call" onClick={call.end}>
            <span aria-hidden="true">■</span>
            End
          </button>
        </div>
      ) : (
        <div className="ended-summary">
          <div className="summary-row">
            <span>Duration</span>
            <strong>{formatDuration(call.seconds)}</strong>
          </div>
          <div className="summary-row">
            <span>Booked</span>
            <strong>{call.bookedCount}</strong>
          </div>
          <div className="summary-row">
            <span>Cancelled</span>
            <strong>{call.cancelledCount}</strong>
          </div>
          <button className="primary-action" type="button" onClick={call.reset}>
            Call again
          </button>
        </div>
      )}
    </div>
  );
}
