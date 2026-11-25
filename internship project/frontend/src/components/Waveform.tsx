import type { AudioLevels, AgentActivityState } from "../lib/types";

type Props = {
  levels: AudioLevels;
  active: boolean;
  activity: AgentActivityState;
};

const BARS = Array.from({ length: 32 }, (_, index) => {
  const center = Math.abs((index - 15.5) / 15.5);
  return 0.24 + (1 - center) * 0.54 + Math.abs(Math.sin(index * 0.71)) * 0.22;
});

export function Waveform({ levels, active, activity }: Props) {
  const amplitude = active ? Math.min(1, Math.max(0, Math.max(levels.local, levels.remote))) : 0;
  return (
    <div
      className={`audio-waveform ${active ? "is-active" : ""} state-${activity}`}
      role="img"
      aria-label={active ? `Audio level visualization, ${activity.replace("_", " ")}` : "Audio visualization idle"}
    >
      {BARS.map((shape, index) => (
        <span
          key={index}
          style={{ height: `${2 + amplitude * shape * 34}px` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
