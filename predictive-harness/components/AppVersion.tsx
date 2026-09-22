import { version } from "@/package.json";

export function AppVersion() {
  return (
    <span className="app-version" aria-label={`Versão ${version}`} title={`Versão do Cowork Jev: ${version}`}>
      v{version}
    </span>
  );
}
