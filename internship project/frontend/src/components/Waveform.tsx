import type { AudioLevels } from "../lib/types";

type Props = {
  levels: AudioLevels;
  active: boolean;
};

const BARS = [0.42, 0.68, 0.5, 0.86, 0.58, 0.74, 0.36, 0.62, 0.9, 0.48, 0.7, 0.4, 0.78, 0.54, 0.64, 0.34];

export function Waveform({ levels, active }: Props) {
  const energy = active ? Math.max(levels.local, levels.remote) : 0;

  return (
    <div className={`waveform ${active ? "is-active" : ""}`} aria-hidden="true">
      {BARS.map((base, index) => {
        const offset = Math.sin(index * 1.7 + energy * 8) * 0.18;
        const height = Math.min(1, Math.max(0.16, base * (0.36 + energy * 0.9) + offset));
        return <span key={index} style={{ height: `${height * 100}%` }} />;
      })}
    </div>
  );
}
