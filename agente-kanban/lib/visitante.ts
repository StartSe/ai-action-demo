// Identifica visitantes anônimos do quadro de exemplo por um cookie de sessão, para que cada
// um veja e altere só o seu próprio quadro em memória (lib/quadro-demo.ts). Só é lido/gravado
// em Route Handlers (onde cookies() pode escrever no cabeçalho da resposta).
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "visitante_id";
const UM_MES_EM_SEGUNDOS = 60 * 60 * 24 * 30;

export async function visitanteId(): Promise<string> {
  const jar = await cookies();
  const existente = jar.get(COOKIE)?.value;
  if (existente) return existente;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: UM_MES_EM_SEGUNDOS, path: "/" });
  return id;
}
