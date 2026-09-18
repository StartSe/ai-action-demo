// Como uma entrevista é dita na tela — a mesma frase na vaga, no candidato e em Entrevistas.
//
// Mora num arquivo só porque três telas mostram a MESMA entrevista: se a vaga disser "Convite
// enviado" e a tela do candidato disser "Convidada" sobre a mesma linha, quem lê as duas conclui que
// são coisas diferentes. Aqui não há nenhuma chamada nem estado: é a tradução do que o banco guarda
// para o que a pessoa de RH entende.
import { Chip } from "./ui";

export type StatusEntrevista = "convidada" | "aberta" | "em_andamento" | "concluida" | "avaliada" | "expirada" | "cancelada";
export type Decisao = "avancar" | "aguardar" | "reprovar";
export type NivelVoz = "agente" | "navegador" | "texto";
export type ParecerStatus = "nao_pedido" | "em_andamento" | "falhou" | "sem_material" | "pronto";

/** A entrevista como as tabelas do painel a recebem (`listarEntrevistasNoPainel`, lib/painel.ts). */
export type EntrevistaNaTabela = {
  id: string;
  vagaId: string;
  candidatoId: string;
  candidatoNome: string;
  vagaCargo: string;
  status: StatusEntrevista;
  codigo?: string;
  nivelVoz?: NivelVoz;
  parecerStatus: ParecerStatus;
  decisao?: Decisao;
  notaGeral?: number;
  recomendacao?: string;
  resultadoId?: string;
  criadoEm: string;
  concluidaEm?: string;
};

/** Só quem ainda ocupa o par (vaga, candidato): é quem não pode ser convidado de novo. */
export const VIVAS: StatusEntrevista[] = ["convidada", "aberta", "em_andamento", "concluida", "avaliada"];

/** Os estados em que ainda faz sentido mandar (ou remandar) o convite: um convite vencido ganha um
 * link novo e a entrevista volta a esperar o candidato (US-014). */
export const PODE_CONVIDAR: StatusEntrevista[] = ["convidada", "aberta", "expirada"];

/** O rótulo do botão do convite. São três frases porque são três situações diferentes para quem lê a
 * tabela: nada foi enviado ainda, já foi enviado e vai de novo, ou o prazo venceu e o link será outro. */
export function rotuloConvite(e: { status: StatusEntrevista; codigo?: string }): string {
  if (e.status === "expirada") return "Convidar de novo";
  return e.codigo ? "Reenviar convite" : "Enviar convite";
}

/** Quando "Ligar para o candidato agora" (US-020) faz sentido: enquanto a pessoa ainda não conversou.
 * Depois disso a ligação criaria uma segunda conversa para a mesma entrevista, e o parecer sairia de
 * cima das duas. A mesma regra vale no servidor (`POST /api/ligar`). */
export const PODE_LIGAR: StatusEntrevista[] = ["convidada", "aberta"];

export const ROTULO_DECISAO: Record<Decisao, string> = { avancar: "Avançar", aguardar: "Aguardar", reprovar: "Não avançar" };

/** As três decisões na ordem em que a tela as oferece, com a frase que diz o que cada uma significa. */
export const DECISOES: { valor: Decisao; rotulo: string; apoio: string }[] = [
  { valor: "avancar", rotulo: "Avançar", apoio: "Segue para a próxima etapa do processo." },
  { valor: "aguardar", rotulo: "Aguardar", apoio: "Fica em espera até você decidir." },
  { valor: "reprovar", rotulo: "Não avançar", apoio: "Encerra o processo deste candidato nesta vaga." },
];

/** Como a conversa aconteceu (D3). Só faz sentido depois que a sala abriu: até lá o nível é nulo,
 * porque é o navegador do candidato que decide o que dá para usar. */
export const ROTULO_NIVEL_VOZ: Record<NivelVoz, string> = {
  agente: "Voz natural",
  navegador: "Voz do navegador",
  texto: "Texto",
};

/** Uma entrevista concluída ainda espera o parecer? É isso que faz a lista se reler sozinha, e é
 * falso quando a conversa foi curta demais ou quando a análise falhou e alguém precisa pedir de novo. */
export function esperandoParecer(e: { status: StatusEntrevista; parecerStatus: ParecerStatus }): boolean {
  return e.status === "concluida" && e.parecerStatus !== "falhou" && e.parecerStatus !== "sem_material";
}

/** O que a coluna "Nota" diz enquanto não há nota. São três esperas diferentes, e só uma delas termina
 * sozinha — por isso não cabem na mesma frase. */
export function esperaDoParecer(e: { status: StatusEntrevista; parecerStatus: ParecerStatus }): string | null {
  if (e.status !== "concluida") return null;
  if (e.parecerStatus === "sem_material") return "Encerrada cedo demais para avaliar";
  if (e.parecerStatus === "falhou") return "O parecer não ficou pronto";
  return "Preparando o parecer...";
}

/**
 * A situação na linguagem de quem acompanha o processo, não na do banco.
 *
 * `convidada` sem código é a entrevista já atribuída cujo convite ainda não saiu: dizer "convidada"
 * nesse estado contaria que uma mensagem foi enviada a alguém.
 */
export function situacaoDaEntrevista(e: { status: StatusEntrevista; codigo?: string; parecerStatus?: ParecerStatus }): { nivel: string; rotulo: string } {
  switch (e.status) {
    case "convidada":
      return e.codigo ? { nivel: "neutral", rotulo: "Convite enviado" } : { nivel: "cinza", rotulo: "Aguardando convite" };
    case "aberta":
      return { nivel: "neutral", rotulo: "Link aberto" };
    case "em_andamento":
      return { nivel: "neutro", rotulo: "Conversando agora" };
    case "concluida":
      if (e.parecerStatus === "sem_material") return { nivel: "cinza", rotulo: "Encerrada cedo" };
      // "neutro" é o âmbar da paleta (`.chip-neutro`); não existe `chip-warn`.
      if (e.parecerStatus === "falhou") return { nivel: "neutro", rotulo: "Parecer pendente" };
      return { nivel: "neutro", rotulo: "Preparando o parecer" };
    case "avaliada":
      return { nivel: "positivo", rotulo: "Avaliada" };
    case "expirada":
      return { nivel: "cinza", rotulo: "Convite vencido" };
    default:
      return { nivel: "cinza", rotulo: "Cancelada" };
  }
}

export function ChipSituacao({ entrevista }: { entrevista: { status: StatusEntrevista; codigo?: string; parecerStatus?: ParecerStatus } }) {
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
