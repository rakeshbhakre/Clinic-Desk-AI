import { useEffect, useRef } from "react";

import type { TranscriptLine } from "../lib/types";

type Props = {
  lines: TranscriptLine[];
};

export function Transcript({ lines }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [lines]);

  return (
    <div className="transcript" aria-live="polite">
      <div className="transcript-head">
        <span>Live transcript</span>
        <span>{lines.length} lines</span>
      </div>
      <div className="transcript-body">
        {lines.length === 0 ? (
          <p className="transcript-empty">Say hello when you&apos;re ready.</p>
        ) : (
          lines.slice(-16).map((line) => (
            <div className={`transcript-line ${line.role}`} key={line.id}>
              <span className="transcript-role">{line.role === "user" ? "You" : "Ava"}</span>
              <p>{line.text}</p>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
