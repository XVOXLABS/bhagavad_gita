import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

/** 24px line icons with one stroke weight, so every control reads as one family. */
function Line({ title, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      {...props}
    >
      {children}
    </svg>
  );
}

export const MicIcon = (props: IconProps) => (
  <Line {...props}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Line>
);

export const SendIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Line>
);

export const StopIcon = (props: IconProps) => (
  <Line {...props}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
  </Line>
);

export const BookmarkIcon = ({ filled, ...props }: IconProps & { filled?: boolean }) => (
  <Line {...props}>
    <path d="M6 4h12v17l-6-4-6 4z" fill={filled ? 'currentColor' : 'none'} />
  </Line>
);

export const ShareIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M12 15V3M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </Line>
);

export const VolumeIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M4 10v4h4l5 4V6L8 10z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </Line>
);

export const SlidersIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Line>
);

export const NewChatIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z" />
  </Line>
);

export const CloseIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Line>
);

export const BackIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M15 5l-7 7 7 7" />
  </Line>
);

export const SunIcon = (props: IconProps) => (
  <Line {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Line>
);

export const BookIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </Line>
);

export const RainIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 0 7z" />
    <path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" />
  </Line>
);

export const FlameIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3 0-3 0-5.5.5-8z" />
  </Line>
);

export const CompassIcon = (props: IconProps) => (
  <Line {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </Line>
);

export const ChevronIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M9 6l6 6-6 6" />
  </Line>
);

export const LinkIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Line>
);

/** A small oil lamp (diya) for the daily practice. */
export const DiyaIcon = (props: IconProps) => (
  <Line {...props}>
    <path d="M3 13c2 4 6 5 9 5s7-1 9-5z" />
    <path d="M12 3c1.2 1.6 2 2.8 2 4.2A2 2 0 0 1 12 9.5a2 2 0 0 1-2-2.3C10 5.8 10.8 4.6 12 3z" fill="currentColor" stroke="none" />
    <path d="M12 9.5v3" />
  </Line>
);

/** A stylised peacock feather: quill, barbs, and the eye in green, gold, teal and blue. */
export function PeacockFeather({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 96" className={className} {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}>
      <defs>
        <radialGradient id="feather-eye" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#14306b" />
          <stop offset="38%" stopColor="#1f5fa8" />
          <stop offset="55%" stopColor="#3cb4ad" />
          <stop offset="75%" stopColor="#e2b75c" />
          <stop offset="100%" stopColor="#2f7d5b" />
        </radialGradient>
      </defs>
      <path d="M24 94 C 23.5 72, 24.5 52, 24 30" stroke="#e2b75c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <g stroke="#4fae84" strokeWidth="0.8" opacity="0.55" fill="none" strokeLinecap="round">
        <path d="M24 86 C 17 81, 11 75, 7 67" />
        <path d="M24 86 C 31 81, 37 75, 41 67" />
        <path d="M24 74 C 16 69, 10 62, 6 53" />
        <path d="M24 74 C 32 69, 38 62, 42 53" />
        <path d="M24 62 C 17 58, 12 52, 9 45" />
        <path d="M24 62 C 31 58, 36 52, 39 45" />
      </g>
      <ellipse cx="24" cy="26" rx="16" ry="22" fill="#2f7d5b" opacity="0.85" />
      <ellipse cx="24" cy="27" rx="12.5" ry="17" fill="url(#feather-eye)" />
      <ellipse cx="24" cy="29" rx="4.2" ry="5.8" fill="#0d1d4a" />
    </svg>
  );
}

export function Lotus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 32" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M32 4 C 26 12, 26 20, 32 28 C 38 20, 38 12, 32 4 Z" />
        <path d="M32 28 C 24 26, 17 20, 15 10 C 23 12, 29 18, 32 28 Z" />
        <path d="M32 28 C 40 26, 47 20, 49 10 C 41 12, 35 18, 32 28 Z" />
        <path d="M32 28 C 22 29, 12 26, 5 19 C 15 18, 25 22, 32 28 Z" />
        <path d="M32 28 C 42 29, 52 26, 59 19 C 49 18, 39 22, 32 28 Z" />
      </g>
    </svg>
  );
}

/** Krishna's mark: the feather inside a soft gold halo. Used for the logo and the reply avatar. */
export function KrishnaMark({ className }: { className?: string }) {
  return (
    <span className={`krishna-mark ${className ?? ''}`} aria-hidden="true">
      <PeacockFeather className="krishna-mark-feather" />
    </span>
  );
}
