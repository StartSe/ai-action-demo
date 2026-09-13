// Confirmação de responsáveis por link (US-065): um formulário público por ação da ata, reaproveitando
// a infraestrutura genérica de lib/formularios.ts. Próprio deste app (não copiado para os outros 9):
// nenhum outro app tem "ações com responsável e prazo" vindas de uma ata.
import { data } from "@/lib/formato";
import { atualizarSaida, obter } from "@/lib/historico";
import type { Meta } from "@/lib/ai";
import { criar, registrarCallback, type CampoFormulario, type ParametrosPublicos } from "./formularios";
import type { Acao, Ata, EntradaAta } from "./types";

export const TIPO_CONFIRMACAO_ACAO = "confirmacao-acao";

const PRAZO_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
const PRAZO_PARTES = /^(\d{4})-(\d{2})-(\d{2})$/;

function dataPrazo(prazo: string): string {
  const m = PRAZO_PARTES.exec(prazo);
  if (!m) return prazo;
  return data(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// Os dois campos são opcionais (a página pública já acrescenta "(opcional)" ao rótulo sozinha, ver
// FormularioPublico.tsx): deixar os dois em branco equivale a "confirmar", preencher o prazo equivale
// a "ajustar prazo", e o comentário é livre nos dois casos. A instrução de uso mora na `descricao`
// (criarLinkConfirmacao), não no rótulo, para não repetir "(opcional)" duas vezes.
export const CAMPOS_CONFIRMACAO: CampoFormulario[] = [
  { chave: "novoPrazo", rotulo: "Novo prazo (formato AAAA-MM-DD)", tipo: "texto" },
  { chave: "comentario", rotulo: "Comentário", tipo: "textarea" },
];

/** Parâmetros próprios deste link: qual ata e qual ação (por índice) a resposta deve atualizar. */
type ParametrosConfirmacao = ParametrosPublicos & { ataId: string; indice: number };

/** Cria (uma única vez por ação) o formulário público e devolve o token do link (/f/<token>). */
export function criarLinkConfirmacao(ataId: string, indice: number, acao: Acao): string {
  const parametros: ParametrosConfirmacao = {
    marca: "A",
    nome: "Ata Executiva",
    titulo: acao.acao,
    descricao: `Responsável: ${acao.responsavel || "a definir"} · Prazo atual: ${PRAZO_VALIDO.test(acao.prazo) ? dataPrazo(acao.prazo) : acao.prazo}. Deixe os campos abaixo em branco para só confirmar, ou informe um novo prazo se precisar mudar.`,
    ataId,
    indice,
  };
  return criar({ tipo: TIPO_CONFIRMACAO_ACAO, campos: CAMPOS_CONFIRMACAO, parametros, expiraEmDias: 60 });
}

registrarCallback(TIPO_CONFIRMACAO_ACAO, ({ dados, parametros }) => {
  const { ataId, indice } = parametros as ParametrosConfirmacao;
  const registro = obter<EntradaAta, Ata, Meta>(ataId);
  if (!registro || registro.tipo !== "ata") return;

  const acoes = registro.saida.acoes || [];
  const atual = acoes[indice];
  if (!atual) return;

  const novoPrazo = (dados.novoPrazo || "").trim();
  const comentario = (dados.comentario || "").trim();
  const prazoAjustado = novoPrazo !== "" && PRAZO_VALIDO.test(novoPrazo) && novoPrazo !== atual.prazo;

  const acaoAtualizada: Acao = {
    ...atual,
    confirmacao: prazoAjustado ? "prazo_ajustado" : "confirmada",
    ...(prazoAjustado ? { prazo: novoPrazo } : {}),
    ...(comentario ? { comentarioResponsavel: comentario } : {}),
  };
  const acoesAtualizadas = acoes.map((a, i) => (i === indice ? acaoAtualizada : a));
  atualizarSaida(ataId, { ...registro.saida, acoes: acoesAtualizadas });
});
