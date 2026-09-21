import { version } from "@/package.json";

export function AppVersion() {
  return (
    <span className="app-version" title={`Versão do Predictive Harness: ${version}`}>
      v{version}
    </span>
  );
}
