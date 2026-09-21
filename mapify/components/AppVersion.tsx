import { version } from "@/package.json";

export function AppVersion() {
  return (
    <span className="app-version" title={`Versão do Mapia: ${version}`}>
      v{version}
    </span>
  );
}
