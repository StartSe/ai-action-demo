import { criarLinkCandidato } from "@/lib/entrevista";
import type { Tom, Vaga } from "@/lib/types";

const EXPIRACOES_VALIDAS = [7, 15, 30];
const TONS_VALIDOS: Tom[] = ["acolhedor", "objetivo"];

/** Gera o link de candidato ("Criar link para candidatos" no painel). */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const vagaBruta = (corpo?.vaga ?? {}) as Partial<Vaga>;
  const titulo = typeof vagaBruta.titulo === "string" ? vagaBruta.titulo.trim() : "";
  const requisitos = typeof vagaBruta.requisitos === "string" ? vagaBruta.requisitos.trim() : "";
  const candidato = typeof vagaBruta.candidato === "string" ? vagaBruta.candidato.trim() : "";
  const expiraEmDias = EXPIRACOES_VALIDAS.includes(corpo?.expiraEmDias) ? corpo.expiraEmDias : 15;
  if (!titulo || !requisitos || !candidato) {
    return Response.json({ error: "Preencha título da vaga, principais requisitos e nome do candidato." }, { status: 400 });
  }
  const vaga: Vaga = {
    titulo,
    requisitos,
    candidato,
    tom: TONS_VALIDOS.includes(vagaBruta.tom as Tom) ? (vagaBruta.tom as Tom) : "acolhedor",
    numero_perguntas: Number(vagaBruta.numero_perguntas) || 5,
  };
  const codigo = criarLinkCandidato(vaga, expiraEmDias);
  return Response.json({ codigo });
}
