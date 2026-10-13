// Набор иконок в одном стиле: 16px сетка, штрих 1.5, скруглённые концы
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </Svg>
);
export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
    <path d="M13.5 2.5v3h-3" />
  </Svg>
);
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "currentColor" : "none"}>
    <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m3 8.5 3 3 7-7" />
  </Svg>
);
export const IconEyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M2 2l12 12" />
    <path d="M6.6 3.6A6.8 6.8 0 0 1 8 3.5c3.6 0 6 4.5 6 4.5a11 11 0 0 1-1.9 2.4M4.1 4.9C2.8 6 2 8 2 8s2.4 4.5 6 4.5c1 0 1.9-.3 2.7-.8" />
    <path d="M6.6 6.6a2 2 0 0 0 2.8 2.8" />
  </Svg>
);
export const IconUndo = (p: P) => (
  <Svg {...p}>
    <path d="M5 3 2 6l3 3" />
    <path d="M2 6h7.5a4 4 0 0 1 0 8H7" />
  </Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M9 2.5h4.5V7" />
    <path d="M13.5 2.5 7 9" />
    <path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
  </Svg>
);
export const IconSpark = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.5c.4 3.3 1.9 4.9 5.5 5.5-3.6.6-5.1 2.2-5.5 5.5-.4-3.3-1.9-4.9-5.5-5.5 3.6-.6 5.1-2.2 5.5-5.5Z" />
    <path d="M13 11.5v3M11.5 13h3" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);
export const IconArrowLeft = (p: P) => (
  <Svg {...p}>
    <path d="M13 8H3M7 4 3 8l4 4" />
  </Svg>
);
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
    <circle cx="10" cy="4.5" r="1.5" />
    <circle cx="6" cy="11.5" r="1.5" />
  </Svg>
);
export const IconGlobe = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2Z" />
  </Svg>
);
export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14Z" />
    <circle cx="8" cy="6.5" r="1.5" />
  </Svg>
);
export const IconWallet = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="4" width="12" height="9" rx="1.5" />
    <path d="M2 6.5h12M10.5 9.5h1" />
    <path d="M4 4 10.5 2l.5 2" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </Svg>
);
export const IconBriefcase = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="4.5" width="12" height="9" rx="1.5" />
    <path d="M5.5 4.5v-1a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1M2 8.5h12" />
  </Svg>
);
export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="m8 2 6 3.2-6 3.2-6-3.2Z" />
    <path d="m2 8.2 6 3.2 6-3.2M2 11 8 14.2 14 11" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const IconMinus = (p: P) => (
  <Svg {...p}>
    <path d="M3 8h10" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M8 2 14.5 13.5h-13Z" />
    <path d="M8 6.5v3M8 11.6v.1" />
  </Svg>
);
export const IconChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="m4 6 4 4 4-4" />
  </Svg>
);
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M2 8s2.4-4.5 6-4.5S14 8 14 8s-2.4 4.5-6 4.5S2 8 2 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);
export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6" />
  </Svg>
);
export const IconUser = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M3 13.5c.8-2.3 2.7-3.5 5-3.5s4.2 1.2 5 3.5" />
  </Svg>
);
export const IconKey = (p: P) => (
  <Svg {...p}>
    <circle cx="5.5" cy="10.5" r="3" />
    <path d="m7.6 8.4 5.9-5.9M11.5 4.5l1.5 1.5" />
  </Svg>
);
export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" r=".5" fill="currentColor" />
  </Svg>
);
export const IconWrench = (p: P) => (
  <Svg {...p}>
    <path d="M10.5 2a3.5 3.5 0 0 0-3.3 4.6L2.5 11.3a1.4 1.4 0 0 0 2 2l4.7-4.7A3.5 3.5 0 0 0 14 5.5l-2 2-2-.5-.5-2 2-2Z" />
  </Svg>
);
