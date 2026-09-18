// Como uma entrevista é dita na tela — a mesma frase na vaga, no candidato e em Entrevistas.
//
// Mora num arquivo só porque três telas mostram a MESMA entrevista: se a vaga disser "Convite
// enviado" e a tela do candidato disser "Convidada" sobre a mesma linha, quem lê as duas conclui que
// são coisas diferentes. Aqui não há nenhuma chamada nem estado: é a tradução do que o banco guarda
// para o que a pessoa de RH entende.
import { Chip } from "./ui";

export type StatusEntrevista = "convidada" | "aberta" | "em_andamento" | "concluida" | "avaliada" | "expirada" | "cancelada";
export type Decisao = "avancar" | "aguardar" | "reprovar";

/** A entrevista como as tabelas do painel a recebem (`listarEntrevistasNoPainel`, lib/painel.ts). */
export type EntrevistaNaTabela = {
  id: string;
  vagaId: string;
  candidatoId: string;
  candidatoNome: string;
  vagaCargo: string;
  status: StatusEntrevista;
  codigo?: string;
  decisao?: Decisao;
  notaGeral?: number;
  recomendacao?: string;
  resultadoId?: string;
  criadoEm: string;
  concluidaEm?: string;
};

/** Só quem ainda ocupa o par (vaga, candidato): é quem não pode ser convidado de novo. */
export const VIVAS: StatusEntrevista[] = ["convidada", "aberta", "em_andamento", "concluida", "avaliada"];

export const ROTULO_DECISAO: Record<Decisao, string> = { avancar: "Avançar", aguardar: "Aguardar", reprovar: "Não avançar" };

/**
 * A situação na linguagem de quem acompanha o processo, não na do banco.
 *
 * `convidada` sem código é a entrevista já atribuída cujo convite ainda não saiu: dizer "convidada"
 * nesse estado contaria que uma mensagem foi enviada a alguém.
 */
export function situacaoDaEntrevista(e: { status: StatusEntrevista; codigo?: string }): { nivel: string; rotulo: string } {
  switch (e.status) {
    case "convidada":
      return e.codigo ? { nivel: "neutral", rotulo: "Convite enviado" } : { nivel: "cinza", rotulo: "Aguardando convite" };
    case "aberta":
      return { nivel: "neutral", rotulo: "Link aberto" };
    case "em_andamento":
      return { nivel: "neutro", rotulo: "Conversando agora" };
    case "concluida":
      return { nivel: "neutro", rotulo: "Preparando o parecer" };
    case "avaliada":
      return { nivel: "positivo", rotulo: "Avaliada" };
    case "expirada":
      return { nivel: "cinza", rotulo: "Convite vencido" };
    default:
      return { nivel: "cinza", rotulo: "Cancelada" };
  }
}

export function ChipSituacao({ entrevista }: { entrevista: { status: StatusEntrevista; codigo?: string } }) {
  const s = situacaoDaEntrevista(entrevista);
  return <Chip nivel={s.nivel}>{s.rotulo}</Chip>;
}

/** A recomendação já vem escrita em português no parecer; aqui só se escolhe a cor. */
export function nivelRecomendacao(r?: string): string {
  return r === "avançar" ? "positivo" : r === "não avançar" ? "negativo" : "neutro";
}

export function nota(valor: number): string {
  return `${valor.toFixed(1).replace(".", ",")}/10`;
}

/** A nota com a recomendação ao lado, do jeito que as três tabelas a mostram. */
export function NotaDaEntrevista({ entrevista }: { entrevista: { notaGeral?: number; recomendacao?: string } }) {
  if (entrevista.notaGeral === undefined) return <span className="text-muted">—</span>;
  return (
    <span className="flex items-center gap-2 flex-wrap">
      <strong>{nota(entrevista.notaGeral)}</strong>
      {entrevista.recomendacao && <Chip nivel={nivelRecomendacao(entrevista.recomendacao)}>{entrevista.recomendacao}</Chip>}
    </span>
  );
}
