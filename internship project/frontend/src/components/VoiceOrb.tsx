import type { CSSProperties } from "react";
import type { AgentActivityState, AudioLevels, CallStatus } from "../lib/types";

type Props = {
  status: CallStatus;
  activity: AgentActivityState;
  levels: AudioLevels;
};

export function VoiceOrb({ status, activity, levels }: Props) {
  const connected = status === "connected";
  const amplitude = connected
    ? Math.min(1, Math.max(0, activity === "speaking" ? levels.remote : levels.local))
    : 0;
  const visualState = status === "error"
    ? "error"
    : status === "requesting_permission" || status === "connecting"
      ? "connecting"
      : connected
        ? activity
        : status === "ended"
          ? "ended"
          : "idle";

  return (
    <div
      className="voice-orb"
      data-state={visualState}
      style={{ "--signal-level": amplitude } as CSSProperties}
      role="img"
      aria-label={connected ? `Voice signal, ${activity.replace("_", " ")}` : `Voice assistant ${visualState}`}
    >
      <svg viewBox="0 0 320 320" aria-hidden="true">
        <defs>
          <radialGradient id="orb-base" cx="32%" cy="25%" r="80%">
            <stop offset="0" stopColor="var(--phone-surface)" />
            <stop offset="0.68" stopColor="var(--phone-background)" />
            <stop offset="1" stopColor="var(--primary)" />
          </radialGradient>
          <clipPath id="orb-clip"><circle cx="160" cy="160" r="112" /></clipPath>
        </defs>
        <circle className="orb-orbit orb-orbit-solid" cx="160" cy="160" r="129" />
        <circle className="orb-orbit orb-orbit-dotted" cx="160" cy="160" r="139" />
        <g className="orb-core">
          <circle cx="160" cy="160" r="112" fill="url(#orb-base)" />
          <g className="orb-contours" clipPath="url(#orb-clip)">
            <path d="M30 130c27-52 71-70 112-57 35 11 34 50 66 51 29 1 48-33 82-22" />
            <path d="M24 151c35-42 68-48 98-35 39 17 35 56 68 62 34 6 61-28 102-18" />
            <path d="M22 176c39-27 68-28 94-10 33 23 36 50 67 58 41 10 70-18 109-10" />
            <path d="M39 207c36-17 65-11 85 10 22 24 41 37 71 37 33 0 54-18 90-15" />
            <path d="M64 94c26 18 48 22 71 15 27-8 45-27 73-28 20-1 38 6 55 19" />
          </g>
          <circle className="orb-center" cx="160" cy="160" r="3" />
        </g>
        <circle className="orb-orbit-dot" cx="160" cy="21" r="2.5" />
      </svg>
    </div>
  );
}
