import type { SVGProps } from "react";
export type FlowIconName =
  | "idea"
  | "image"
  | "video"
  | "transform"
  | "output"
  | "plus"
  | "share"
  | "download"
  | "trash"
  | "branch"
  | "duplicate"
  | "more"
  | "check"
  | "close"
  | "expand"
  | "chevron";
const paths: Record<FlowIconName, React.ReactNode> = {
  idea: (
    <path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z" />
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </>
  ),
  video: <path d="m6 3 15 9-15 9V3Z" />,
  transform: (
    <>
      <path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5" />
    </>
  ),
  output: (
    <>
      <path d="M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
  share: (
    <>
      <path d="M12 15V3m-4 4 4-4 4 4M5 11H3v10h18V11h-2" />
    </>
  ),
  download: <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />,
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  branch: (
    <>
      <circle cx="5" cy="12" r="3" />
      <circle cx="19" cy="5" r="3" />
      <circle cx="19" cy="19" r="3" />
      <path d="m8 11 8-5m-8 7 8 5" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
};
export default function FlowIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: FlowIconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
