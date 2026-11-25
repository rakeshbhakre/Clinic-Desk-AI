import { useEffect, useState, type FormEvent } from "react";

import { formatPhone, normalizePhone } from "../lib/phone";

const STORAGE_KEY = "northstar.recentNumbers";

type Props = {
  onContinue: (phone: string) => void;
  onCancel: () => void;
};

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function PreCallSheet({ onContinue, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  function submit(event: FormEvent) {
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
      <div className="precall-icon" aria-hidden="true">
        ›
      </div>
      <p className="eyebrow">Before we connect</p>
      <h3>Who&apos;s calling?</h3>
      <p className="precall-copy">
        Enter any number to call from. Our agent reads it back and asks you to confirm out loud.
      </p>

      <form onSubmit={submit}>
        <label htmlFor="caller-number">Caller number</label>
        <input
          id="caller-number"
          type="tel"
          autoComplete="tel"
          value={value}
          placeholder="+1 (415) 555-0132"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          autoFocus
        />
        {error && <p className="field-error">{error}</p>}

        {recent.length > 0 && (
          <div className="recent-numbers">
            <span>Recent</span>
            {recent.map((item) => (
              <button type="button" key={item} onClick={() => setValue(item)}>
                {formatPhone(item)}
              </button>
            ))}
          </div>
        )}

        <button className="primary-action" type="submit">
          Continue to call
        </button>
        <button className="ghost-action" type="button" onClick={onCancel}>
          Not now
        </button>
      </form>
    </div>
  );
}
