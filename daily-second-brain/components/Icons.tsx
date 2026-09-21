import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  brain:
    "M12 4c-3-5-8 0-6 3-5 1-4 7-1 8-1 5 5 7 7 3m0-14c3-5 8 0 6 3 5 1 4 7 1 8 1 5-5 7-7 3V4M8 8l4 3 4-3M8 16l4-3 4 3",
  home: "m3 10 9-7 9 7v10H3V10m6 10v-7h6v7",
  graph:
    "M9 5h6M7 8l-3 9m13-9 3 9M7 20h10M9 7l7 11M15 7 8 18M9 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0m12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0M7 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0m16 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  inbox: "M4 4h16l2 13v3H2v-3L4 4m-2 11h6l2 3h4l2-3h6",
  book: "M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1v16",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7",
  chat: "M21 11a9 9 0 0 1-9 9H4l-3 2 2-6a9 9 0 1 1 18-5M7 10h10M7 14h6",
  plug: "m8 3 3 3m4-5 3 3m-9 1 8 8m-9-8-3 3a5 5 0 0 0 7 7l3-3M6 15l-4 4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  plus: "M12 4v16M4 12h16",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  close: "m6 6 12 12M6 18 18 6",
  send: "m3 3 19 9-19 9 4-9-4-9m4 9h15",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5m-4 6v1a7 7 0 0 0 14 0v-1m-7 8v3m-4 0h8",
  volume: "M11 3 5 8H2v8h3l6 5V3m4 5a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  file: "M5 2h9l5 5v15H5V2m9 0v6h5M8 12h8m-8 4h6",
  check: "m4 12 5 5L20 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v5l3 2",
  link: "m9 8 4-4a5 5 0 0 1 7 7l-4 4m-1 1-4 4a5 5 0 0 1-7-7l4-4m0 6 8-8",
  edit: "m15 3 6 6-12 12H3v-6L15 3m-3 3 6 6",
  logout: "M9 3H3v18h6m6-15 6 6-6 6M7 12h14",
  chevron: "m9 5 7 7-7 7",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0-6v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4m-5 10 3 3 6-6",
  menu: "M3 6h18M3 12h18M3 18h18",
  minus: "M4 12h16",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5",
  refresh: "M20 7a9 9 0 1 0 1 8m-1-13v6h-6",
  zap: "m13 2-9 12h7l-1 8 10-13h-8l1-7",
  dots: "M5 12h1m5 0h1m5 0h1",
};
export function Icon({
  name,
  size = 20,
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
      style={style}
      aria-hidden="true"
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  );
}
