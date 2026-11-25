import type { useCall } from "../hooks/useCall";
import { PhoneScreen } from "./PhoneScreen";

type Props = {
  call: ReturnType<typeof useCall>;
};

export function CallWidget({ call }: Props) {
  if (call.status === "idle") {
    return (
      <button className="call-launcher" type="button" onClick={call.open}>
        <span className="launcher-pulse" aria-hidden="true" />
        <span>
          <strong>Try Call</strong>
          <small>Book by voice</small>
        </span>
        <span className="launcher-arrow" aria-hidden="true">
          ↗
        </span>
      </button>
    );
  }

  return (
    <div className="phone-dock">
      <div className="phone-shell">
        <div className="phone-notch" aria-hidden="true" />
        <div className="phone-topbar">
          <span className="phone-carrier">Northstar</span>
          <span className="phone-signal" aria-hidden="true">
            ▮▮▮
          </span>
          <button className="phone-close" type="button" onClick={call.reset} aria-label="Close phone">
            ×
          </button>
        </div>
        <PhoneScreen call={call} onClose={call.reset} />
      </div>
    </div>
  );
}
