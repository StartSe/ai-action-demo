import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { AppError } from "./api";

const exec = promisify(execFile);
export type Caption = { text: string; start: number; duration?: number };

export function youtubePython(
  directory = process.cwd(),
  configured = process.env.PYTHON_PATH,
) {
  if (configured?.trim()) return configured.trim();
  const local = join(
    directory,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  return existsSync(local) ? local : "python3";
}

export function transcriptError(code: string): AppError {
  switch (code) {
    case "RequestBlocked":
    case "IpBlocked":
      return new AppError(
        "O YouTube bloqueou a consulta feita pelo servidor do Mapia. Isso pode acontecer mesmo com legendas públicas, especialmente no Render. Para vídeos públicos de qualquer canal, configure Gemini em Configurações → YouTube. Para vídeos que sua conta pode editar, use YouTube OAuth. Você também pode colar a transcrição na opção Texto.",
        503,
      );
    case "TranscriptsDisabled":
    case "NoTranscriptFound":
      return new AppError(
        "O YouTube não retornou legendas para este vídeo. Confira se a opção Mostrar transcrição aparece no YouTube; se aparecer, copie o texto para a opção Texto do Mapia.",
      );
    case "AgeRestricted":
    case "VideoUnplayable":
      return new AppError(
        "O YouTube restringiu o acesso a este vídeo pela leitura pública. Para vídeos que sua conta pode editar, conecte o YouTube em Configurações. Você também pode colar a transcrição na opção Texto.",
      );
    case "VideoUnavailable":
      return new AppError(
        "O vídeo está indisponível para este servidor. Confira o link e se o vídeo continua público.",
      );
    case "PoTokenRequired":
      return new AppError(
        "O YouTube exige uma verificação adicional para baixar as legendas deste vídeo. Copie a transcrição disponível no YouTube para a opção Texto do Mapia.",
        503,
      );
    case "PythonUnavailable":
    case "ModuleNotFoundError":
    case "ImportError":
      return new AppError(
        "A extração do YouTube não está instalada corretamente neste Mapia. Na pasta mapify, execute npm run setup:youtube e reinicie o app. No Render, publique novamente a imagem atualizada.",
        503,
      );
    case "ProxyError":
    case "InvalidProxyURL":
      return new AppError(
        "Não foi possível conectar ao proxy do YouTube. Confira YOUTUBE_PROXY_URL no ambiente do serviço.",
        503,
      );
    case "Timeout":
    case "ReadTimeout":
    case "ConnectTimeout":
      return new AppError(
        "A consulta das legendas demorou demais. Tente novamente em alguns instantes.",
        504,
      );
    case "OutputTooLarge":
      return new AppError(
        "As legendas deste vídeo excedem o limite de leitura. Divida a transcrição em partes e use a opção Texto.",
      );
    case "ConnectionError":
    case "SSLError":
    case "YouTubeRequestFailed":
      return new AppError(
        "Não foi possível conectar ao YouTube para ler as legendas. Confira a conexão do servidor e tente novamente.",
        503,
      );
    default:
      return new AppError(
        "Não foi possível interpretar a resposta de legendas do YouTube. Isso não confirma que o vídeo esteja sem transcrição. Tente novamente ou cole a transcrição na opção Texto.",
        502,
      );
  }
}

function payload(stdout: unknown): { error?: string; segments?: unknown } {
  try {
    const value = JSON.parse(String(stdout));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

export async function fetchCaptions(
  id: string,
  signal?: AbortSignal,
): Promise<Caption[]> {
  signal?.throwIfAborted();
  let result;
  try {
    result = await exec(
      youtubePython(),
      [join(process.cwd(), "scripts/transcript.py"), id],
      { timeout: 45000, maxBuffer: 2 * 1024 * 1024, signal },
    );
  } catch (error) {
    // Never expose command lines, provider responses, stderr or proxy credentials.
    signal?.throwIfAborted();
    const failure = error as {
      stdout?: string;
      code?: string;
      killed?: boolean;
    };
    const code =
      payload(failure.stdout).error ||
      (["ENOENT", "EACCES"].includes(failure.code || "")
        ? "PythonUnavailable"
        : failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
          ? "OutputTooLarge"
          : failure.killed
            ? "Timeout"
            : "ExtractorFailed");
    throw transcriptError(code);
  }
  signal?.throwIfAborted();
  const data = payload(result.stdout);
  if (data.error) throw transcriptError(data.error);
  if (
    !Array.isArray(data.segments) ||
    !data.segments.length ||
    !data.segments.every(
      (s) =>
        s &&
        typeof s.text === "string" &&
        Number.isFinite(s.start) &&
        s.start >= 0,
    ) ||
    !data.segments.some((s) => s.text.trim())
  )
    throw transcriptError("InvalidResponse");
  return data.segments;
}
