// O Início (US-022 da PRD): o que precisa de você hoje, sem procurar em quatro telas.
//
// Tudo aqui é **cálculo puro sobre o que já está gravado** — nenhuma chamada de IA nasce nesta tela.
// É a primeira coisa que abre no dia, várias vezes por dia: pagar um modelo para dizer o que uma soma
// já diz sairia caro e faria duas aberturas seguidas discordarem entre si.
//
// Por que este módulo fica acima de vaga, candidato e entrevista (e não dentro de um deles): ele lê
// os três de uma vez, e os módulos de entidade só podem depender de `lib/banco.ts`. Ninguém importa
// o Início de volta.
import { listar as listarCandidatos } from "./candidatos";
import { aiEnabled } from "./ai";
import { CONTAGEM_VAZIA, contarPorVaga, fotografia, listar as listarEntrevistas, type ContagemVaga } from "./entrevistas";
import { haDias } from "./formato";
import { contarAbertasAte, listar as listarVagas } from "./vagas";

/** Quantas vagas aparecem em "Vagas abertas" antes do "Ver todas". */
const CARTOES = 3;

/** Quantos itens "Precisa de você" mostra: seis cabem na tela e ainda sobram os que não cabem. */
const PENDENCIAS = 6;

/** A janela de comparação dos indicadores, em dias. */
const DIAS_DO_PERIODO = 30;

/** Um convite que vence dentro deste prazo já é assunto de hoje. */
const DIAS_PARA_VENCER = 3;

const DIA_MS = 86_400_000;

/**
 * Um dos quatro números do topo.
 *
 * `janela` diz o que o número mede, porque a legenda muda: uma **fila** ("aguardando o candidato") é
 * o retrato de agora e se compara com o retrato de trinta dias atrás; um **movimento** ("entrevistas
 * concluídas") é o que aconteceu no período e se compara com o período anterior. Contar as duas
 * coisas do mesmo jeito é o que faz um painel dizer a mesma frase para perguntas diferentes.
 *
 * `valor: null` é "ainda não dá para dizer", que é diferente de zero; `variacao: null` é "não há com
 * o que comparar" — nada existia trinta dias atrás, e uma subida de nada para alguma coisa não é uma
 * variação, é um começo.
 */
export type IndicadorInicio = {
  id: "vagas" | "aguardando" | "concluidas" | "decidir";
  rotulo: string;
  valor: number | null;
  /** Casas decimais na hora de escrever o número; contagem não tem nenhuma. */
  decimais: 0 | 1;
  janela: "agora" | "periodo";
  /** Diferença absoluta para o retrato (ou o período) anterior, na mesma unidade do valor. */
  variacao: number | null;
};

export type TipoPendencia = "decisao" | "identidade" | "convite" | "pesquisa";

/** Uma linha de "Precisa de você": o que está parado, de quem é e para onde leva. */
export type PendenciaInicio = {
  /** Chave de lista; é o id da entrevista ou do candidato, prefixado pelo tipo. */
  id: string;
  tipo: TipoPendencia;
  titulo: string;
  apoio: string;
  acao: string;
  url: string;
  exemplo: boolean;
};

export type VagaAbertaInicio = {
  id: string;
  cargo: string;
  exemplo: boolean;
  candidatos: ContagemVaga;
};

export type PassoInicio = {
  titulo: string;
  apoio: string;
  concluido: boolean;
  acao: { rotulo: string; url: string };
};

export type Inicio = {
  /** Instalação em que nada foi cadastrado ainda: os números somem e os três passos ocupam a tela. */
  vazio: boolean;
  /** A tela está mostrando dado de exemplo (US-004). */
  exemplo: boolean;
  dias: number;
  indicadores: IndicadorInicio[];
  pendencias: PendenciaInicio[];
  vagas: VagaAbertaInicio[];
  /** Quantas vagas abertas existem ao todo — o "Ver todas" só aparece quando sobra vaga de fora. */
  totalVagasAbertas: number;
  passos: PassoInicio[];
};

/** Diferença para o retrato anterior. Sem nada antes não há variação — e não há zero. */
function variacao(agora: number | null, antes: number | null, houveAntes: boolean): number | null {
  if (agora === null || antes === null || !houveAntes) return null;
  return agora - antes;
}

/** O primeiro nome, que é como as listas curtas se referem a uma pessoa. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome;
}

/** "em 2 dias", "amanhã", "hoje": quanto falta para o convite vencer. */
function emDias(quando: string, agora: Date): string {
  const dias = Math.ceil((new Date(quando).getTime() - agora.getTime()) / DIA_MS);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

/**
 * Os quatro números do topo.
 *
 * A comparação é entre **agora** e **trinta dias atrás**, não entre o mês corrente e o mês passado:
 * no dia 3 do mês, três dias de processo comparados com um mês inteiro inventariam uma queda enorme
 * que não aconteceu.
 */
function indicadores(quando: Date): IndicadorInicio[] {
  const agoraIso = new Date(quando.getTime() + 1000).toISOString();
  const antesIso = new Date(quando.getTime() - DIAS_DO_PERIODO * DIA_MS).toISOString();
  const antesDeAntesIso = new Date(quando.getTime() - 2 * DIAS_DO_PERIODO * DIA_MS).toISOString();

  const atual = fotografia(agoraIso, antesIso);
  const anterior = fotografia(antesIso, antesDeAntesIso);
  const vagasAgora = contarAbertasAte(agoraIso);
  const vagasAntes = contarAbertasAte(antesIso);

  // Havia app trinta dias atrás? Sem vaga nem entrevista naquele dia não há retrato anterior, e
  // qualquer "+3" seria a idade da instalação disfarçada de tendência.
  const houveAntes = anterior.total > 0 || vagasAntes > 0;

  return [
    { id: "vagas", rotulo: "Vagas abertas", valor: vagasAgora, decimais: 0, janela: "agora", variacao: variacao(vagasAgora, vagasAntes, houveAntes) },
    {
      id: "aguardando",
      rotulo: "Aguardando o candidato",
      valor: atual.aguardando,
      decimais: 0,
      janela: "agora",
      variacao: variacao(atual.aguardando, anterior.aguardando, houveAntes),
    },
    {
      id: "concluidas",
      rotulo: "Entrevistas concluídas",
      valor: atual.concluidas,
      decimais: 0,
      janela: "periodo",
      variacao: variacao(atual.concluidas, anterior.concluidas, houveAntes),
    },
    {
      id: "decidir",
      rotulo: "Para você decidir",
      valor: atual.aDecidir,
      decimais: 0,
      janela: "agora",
      variacao: variacao(atual.aDecidir, anterior.aDecidir, houveAntes),
    },
  ];
}

/**
 * "Precisa de você", na ordem em que a PRD pediu: parecer sem decisão, identidade a confirmar,
 * convite vencendo e pesquisa que falhou.
 *
 * A ordem é de urgência, não de data: um parecer pronto é alguém esperando resposta de um processo
 * seletivo, e isso vem antes de uma pesquisa na web que deu errado. Dentro de cada grupo, o mais
 * antigo primeiro — quem está esperando há mais tempo aparece em cima.
 */
function pendencias(quando: Date): PendenciaInicio[] {
  const itens: PendenciaInicio[] = [];
  const entrevistas = listarEntrevistas({ limite: 500 });

  // Vaga e candidato saem de UMA leitura de cada lista, não de uma consulta por linha: dez candidatos
  // da mesma vaga não podem virar dez leituras dela.
  const vagas = new Map(listarVagas({ limite: 500 }).map((v) => [v.id, v.cargo]));
  const candidatos = listarCandidatos({ limite: 500 });
  const nomes = new Map(candidatos.map((c) => [c.id, c.nome]));

  const semDecisao = entrevistas
    .filter((e) => e.status === "avaliada" && !e.decisao && e.resultadoId)
    .sort((a, b) => (a.concluidaEm ?? a.criadoEm).localeCompare(b.concluidaEm ?? b.criadoEm));
  for (const e of semDecisao) {
    itens.push({
      id: `decisao:${e.id}`,
      tipo: "decisao",
      titulo: `Parecer de ${nomes.get(e.candidatoId) ?? "candidato removido"}`,
      apoio: `${vagas.get(e.vagaId) ?? "Vaga removida"} · conversa concluída ${haDias(e.concluidaEm ?? e.criadoEm)}`,
      acao: "Ver o parecer",
      url: `/entrevistas/${e.id}`,
      exemplo: e.exemplo,
    });
  }

  for (const c of candidatos) {
    if (c.identidadeConfirmada) continue;
    if (!c.ficha?.web?.identidades.length) continue;
    itens.push({
      id: `identidade:${c.id}`,
      tipo: "identidade",
      titulo: `Quem é ${primeiroNome(c.nome)}?`,
      apoio: "A pesquisa encontrou mais de uma pessoa com esse nome. Escolha antes da entrevista.",
      acao: "Escolher",
      url: `/candidatos/${c.id}`,
      exemplo: c.exemplo,
    });
  }

  const limite = new Date(quando.getTime() + DIAS_PARA_VENCER * DIA_MS).toISOString();
  const vencendo = entrevistas
    .filter((e) => (e.status === "convidada" || e.status === "aberta") && e.expiraEm && e.expiraEm <= limite)
    .sort((a, b) => (a.expiraEm as string).localeCompare(b.expiraEm as string));
  for (const e of vencendo) {
    itens.push({
      id: `convite:${e.id}`,
      tipo: "convite",
      titulo: `O convite de ${nomes.get(e.candidatoId) ?? "candidato removido"} vence ${emDias(e.expiraEm as string, quando)}`,
      apoio: `${vagas.get(e.vagaId) ?? "Vaga removida"} · ainda sem resposta`,
      acao: "Reenviar",
      url: `/entrevistas/${e.id}`,
      exemplo: e.exemplo,
    });
  }

  for (const c of candidatos) {
    if (c.pesquisaStatus !== "falhou") continue;
    itens.push({
      id: `pesquisa:${c.id}`,
      tipo: "pesquisa",
      titulo: `A busca na internet por ${primeiroNome(c.nome)} não terminou`,
      apoio: "O currículo continua valendo; a busca pode ser refeita quando você quiser.",
      acao: "Tentar de novo",
      url: `/candidatos/${c.id}`,
      exemplo: c.exemplo,
    });
  }

  return itens.slice(0, PENDENCIAS);
}

/**
 * O Início inteiro, de uma vez.
 *
 * `quando` é parâmetro para o teste poder fixar o relógio; em produção ninguém o passa.
 */
export function montarInicio(quando = new Date()): Inicio {
  const abertas = listarVagas({ status: "aberta", limite: 500 });
  const todasAsVagas = listarVagas({ limite: 500 });
  const contagens = contarPorVaga();
  const candidatos = listarCandidatos({ limite: 500 });
  const entrevistas = listarEntrevistas({ limite: 500 });

  // Os passos só se marcam com dado REAL: as vagas e os candidatos semeados (US-004) mostram o app
  // cheio, mas não podem marcar um passo que ninguém deu.
  const temVaga = todasAsVagas.some((v) => !v.exemplo);
  const temConvite = entrevistas.some((e) => !e.exemplo);
  const primeiraVagaAberta = todasAsVagas.find((v) => !v.exemplo && v.status === "aberta");

  const passos: PassoInicio[] = [
    {
      titulo: "Conecte a IA",
      apoio: "Configure a IA que conduz as perguntas e prepara o parecer. A voz e a cultura da empresa podem ser ajustadas na mesma tela.",
      concluido: aiEnabled(),
      acao: { rotulo: aiEnabled() ? "Rever configuração" : "Configurar IA", url: "/setup#openrouter" },
    },
    {
      titulo: "Abra uma vaga",
      apoio: "Cargo, salário, desafios e requisitos. É daqui que saem as perguntas da entrevista.",
      concluido: temVaga,
      acao: { rotulo: temVaga ? "Ver minhas vagas" : "Abrir vaga", url: temVaga ? "/vagas" : "/vagas/nova" },
    },
    {
      titulo: "Convide um candidato",
      apoio: "Cadastre a pessoa, atribua à vaga e mande o link. Ela conversa do celular, quando puder.",
      concluido: temConvite,
      acao: { rotulo: temConvite ? "Ver as entrevistas" : "Adicionar candidato à vaga", url: temConvite ? "/entrevistas" : primeiraVagaAberta ? `/vagas/${primeiraVagaAberta.id}` : "/vagas/nova" },
    },
  ];

  return {
    // Nada cadastrado ainda: quatro zeros e três listas vazias não dizem nada a quem ainda vai abrir
    // a primeira vaga. Os três passos são o estado vazio desta tela.
    vazio: todasAsVagas.length === 0 && candidatos.length === 0,
    exemplo: todasAsVagas.some((v) => v.exemplo) || candidatos.some((c) => c.exemplo),
    dias: DIAS_DO_PERIODO,
    indicadores: indicadores(quando),
    pendencias: pendencias(quando),
    vagas: abertas.slice(0, CARTOES).map((v) => ({
      id: v.id,
      cargo: v.cargo,
      exemplo: v.exemplo,
      candidatos: contagens[v.id] ?? CONTAGEM_VAZIA,
    })),
    totalVagasAbertas: abertas.length,
    passos,
  };
}
