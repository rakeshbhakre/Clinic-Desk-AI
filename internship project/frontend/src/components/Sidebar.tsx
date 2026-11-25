export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          N
        </div>
        <div>
          <div className="brand-name">Northstar</div>
          <div className="brand-sub">Clinic desk</div>
        </div>
      </div>

      <nav className="rail-nav" aria-label="Main">
        <button className="rail-item active" type="button">
          <span className="rail-icon" aria-hidden="true">
            ◫
          </span>
          Overview
        </button>
        <a className="rail-item" href="#appointments">
          <span className="rail-icon" aria-hidden="true">
            ▤
          </span>
          Appointments
        </a>
        <a className="rail-item" href="#doctors">
          <span className="rail-icon" aria-hidden="true">
            ✦
          </span>
          Doctors
        </a>
      </nav>

      <div className="rail-foot">
        <span className="pulse-dot" />
        <div>
          <div className="rail-foot-title">Voice desk</div>
          <div className="rail-foot-sub">WebRTC · Local</div>
        </div>
      </div>
    </aside>
  );
}
