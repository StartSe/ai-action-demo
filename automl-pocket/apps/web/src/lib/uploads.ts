import { unlink } from "node:fs/promises";
import path from "node:path";

/** Remove um arquivo do volume de uploads sem propagar erros (arquivo pode não existir). */
export async function removeFileQuiet(filePath: string | null | undefined) {
  if (!filePath) return;
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.join(
        /*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "uploads",
        filePath,
      );
  try {
    await unlink(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Arquivo inexistente é o caso esperado (exclusão idempotente) — silêncio.
    if (code === "ENOENT") return;
    console.error(
      `removeFileQuiet: falha ao remover ${absolute} (${code ?? "erro desconhecido"})`,
      error,
    );
  }
}
