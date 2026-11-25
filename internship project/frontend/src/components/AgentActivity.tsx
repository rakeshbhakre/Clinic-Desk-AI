import type { AgentActivityItem } from "../lib/types";

type Props = { items: AgentActivityItem[] };

export function AgentActivity({ items }: Props) {
  return (
    <section className="agent-activity" aria-labelledby="activity-title">
      <header>
        <h3 id="activity-title">Activity</h3>
        <span>Session</span>
      </header>
      {items.length === 0 ? (
        <p className="activity-empty">Verified actions will appear here.</p>
      ) : (
        <ol className="activity-list" aria-live="polite" aria-relevant="additions">
          {items.slice(-4).map((item) => (
            <li className={`activity-item activity-${item.kind}`} key={item.id}>
              <span className="activity-marker" aria-hidden="true" />
              <div>
                <strong>{item.label}</strong>
                {item.detail && <span>{item.detail}</span>}
              </div>
              <time dateTime={new Date(item.at).toISOString()}>
                {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(item.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
