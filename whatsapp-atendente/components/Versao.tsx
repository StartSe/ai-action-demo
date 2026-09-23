import { version } from "@/package.json";

export function Versao() {
  return (
    <span className="shrink-0 whitespace-nowrap text-[11px] font-normal text-muted" aria-label={`Versão ${version}`}>
      v{version}
    </span>
  );
}
