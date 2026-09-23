import type { CSSProperties } from "react";

const paths: Record<string, React.ReactNode> = {
  board: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16M15 4v16M6 8h0M12 8h0M18 8h0" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" />
      <path d="m20 2 .7 1.3L22 4l-1.3.7L20 6l-.7-1.3L18 4l1.3-.7Z" />
    </>
  ),
  routine: (
    <>
      <path d="M20 8a8 8 0 0 0-14-2L3 9m0-5v5h5M4 16a8 8 0 0 0 14 2l3-3m0 5v-5h-5" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  skill: (
    <>
      <path d="M12 5C8 2 4 4 3 5v15c4-3 7-1 9 0 2-1 5-3 9 0V5c-1-1-5-3-9 0Zm0 0v15" />
      <path d="M6 8h3M6 12h3m6-4h3m-3 4h3" />
    </>
  ),
  history: (
    <>
      <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2" />
    </>
  ),
  plug: (
    <>
      <path d="m8 3 3 3m5-3 3 3M7 9l8-6 6 6-7 7a5 5 0 0 1-7-7Zm0 7-4 5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  filter: (
    <>
      <path d="M4 7h16M7 12h10M10 17h4" />
      <circle cx="8" cy="7" r="1.5" fill="currentColor" />
      <circle cx="15" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14M16 5v14" strokeWidth="3" />
    </>
  ),
  play: <path d="m8 4 12 8-12 8V4Z" />,
  edit: (
    <>
      <path d="m14 4 6 6M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z" />
    </>
  ),
  external: (
    <>
      <path d="M13 3h8v8M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    </>
  ),
  send: (
    <>
      <path d="m21 3-7 18-4-7-7-4L21 3ZM10 14 21 3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  chat: (
    <>
      <path d="M21 11a8 8 0 0 1-8 8H7l-4 3 1-6A9 9 0 1 1 21 11Z" />
      <path d="M8 9h8m-8 4h5" />
    </>
  ),
};
export function OrbitIcon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
