import { Icon } from "./Icon";

export type WorkspaceTab = "workspace" | "doctors" | "appointments";

type Props = {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  mobileViewOpen: boolean;
  onToggleMobileView: () => void;
};

const tabs: { id: WorkspaceTab; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "doctors", label: "Doctors" },
  { id: "appointments", label: "Appointments" },
];

function BrandMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="brand-mark">
      <circle cx="20" cy="20" r="17" />
      <path d="M8 20h6l2.2-5.8L20 26l3.4-9 2.1 3H32" />
    </svg>
  );
}

export function AppHeader({ activeTab, onTabChange, mobileViewOpen, onToggleMobileView }: Props) {
  return (
    <header className="app-header">
      <a className="brand" href="#workspace" onClick={(event) => { event.preventDefault(); onTabChange("workspace"); }}>
        <BrandMark />
        <span className="brand-copy"><strong>Nexov-AI</strong><small>Clinic</small></span>
      </a>

      <nav className="primary-navigation" aria-label="Main navigation">
        {tabs.map((tab) => (
          <button
            className={`navigation-tab ${activeTab === tab.id ? "is-active" : ""}`}
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <button
        className={`mobile-view-toggle ${mobileViewOpen ? "is-active" : ""}`}
        type="button"
        onClick={onToggleMobileView}
        aria-pressed={mobileViewOpen}
        aria-label={`${mobileViewOpen ? "Hide" : "Show"} mobile view`}
      >
        <Icon name="smartphone" size={17} />
        <span>Mobile view</span>
      </button>
    </header>
  );
}
