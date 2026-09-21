import { getConfig } from "./store";

export type Diagnostic = {
  stage: string;
  message: string;
  level?: "info" | "error";
};
export type OnDiagnostic = (event: Diagnostic) => void;

// Never put credentials, connection URLs, tool arguments or source contents in logs.
export function diagnosticText(value: unknown): string {
  let text = value instanceof Error ? value.message : String(value);
  for (const key of [
    "OPENROUTER_API_KEY",
    "ZAPIER_MCP_URL",
    "ZAPIER_MCP_TOKEN",
  ]) {
    const secret = getConfig(key);
    if (secret) text = text.split(secret).join("[oculto]");
  }
  return text
    .replace(/https?:\/\/[^\s<>"']+/gi, "[endereço oculto]")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [oculto]")
    .replace(/\b(?:sk-|xox[baprs]-)[\w-]+/gi, "[credencial oculta]")
    .replace(
      /((?:token|api[_-]?key|authorization|password|secret)["']?\s*[:=]\s*["']?)[^\s,}"']+/gi,
      "$1[oculto]",
    )
    .slice(0, 1800);
}
