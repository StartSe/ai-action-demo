import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function validar(chave: Buffer): Buffer {
  if (chave.length !== 32) throw new Error("A chave mestra existente tem tamanho inválido. Restaure a chave original; ela não será substituída.");
  return chave;
}

/** Só cria uma chave em uma instalação nova. Falhas de acesso nunca autorizam substituição. */
export function carregarChaveMestra(diretorio: string, ambiente: string | undefined, temConfiguracaoCifrada: () => boolean): Buffer {
  if (ambiente?.trim()) return validar(Buffer.from(ambiente.trim(), "base64"));
  const arquivo = path.join(diretorio, "chave-mestra");
  try { return validar(fs.readFileSync(arquivo)); }
  catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }

  if (temConfiguracaoCifrada()) {
    // Outro processo pode ter terminado a primeira gravação após a leitura acima.
    try { return validar(fs.readFileSync(arquivo)); }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      throw new Error("A chave mestra está ausente, mas existem configurações cifradas. Restaure a chave original do volume ou backup; nenhuma chave nova foi criada.");
    }
  }
  fs.mkdirSync(diretorio, { recursive: true });
  const temporario = `${arquivo}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporario, crypto.randomBytes(32), { mode: 0o600, flag: "wx" });
  try {
    // Publicação atômica, sem sobrescrever: Next e agente sempre recebem a mesma chave completa.
    try { fs.linkSync(temporario, arquivo); }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err; }
  } finally { fs.unlinkSync(temporario); }
  return validar(fs.readFileSync(arquivo));
}
