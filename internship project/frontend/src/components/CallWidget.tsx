import type { useCall } from "../hooks/useCall";
import { PhoneScreen } from "./PhoneScreen";

type Props = { call: ReturnType<typeof useCall> };

export function CallWidget({ call }: Props) {
  if (call.status === "idle") return null;
  return <PhoneScreen call={call} onClose={call.reset} />;
}
