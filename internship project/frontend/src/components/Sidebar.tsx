import { useEffect, useRef } from "react";

import { Icon } from "./Icon";

type Section = "overview" | "doctors" | "appointments";

type Props = {
  activeSection: Section;
  open: boolean;
  onNavigate: () => void;
  agentReady: boolean;
};

const links: { id: Section; label: string; icon: "overview" | "doctor" | "calendar" }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "doctors", label: "Doctors", icon: "doctor" },
  { id: "appointments", label: "Appointments", icon: "calendar" },
];

function BrandMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 36 36" className="brand-mark">
      <path d="M5 18h7l2.6-7 5.1 14 3.1-8H31" />
      <circle cx="30" cy="18" r="1.4" />
    </svg>
  );
}

export function Sidebar({ activeSection, open, onNavigate, agentReady }: Props) {
  const sidebarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const sidebar = sidebarRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => sidebar?.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])",
    );
    focusable()?.[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onNavigate();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(focusable() ?? []);
      if (items.length === 0) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, onNavigate]);

  return (
    <>
      {open && <button className="sidebar-scrim" type="button" aria-label="Close navigation" onClick={onNavigate} />}
      <aside
        ref={sidebarRef}
        id="sidebar-navigation"
        className={`sidebar ${open ? "sidebar--open" : ""}`}
        role={open ? "dialog" : undefined}
        aria-label="Main navigation"
        aria-modal={open || undefined}
      >
        <a className="brand" href="#overview" onClick={onNavigate} aria-label="Nexov-AI Clinic overview">
          <BrandMark />
          <span className="brand-copy">
            <strong>Nexov-AI</strong>
            <small>Clinic workspace</small>
          </span>
        </a>

        <nav className="rail-nav" aria-label="Main navigation">
          <p className="rail-heading">Workspace</p>
          {links.map((link) => (
            <a
              className={`rail-item ${activeSection === link.id ? "active" : ""}`}
              href={`#${link.id}`}
              key={link.id}
              onClick={onNavigate}
              aria-current={activeSection === link.id ? "page" : undefined}
            >
              <Icon name={link.icon} size={17} />
              <span>{link.label}</span>
            </a>
          ))}
        </nav>

        <div className="rail-foot">
          <span className={`agent-indicator ${agentReady ? "is-ready" : "is-offline"}`} />
          <div>
            <strong>Voice service</strong>
            <small>{agentReady ? "Backend available" : "Backend unavailable"}</small>
          </div>
        </div>
      </aside>
    </>
  );
}
