import { useEffect, useState, type FormEvent } from "react";

import { formatPhone, normalizePhone } from "../lib/phone";

const STORAGE_KEY = "northstar.recentNumbers";

type Props = {
  onContinue: (phone: string) => void;
  onCancel: () => void;
};

function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").slice(0, 3)
      : [];
  } catch {
    return [];
  }
}

export function PreCallSheet({ onContinue, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRecent(readRecent()), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const digits = normalizePhone(value);
      const next = [digits, ...recent.filter((item) => item !== digits)].slice(0, 3);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecent(next);
      onContinue(digits);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid number.");
    }
  }

  return (
    <div className="precall-sheet">
      <div className="precall-mark" aria-hidden="true">N</div>
      <p className="call-eyebrow">Before we connect</p>
      <h2>Start a call</h2>
      <p className="precall-copy">
        Enter a number to use. The agent will ask you to confirm it without reading the digits aloud.
      </p>

      <form onSubmit={submit}>
        <label className="call-field-label" htmlFor="caller-number">Caller number</label>
        <input
          className="call-input"
          id="caller-number"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          value={value}
          placeholder="+1 (415) 555-0132"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          autoFocus
          required
        />
        {error && <p className="call-form-error" role="alert">{error}</p>}

        {recent.length > 0 && (
          <div className="recent-numbers">
            <span>Recent numbers</span>
            {recent.map((item) => (
              <button type="button" key={item} onClick={() => setValue(item)}>
                {formatPhone(item)}
              </button>
            ))}
          </div>
        )}

        <button className="call-primary-action" type="submit">Continue</button>
        <button className="call-quiet-action" type="button" onClick={onCancel}>Cancel</button>
      </form>
    </div>
  );
}
