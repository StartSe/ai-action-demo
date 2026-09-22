import { responderConversa, type ParametroNumero } from "../comum";
import { obterRegistro } from "@/lib/conversas";
import { apagarContato, salvarContato } from "@/lib/memoria";
import { LIMITE_MEMORIA } from "@/lib/types";

export const dynamic = "force-dynamic";

/** O que a pessoa lê quando escreve um parágrafo maior do que cabe — em vez de um corte silencioso. */
const LONGA_DEMAIS = `O que o atendente lembra precisa caber em ${LIMITE_MEMORIA} caracteres. Guarde o essencial para o próximo atendimento.`;

/** A frase de quem tenta corrigir a memória de uma conversa que outra aba já apagou. */
const SUMIU = "Essa conversa não está mais aqui. Volte para a lista e escolha outra.";

/**
 * "Salvar" do bloco "O que o atendente lembra", no painel do contato. Grava como escrita por uma
 * PESSOA, e é isso que faz a IA parar de reescrever por sete dias (lib/memoria.ts:atualizarMemoria):
 * quem corrigiu à mão o fez porque a IA tinha errado.
 *
 * Devolve a conversa inteira já atualizada, como as outras rotas desta pasta: a tela nunca precisa de
 * uma segunda consulta depois de agir.
 */
export async function PUT(req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  if (!obterRegistro(numero)) return Response.json({ error: SUMIU }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    memoria?: unknown;
    nomeInformado?: unknown;
    email?: unknown;
    telefoneRetorno?: unknown;
  };
  const memoria = typeof body.memoria === "string" ? body.memoria.trim() : "";
  if (memoria.length > LIMITE_MEMORIA) return Response.json({ error: LONGA_DEMAIS }, { status: 400 });
  // Campo que não veio no corpo fica como está: o "Salvar" do painel manda só o parágrafo, e apagar
  // junto o e-mail e o telefone que o cliente informou seria perder um dado que ninguém pediu para
  // perder. Campo que veio vazio, aí sim, apaga.
  const texto = (chave: string, valor: unknown) => (chave in body ? (typeof valor === "string" ? valor.trim() : "") : undefined);

  salvarContato(
    numero,
    {
      memoria,
      nomeInformado: texto("nomeInformado", body.nomeInformado),
      email: texto("email", body.email),
      telefoneRetorno: texto("telefoneRetorno", body.telefoneRetorno),
    },
    "pessoa"
  );
  return responderConversa(numero);
}

/** "Apagar memória": o atendente esquece este cliente. A conversa em si continua onde está. */
export async function DELETE(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  if (!obterRegistro(numero)) return Response.json({ error: SUMIU }, { status: 404 });
  apagarContato(numero);
  return responderConversa(numero);
}
