import { CONVERSA_SUMIU, type ParametroNumero } from "./comum";
import { apagarConversa, marcarLido, obterConversa, obterRegistro } from "@/lib/conversas";
import { getConfig } from "@/lib/estado";
import { apagarContato, comContato } from "@/lib/memoria";

export const dynamic = "force-dynamic";

/**
 * A conversa inteira para a coluna do meio de Conversas. Abrir uma conversa é lê-la: as não lidas
 * zeram aqui (`marcarLido`, que não mexe na data de atualização), e é por isso que o número no acento
 * da lista some assim que a pessoa clica na linha.
 *
 * O nome do atendente vai junto porque toda bolha da IA é assinada com ele ("{nome} · Assistente de
 * IA"): sem isso a tela precisaria de uma segunda consulta só para escrever um rótulo.
 */
export async function GET(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  if (!obterRegistro(numero)) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });
  marcarLido(numero);
  return Response.json({ conversa: comContato(obterConversa(numero)), atendente: getConfig().atendente });
}

/**
 * Apagar a conversa apaga tudo o que o app guardava deste número: as mensagens, os anexos e o que o
 * atendente lembrava do cliente (o número é a chave das duas tabelas). Quem pediu para apagar não
 * espera que o atendente continue sabendo o nome dele na conversa seguinte.
 */
export async function DELETE(_req: Request, { params }: ParametroNumero) {
  const { numero } = await params;
  apagarConversa(numero);
  apagarContato(numero);
  return Response.json({ ok: true });
}
