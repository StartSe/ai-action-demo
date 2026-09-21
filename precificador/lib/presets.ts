// Os três negócios de exemplo que o estado vazio oferece. Server-only (grava no banco).
//
// Versionados em código, não num JSON editável sem deploy: preset é texto de tela como qualquer
// outro, e assim passa pelo lint e pelo verificador de linguagem junto com o resto do app.
//
// Os números são plausíveis para setembro de 2026 no Brasil e servem para a pessoa mexer, não para
// ela confiar: tudo é editável e "Apagar os dados de exemplo" tira os três de uma vez.
import { banco } from "./banco";
import { definirCanais, listarCanais } from "./canais";
import { criarItem, definirInsumos } from "./itens";
import { definirCustosFixos, obterNegocio, salvarNegocio } from "./negocio";
import { definirPreco } from "./precos";
import type { DadosNegocio } from "./negocio";
import type { Balde, TipoItem, Unidade } from "./precificacao";

type InsumoPreset = { nome: string; qtdUsada: number; unidadeUso: Unidade; qtdCompra: number; custoCompra: number; unidadeCompra: Unidade };

type ItemPreset = {
  nome: string;
  tipo: TipoItem;
  tempoMinutos: number;
  perdaPct: number;
  margemAlvoPct?: number;
  precoValorTeto?: number;
  precosConcorrentes: number[];
  insumos: InsumoPreset[];
  custoDiretoManual?: number;
  /** Preço já escolhido no canal padrão, para a carteira nascer com algo para ler. */
  preco: number;
};

export type Preset = {
  id: string;
  rotulo: string;
  /** Uma frase sobre quem é esse negócio, mostrada no botão do estado vazio. */
  descricao: string;
  negocio: DadosNegocio;
  custosFixos: { nome: string; valorMensal: number; balde: Balde }[];
  canais: { nome: string; taxaPct: number; taxaFixa: number; padrao?: boolean }[];
  itens: ItemPreset[];
};

export const PRESETS: Preset[] = [
  {
    id: "padaria",
    rotulo: "Padaria",
    descricao: "Vende no balcão e por aplicativo, com receita de insumos",
    negocio: {
      nome: "Padaria da esquina",
      regime: "mei",
      impostoProdutoPct: 0,
      impostoServicoPct: 0,
      modoCapacidade: "unidades",
      volumeMensalUnidades: 3000,
      horasProdutivasMes: 200,
      proLaboreMensal: 4500,
      margemAlvoPadraoPct: 0.25,
      proporcaoProdutoPct: 0.8,
    },
    custosFixos: [
      { nome: "Aluguel", valorMensal: 2800, balde: "produto" },
      { nome: "Energia e gás", valorMensal: 1200, balde: "produto" },
      { nome: "DAS do MEI", valorMensal: 81, balde: "ambos" },
      { nome: "Contador", valorMensal: 250, balde: "ambos" },
    ],
    canais: [
      { nome: "Balcão", taxaPct: 0, taxaFixa: 0, padrao: true },
      { nome: "Maquininha", taxaPct: 0.035, taxaFixa: 0 },
      { nome: "iFood", taxaPct: 0.27, taxaFixa: 0 },
    ],
    itens: [
      {
        nome: "Pão de forma artesanal",
        tipo: "produto",
        tempoMinutos: 12,
        perdaPct: 0.05,
        precosConcorrentes: [14, 18],
        preco: 17,
        insumos: [
          { nome: "Farinha", qtdUsada: 500, unidadeUso: "g", qtdCompra: 1, custoCompra: 6.5, unidadeCompra: "kg" },
          { nome: "Manteiga", qtdUsada: 60, unidadeUso: "g", qtdCompra: 500, custoCompra: 32, unidadeCompra: "g" },
          { nome: "Fermento", qtdUsada: 10, unidadeUso: "g", qtdCompra: 500, custoCompra: 18, unidadeCompra: "g" },
          { nome: "Embalagem", qtdUsada: 1, unidadeUso: "un", qtdCompra: 100, custoCompra: 45, unidadeCompra: "un" },
        ],
      },
      {
        nome: "Bolo de cenoura inteiro",
        tipo: "produto",
        tempoMinutos: 35,
        perdaPct: 0.04,
        precoValorTeto: 65,
        precosConcorrentes: [42, 55],
        preco: 48,
        insumos: [
          { nome: "Farinha", qtdUsada: 400, unidadeUso: "g", qtdCompra: 1, custoCompra: 6.5, unidadeCompra: "kg" },
          { nome: "Cenoura", qtdUsada: 350, unidadeUso: "g", qtdCompra: 1, custoCompra: 5.9, unidadeCompra: "kg" },
          { nome: "Ovos", qtdUsada: 4, unidadeUso: "un", qtdCompra: 30, custoCompra: 24, unidadeCompra: "un" },
          { nome: "Chocolate da cobertura", qtdUsada: 200, unidadeUso: "g", qtdCompra: 1, custoCompra: 48, unidadeCompra: "kg" },
          { nome: "Embalagem", qtdUsada: 1, unidadeUso: "un", qtdCompra: 50, custoCompra: 90, unidadeCompra: "un" },
        ],
      },
      {
        nome: "Café expresso",
        tipo: "produto",
        tempoMinutos: 2,
        perdaPct: 0.08,
        precosConcorrentes: [6],
        preco: 6.5,
        insumos: [
          { nome: "Café em grão", qtdUsada: 9, unidadeUso: "g", qtdCompra: 1, custoCompra: 62, unidadeCompra: "kg" },
          { nome: "Copo e açúcar", qtdUsada: 1, unidadeUso: "un", qtdCompra: 100, custoCompra: 18, unidadeCompra: "un" },
        ],
      },
    ],
  },
  {
    id: "estudio",
    rotulo: "Estúdio de design",
    descricao: "Cobra por projeto, com o tempo da equipe como custo principal",
    negocio: {
      nome: "Estúdio de design",
      regime: "simples",
      impostoProdutoPct: 0.06,
      impostoServicoPct: 0.06,
      modoCapacidade: "horas",
      volumeMensalUnidades: 0,
      horasProdutivasMes: 150,
      proLaboreMensal: 9000,
      margemAlvoPadraoPct: 0.3,
      proporcaoProdutoPct: 0.5,
    },
    custosFixos: [
      { nome: "Sala e internet", valorMensal: 1800, balde: "servico" },
      { nome: "Assinaturas de software", valorMensal: 640, balde: "servico" },
      { nome: "Contador", valorMensal: 380, balde: "servico" },
    ],
    canais: [
      { nome: "Venda direta", taxaPct: 0, taxaFixa: 0, padrao: true },
      { nome: "Cartão parcelado", taxaPct: 0.042, taxaFixa: 0 },
      { nome: "Plataforma de freelance", taxaPct: 0.2, taxaFixa: 0 },
    ],
    itens: [
      {
        nome: "Identidade visual completa",
        tipo: "servico",
        tempoMinutos: 2400,
        perdaPct: 0.1,
        precoValorTeto: 14000,
        precosConcorrentes: [6500, 12000],
        preco: 9800,
        insumos: [{ nome: "Licença de fontes", qtdUsada: 1, unidadeUso: "un", qtdCompra: 1, custoCompra: 320, unidadeCompra: "un" }],
      },
      {
        nome: "Landing page de campanha",
        tipo: "servico",
        tempoMinutos: 900,
        perdaPct: 0.08,
        precosConcorrentes: [2800, 4500],
        preco: 3600,
        insumos: [{ nome: "Banco de imagens", qtdUsada: 6, unidadeUso: "un", qtdCompra: 50, custoCompra: 390, unidadeCompra: "un" }],
      },
      {
        nome: "Pacote mensal de social",
        tipo: "servico",
        tempoMinutos: 1200,
        perdaPct: 0.05,
        margemAlvoPct: 0.2,
        precosConcorrentes: [1900],
        preco: 2400,
        insumos: [],
        custoDiretoManual: 0,
      },
    ],
  },
  {
    id: "assistencia",
    rotulo: "Assistência técnica",
    descricao: "Mistura peça e mão de obra no mesmo orçamento",
    negocio: {
      nome: "Assistência técnica",
      regime: "simples",
      impostoProdutoPct: 0.04,
      impostoServicoPct: 0.06,
      modoCapacidade: "ambos",
      volumeMensalUnidades: 120,
      horasProdutivasMes: 170,
      proLaboreMensal: 5200,
      margemAlvoPadraoPct: 0.28,
      proporcaoProdutoPct: 0.35,
    },
    custosFixos: [
      { nome: "Loja e água", valorMensal: 2200, balde: "ambos" },
      { nome: "Energia", valorMensal: 480, balde: "ambos" },
      { nome: "Ferramentas e bancada", valorMensal: 300, balde: "servico" },
      { nome: "Contador", valorMensal: 320, balde: "ambos" },
    ],
    canais: [
      { nome: "Balcão", taxaPct: 0, taxaFixa: 0, padrao: true },
      { nome: "Maquininha", taxaPct: 0.0349, taxaFixa: 0.39 },
      { nome: "Marketplace de reparo", taxaPct: 0.18, taxaFixa: 0 },
    ],
    itens: [
      {
        nome: "Troca de tela de celular",
        tipo: "produto",
        tempoMinutos: 45,
        perdaPct: 0.03,
        precoValorTeto: 720,
        precosConcorrentes: [430, 610],
        preco: 550,
        insumos: [
          { nome: "Tela original", qtdUsada: 1, unidadeUso: "un", qtdCompra: 1, custoCompra: 280, unidadeCompra: "un" },
          { nome: "Cola e adesivo", qtdUsada: 1, unidadeUso: "un", qtdCompra: 20, custoCompra: 68, unidadeCompra: "un" },
        ],
      },
      {
        nome: "Troca de bateria",
        tipo: "produto",
        tempoMinutos: 25,
        perdaPct: 0.02,
        precosConcorrentes: [180, 240],
        preco: 199,
        insumos: [{ nome: "Bateria", qtdUsada: 1, unidadeUso: "un", qtdCompra: 1, custoCompra: 95, unidadeCompra: "un" }],
      },
      {
        nome: "Limpeza e diagnóstico",
        tipo: "servico",
        tempoMinutos: 60,
        perdaPct: 0,
        precosConcorrentes: [90],
        preco: 120,
        insumos: [{ nome: "Material de limpeza", qtdUsada: 1, unidadeUso: "un", qtdCompra: 40, custoCompra: 56, unidadeCompra: "un" }],
      },
    ],
  },
];

export function obterPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** true quando existe qualquer item vindo de preset — o que habilita "Apagar os dados de exemplo". */
export function temExemplos(): boolean {
  const linha = banco().prepare("SELECT COUNT(*) AS total FROM itens WHERE exemplo = 1").get() as { total: number };
  return linha.total > 0;
}

/**
 * Carrega um preset por cima do que existir. Sobrescreve o negócio e os canais (é "comece assim",
 * não "acrescente isto") e marca os itens criados como exemplo, para poderem ser apagados juntos.
 */
export function carregarPreset(id: string): void {
  const preset = obterPreset(id);
  if (!preset) throw new Error("Esse exemplo não existe.");

  const negocio = salvarNegocio(preset.negocio);
  definirCustosFixos(negocio.id, preset.custosFixos);
  definirCanais(negocio.id, preset.canais.map((c) => ({ ...c, padrao: Boolean(c.padrao) })));
  const canais = listarCanais(negocio.id);
  const padrao = canais.find((c) => c.padrao) ?? canais[0];

  for (const modelo of preset.itens) {
    const item = criarItem(negocio.id, {
      nome: modelo.nome,
      tipo: modelo.tipo,
      tempoMinutos: modelo.tempoMinutos,
      perdaPct: modelo.perdaPct,
      margemAlvoPct: modelo.margemAlvoPct,
      precoValorTeto: modelo.precoValorTeto,
      precosConcorrentes: modelo.precosConcorrentes,
      custoDiretoManual: modelo.custoDiretoManual,
      exemplo: true,
    });
    definirInsumos(item.id, modelo.insumos.map((l) => ({ ...l })));
    if (padrao) definirPreco(item.id, padrao.id, modelo.preco);
  }
}

/** Apaga só os itens marcados como exemplo. O negócio e os canais ficam: eles já foram editados. */
export function apagarExemplos(): void {
  const d = banco();
  const linhas = d.prepare("SELECT id FROM itens WHERE exemplo = 1").all() as { id: string }[];
  for (const { id } of linhas) {
    d.prepare("DELETE FROM versoes_preco WHERE item_id = ?").run(id);
    d.prepare("DELETE FROM precos_canal WHERE item_id = ?").run(id);
    d.prepare("DELETE FROM linhas_insumo WHERE item_id = ?").run(id);
    d.prepare("DELETE FROM itens WHERE id = ?").run(id);
  }
}

/** Existe negócio configurado? Usado pelo estado vazio para decidir o que oferecer. */
export function negocioConfigurado(): boolean {
  const n = obterNegocio();
  return Boolean(n && (n.volumeMensalUnidades > 0 || n.horasProdutivasMes > 0));
}
