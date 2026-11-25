import type { useCall } from "../hooks/useCall";
import { PhoneScreen } from "./PhoneScreen";

type Props = { call: ReturnType<typeof useCall>; onStart: () => void; onClose: () => void };

export function CallWidget({ call, onStart, onClose }: Props) {
  return <PhoneScreen call={call} onStart={onStart} onClose={onClose} />;
}
