// O Início (US-027): o que está acontecendo e o que fazer a seguir, sem o gestor procurar nada.
//
// Tudo aqui é **cálculo puro sobre o que já está gravado** — nenhuma chamada de IA nasce nesta tela.
// É a primeira coisa que abre no dia, várias vezes por dia: pagar um modelo para dizer o que uma soma
// já diz sairia caro e faria duas aberturas seguidas discordarem entre si. A "Dica da semana" é texto
// fixo pelo mesmo motivo (e a AC pede assim).
import { listarTodos as listarTodosProdutos } from "./produtos";
import { movimentoEntre, notaMediaPorSimulacao, resumoPorSimulacao } from "./sessoes";
import { listar as listarSimulacoes, type Dificuldade, type Metodologia } from "./simulacoes";

/** Quantos treinos aparecem em "Simulações ativas" antes do "Ver todas". */
const CARTOES = 3;

const DIAS_DO_PERIODO = 30;

/**
 * Um dos quatro números do topo.
 *
 * `valor: null` é "ainda não dá para dizer" (nota média sem nenhuma conversa avaliada), que é diferente
 * de zero. `variacao: null` é "não há com o que comparar": o período anterior não teve movimento nenhum,
 * e uma subida de "nada" para "alguma coisa" não é uma porcentagem, é um começo.
 */
export type IndicadorInicio = {
  id: "simulacoes" | "nota" | "vendedores" | "sessoes";
  rotulo: string;
  valor: number | null;
  /** Casas decimais na hora de escrever o número. A nota tem uma; contagem não tem nenhuma. */
  decimais: 0 | 1;
  /** Diferença absoluta para o período anterior, na mesma unidade do valor. */
  variacao: number | null;
};

export type SimulacaoAtivaInicio = {
  codigo: string;
  nome: string;
  produtoNome: string;
  metodologia: Metodologia;
  dificuldade: Dificuldade;
  participantes: number;
  sessoes: number;
  notaMedia: number | null;
};

export type PassoInicio = {
  titulo: string;
  apoio: string;
  concluido: boolean;
  acao: { rotulo: string; url: string };
};

export type DicaInicio = { titulo: string; texto: string };

export type Inicio = {
  /**
   * Instalação em que ninguém treinou ainda: os indicadores somem (quatro zeros não dizem nada) e
   * "Comece em 3 passos" ocupa o lugar dos cartões.
   */
  vazio: boolean;
  /** Quantos dias cada período dos indicadores cobre, para a tela escrever a legenda da comparação. */
  dias: number;
  indicadores: IndicadorInicio[];
  ativas: SimulacaoAtivaInicio[];
  /** Quantos treinos ativos existem ao todo — o "Ver todas" só aparece quando sobra treino de fora. */
  totalAtivas: number;
  passos: PassoInicio[];
  dica: DicaInicio;
};

/**
 * Seis dicas que giram por semana do ano. Texto fixo, sem IA: são conselhos de como usar o app, não
 * leitura dos dados deste gestor — e um conselho genérico escrito por um modelo custaria dinheiro para
 * dizer a mesma coisa de um jeito diferente a cada abertura da tela.
 */
const DICAS: DicaInicio[] = [
  { titulo: "Um link, o time inteiro", texto: "Mande o mesmo link no grupo do time: cada pessoa treina com um cliente próprio e você recebe um resultado por pessoa." },
  { titulo: "Comece pelo cliente fácil", texto: "Na primeira semana, deixe a dificuldade em fácil. Quem sai com uma nota boa volta; quem apanha na estreia não volta." },
  { titulo: "Repita o mesmo treino", texto: "A segunda conversa no mesmo link é onde a evolução aparece. Um treino usado três vezes vale mais que três treinos usados uma vez." },
  { titulo: "Material bom, cliente bom", texto: "Quanto mais o produto souber de si (página, apresentação, objeções), mais o cliente simulado pergunta o que um cliente real perguntaria." },
  { titulo: "Olhe por tipo de cliente", texto: "A aba Personas mostra com qual tipo de cliente o time trava. Costuma ser um só — e é nele que vale treinar." },
  { titulo: "Leve a evidência para o 1:1", texto: "Cada nota vem com o trecho da conversa que a justifica. É o que transforma 'você precisa escutar mais' em uma conversa concreta." },
];

/** Semana ISO, só para girar a dica: a mesma semana devolve a mesma dica para todo mundo. */
function semanaDoAno(quando: Date): number {
  const d = new Date(Date.UTC(quando.getUTCFullYear(), quando.getUTCMonth(), quando.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86400000 + 1) / 7);
}

export function dicaDaSemana(quando = new Date()): DicaInicio {
  return DICAS[semanaDoAno(quando) % DICAS.length];
}

/** Diferença para o período anterior. Sem movimento anterior não há variação — e não há zero. */
function variacao(agora: number | null, antes: number | null, houveAntes: boolean): number | null {
  if (agora === null || antes === null || !houveAntes) return null;
  return Math.round((agora - antes) * 10) / 10;
}

/**
 * Os quatro indicadores do topo.
 *
 * A comparação é entre os **últimos 30 dias** e os **30 dias anteriores**, não entre o mês corrente e o
 * mês passado: no dia 3 do mês, três dias de movimento comparados com um mês inteiro inventariam uma
 * queda enorme que não aconteceu. É a mesma janela que o painel da equipe já usa desde antes deste PRD,
 * então os dois números continuam querendo dizer a mesma coisa.
 */
function indicadores(quando: Date): IndicadorInicio[] {
  const ate = new Date(quando.getTime() + 1000).toISOString();
  const inicio = new Date(quando.getTime() - DIAS_DO_PERIODO * 86400000).toISOString();
  const inicioAnterior = new Date(quando.getTime() - 2 * DIAS_DO_PERIODO * 86400000).toISOString();

  const atual = movimentoEntre(inicio, ate);
  const anterior = movimentoEntre(inicioAnterior, inicio);
  const houveAntes = anterior.sessoes > 0;

  return [
    { id: "simulacoes", rotulo: "Simulações realizadas", valor: atual.simulacoes, decimais: 0, variacao: variacao(atual.simulacoes, anterior.simulacoes, houveAntes) },
    { id: "nota", rotulo: "Nota média do time", valor: atual.notaMedia, decimais: 1, variacao: variacao(atual.notaMedia, anterior.notaMedia, anterior.avaliadas > 0) },
    { id: "vendedores", rotulo: "Vendedores treinados", valor: atual.vendedores, decimais: 0, variacao: variacao(atual.vendedores, anterior.vendedores, houveAntes) },
    { id: "sessoes", rotulo: "Sessões realizadas", valor: atual.sessoes, decimais: 0, variacao: variacao(atual.sessoes, anterior.sessoes, houveAntes) },
  ];
}

/**
 * O Início inteiro, de uma vez.
 *
 * Os agregados de sessão saem de consultas agregadas por número (uma para o resumo de todos os treinos,
 * uma para as notas), nunca de uma consulta por cartão — o mesmo desenho das listas de Simulações e de
 * Resultados.
 */
export function montarInicio(quando = new Date()): Inicio {
  // `listarTodos` (e não `listar`) porque o produto de exemplo fica escondido da biblioteca assim que
  // existe um produto real, mas os treinos migrados das salas antigas continuam apontando para ele.
  const produtos = listarTodosProdutos(500);
  const nomes = new Map(produtos.map((p) => [p.id, p.nome]));
  const simulacoes = listarSimulacoes();
  const resumo = resumoPorSimulacao();
  const notas = notaMediaPorSimulacao();

  const ativas = simulacoes
    .filter((s) => s.status === "ativa")
    .map((s) => ({
      codigo: s.codigo,
      nome: s.nome,
      produtoNome: nomes.get(s.produtoId) ?? "Produto apagado",
      metodologia: s.metodologia,
      dificuldade: s.dificuldade,
      participantes: resumo[s.codigo]?.participantes ?? 0,
      sessoes: resumo[s.codigo]?.sessoes ?? 0,
      notaMedia: notas[s.codigo]?.nota ?? null,
      ultimaSessao: resumo[s.codigo]?.ultimaSessao ?? null,
      criadoEm: s.criadoEm,
    }))
    // Por movimento, não por data de criação: o gestor volta ao treino que o time está usando esta
    // semana, que raramente é o último que ele criou (mesma ordem de /resultados).
    .sort((a, b) => (b.ultimaSessao ?? b.criadoEm).localeCompare(a.ultimaSessao ?? a.criadoEm));

  const quatro = indicadores(quando);
  const sessoesDeSempre = Object.values(resumo).reduce((soma, r) => soma + r.sessoes, 0);

  const temProduto = produtos.some((p) => !p.exemplo);
  const temSimulacao = simulacoes.some((s) => !s.exemplo);

  const passos: PassoInicio[] = [
    {
      titulo: "Cadastre o produto",
      apoio: "Cole a página, envie a apresentação ou escreva o que vocês vendem.",
      concluido: temProduto,
      // O cadastro é um formulário na própria `/produtos` (não há `/produtos/novo`); o destino é o mesmo
      // nos dois estados, só o rótulo muda.
      acao: { rotulo: temProduto ? "Ver meus produtos" : "Cadastrar produto", url: "/produtos" },
    },
    {
      titulo: "Crie a simulação",
      apoio: "Escolha a metodologia, a dificuldade e os tipos de cliente do treino.",
      concluido: temSimulacao,
      acao: { rotulo: temSimulacao ? "Ver meus treinos" : "Criar simulação", url: temSimulacao ? "/simulacoes" : "/simulacoes/nova" },
    },
    {
      titulo: "Compartilhe o link",
      apoio: "O mesmo link serve para o time inteiro; cada pessoa treina com um cliente próprio.",
      // Marcado pelo que aconteceu de verdade: alguém abriu o link e conversou. Um link copiado não
      // deixa rastro nenhum no banco, e um passo que se marca sozinho por otimismo não vale nada.
      concluido: sessoesDeSempre > 0,
      acao: { rotulo: "Copiar o link do treino", url: "/simulacoes" },
    },
  ];

  return {
    // Ninguém treinou ainda: os quatro números seriam quatro zeros, que não dizem nada e ainda ocupam o
    // lugar do que importa nesse momento, que é o caminho até a primeira conversa.
    vazio: sessoesDeSempre === 0,
    dias: DIAS_DO_PERIODO,
    indicadores: quatro,
    // `ultimaSessao`/`criadoEm` servem à ordenação acima e não vão para a tela: o cartão fala do que o
    // treino rendeu, e uma data a mais ali só disputaria atenção com os três números que importam.
    ativas: ativas.slice(0, CARTOES).map((s) => ({
      codigo: s.codigo,
      nome: s.nome,
      produtoNome: s.produtoNome,
      metodologia: s.metodologia,
      dificuldade: s.dificuldade,
      participantes: s.participantes,
      sessoes: s.sessoes,
      notaMedia: s.notaMedia,
    })),
    totalAtivas: ativas.length,
    passos,
    dica: dicaDaSemana(quando),
  };
}
