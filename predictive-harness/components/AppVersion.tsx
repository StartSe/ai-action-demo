import { version } from "@/package.json";

export function AppVersion() {
  return (
    <span className="app-version" aria-label={`Versão ${version}`} title={`Versão do Cowork FPEA: ${version}`}>
      v{version}
    </span>
  );
}
