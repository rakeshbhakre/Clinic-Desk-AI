import { useLayoutEffect, useRef } from "react";

import type { TranscriptLine } from "../lib/types";

type Props = { lines: TranscriptLine[] };

function timestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(value);
}

export function Transcript({ lines }: Props) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const nearBottom = useRef(true);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body && nearBottom.current) body.scrollTop = body.scrollHeight;
  }, [lines]);

  return (
    <section className="transcript" aria-labelledby="transcript-title">
      <header className="transcript-heading">
        <h3 id="transcript-title">Live transcript</h3>
        <span>{lines.length === 0 ? "Waiting for speech" : `${lines.length} ${lines.length === 1 ? "line" : "lines"}`}</span>
      </header>
      <div
        className="transcript-body"
        ref={bodyRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={(event) => {
          const target = event.currentTarget;
          nearBottom.current = target.scrollHeight - target.scrollTop - target.clientHeight < 48;
        }}
      >
        {lines.length === 0 ? (
          <p className="transcript-empty">The conversation will appear here.</p>
        ) : (
          lines.map((line) => (
            <article className={`transcript-line ${line.role} ${line.final ? "" : "is-interim"}`} key={line.id}>
              <div className="transcript-meta">
                <span>{line.role === "user" ? "You" : "Nexov-AI"}</span>
                <time dateTime={new Date(line.at).toISOString()}>{timestamp(line.at)}</time>
              </div>
              <p>{line.text}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
