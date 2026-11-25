import type { ReactNode } from "react";

type IconName =
  | "overview"
  | "calendar"
  | "doctor"
  | "phone"
  | "menu"
  | "close"
  | "chevron-left"
  | "chevron-right"
  | "mic"
  | "mic-off"
  | "phone-off"
  | "check"
  | "clock"
  | "filter";

type Props = { name: IconName; size?: number; className?: string };

const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  doctor: <><path d="M7 3v5a5 5 0 0 0 10 0V3" /><path d="M7 5H5a2 2 0 1 1 2-2M17 5h2a2 2 0 1 0-2-2" /><path d="M12 13v2a4 4 0 0 0 8 0v-1" /><circle cx="20" cy="12" r="1" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.8L7.7 9.6a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 1.8-.6l2.8.5a2 2 0 0 1 1.7 2.7Z" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  "chevron-left": <><path d="m15 18-6-6 6-6" /></>,
  "chevron-right": <><path d="m9 18 6-6-6-6" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
  "mic-off": <><path d="m2 2 20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9V5a3 3 0 0 0-5.7-1.3M5 10v2a7 7 0 0 0 11.7 5.2M19 10v2a7 7 0 0 1-.3 2M12 19v3M8 22h8" /></>,
  "phone-off": <><path d="m3 3 18 18M8.8 5.2a2 2 0 0 1 .3 1.3l.5 2.8a2 2 0 0 1-.6 1.8L7.7 12.4a16 16 0 0 0 4.1 4.1l1.3-1.3a2 2 0 0 1 1.8-.6l2.8.5a2 2 0 0 1 1.3.3M15.8 2.1l2.1.4a2 2 0 0 1 1.7 2.7v2" /><path d="M2.1 4.2A2 2 0 0 1 4.1 2h2" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  filter: <><path d="M4 7h16M7 12h10m-7 5h4" /><circle cx="8" cy="7" r="1" /><circle cx="14" cy="12" r="1" /><circle cx="10" cy="17" r="1" /></>,
};

export function Icon({ name, size = 18, className }: Props) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
