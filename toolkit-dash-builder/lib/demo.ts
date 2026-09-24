// Respostas de exemplo usadas quando não há chave de IA configurada. Têm a MESMA forma da resposta
// real, para app/page.tsx nunca precisar saber em qual modo está.
import { formatar, normalizar, variacao, variacaoTexto } from "./formatar";
import type { ComponentePainel, EspecPainel, Observacao, RespostaEsclarecimento, RespostaRefinamento } from "./types";

export function esperar(ms = 1200) {
  return new Promise((r) => setTimeout(r, ms));
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];
const serie = (valores: number[]) => MESES.map((rotulo, i) => ({ rotulo, valor: valores[i] }));

const VENDAS: EspecPainel = {
  titulo: "Painel comercial do mês",
  resumo: "Acompanha receita, ticket médio, conversão do funil, o ranking do time e as oportunidades em aberto.",
  setor: "Vendas",
  componentes: [
    { id: "c1", tipo: "indicador", titulo: "Receita do mês", posicao: { linha: 0, coluna: 0, largura: 1 }, dados: { valor: 487000, anterior: 412000, formato: "moeda", prefixo: "R$", direcaoBoa: "aumentar" } },
    { id: "c2", tipo: "indicador", titulo: "Ticket médio", posicao: { linha: 0, coluna: 1, largura: 1 }, dados: { valor: 6180, anterior: 5720, formato: "moeda", prefixo: "R$", direcaoBoa: "aumentar" } },
    { id: "c3", tipo: "indicador", titulo: "Conversão do funil", posicao: { linha: 0, coluna: 2, largura: 1 }, dados: { valor: 18.5, anterior: 16.2, formato: "percentual", direcaoBoa: "aumentar" } },
    { id: "c4", tipo: "indicador", titulo: "Oportunidades abertas", posicao: { linha: 0, coluna: 3, largura: 1 }, dados: { valor: 64, anterior: 71, formato: "numero", direcaoBoa: "aumentar" } },
    { id: "c5", tipo: "linha", titulo: "Receita nos últimos 6 meses", posicao: { linha: 1, coluna: 0, largura: 2 }, dados: { eixoX: "Mês", eixoY: "Receita", formato: "moeda", prefixo: "R$", pontos: serie([320000, 358000, 341000, 402000, 388000, 487000]) } },
    { id: "c6", tipo: "barra", titulo: "Top 5 vendedores", posicao: { linha: 1, coluna: 2, largura: 2 }, dados: { eixoX: "Vendedor", eixoY: "Receita", formato: "moeda", prefixo: "R$", orientacao: "horizontal", pontos: [
      { rotulo: "Ana Silva", valor: 142000 }, { rotulo: "Carlos Souza", valor: 118000 }, { rotulo: "Mariana Costa", valor: 96500 }, { rotulo: "Pedro Lima", valor: 74200 }, { rotulo: "Juliana Alves", valor: 56300 },
    ] } },
    { id: "c7", tipo: "rosca", titulo: "Receita por canal", posicao: { linha: 2, coluna: 0, largura: 2 }, dados: { formato: "moeda", prefixo: "R$", fatias: [
      { rotulo: "Indicação", valor: 185000 }, { rotulo: "Busca paga", valor: 142000 }, { rotulo: "Eventos", valor: 88000 }, { rotulo: "Parceiros", valor: 72000 },
    ] } },
    { id: "c8", tipo: "tabela", titulo: "Maiores oportunidades abertas", posicao: { linha: 2, coluna: 2, largura: 2 }, dados: {
      colunas: [
        { chave: "cliente", rotulo: "Cliente", tipo: "texto" },
        { chave: "valor", rotulo: "Valor", tipo: "moeda" },
        { chave: "etapa", rotulo: "Etapa", tipo: "texto" },
        { chave: "fechamento", rotulo: "Previsão", tipo: "data" },
      ],
      linhas: [
        { cliente: "Construtora Aurora", valor: 148000, etapa: "Proposta", fechamento: "2026-10-15" },
        { cliente: "Rede Boa Mesa", valor: 96000, etapa: "Negociação", fechamento: "2026-10-08" },
        { cliente: "Clínica Vida Plena", valor: 72500, etapa: "Proposta", fechamento: "2026-10-22" },
        { cliente: "Transportes Horizonte", valor: 61000, etapa: "Qualificação", fechamento: "2026-11-05" },
        { cliente: "Colégio Novo Saber", valor: 48000, etapa: "Negociação", fechamento: "2026-10-30" },
      ],
    } },
  ],
};

const FINANCEIRO: EspecPainel = {
  titulo: "Painel financeiro do trimestre",
  resumo: "Mostra receita, despesas, margem e caixa, o fluxo mês a mês, os gastos por categoria e as contas a receber.",
  setor: "Financeiro",
  componentes: [
    { id: "c1", tipo: "indicador", titulo: "Receita do mês", posicao: { linha: 0, coluna: 0, largura: 1 }, dados: { valor: 1240000, anterior: 1185000, formato: "moeda", prefixo: "R$", direcaoBoa: "aumentar" } },
    { id: "c2", tipo: "indicador", titulo: "Despesas do mês", posicao: { linha: 0, coluna: 1, largura: 1 }, dados: { valor: 962000, anterior: 918000, formato: "moeda", prefixo: "R$", direcaoBoa: "diminuir" } },
    { id: "c3", tipo: "indicador", titulo: "Margem líquida", posicao: { linha: 0, coluna: 2, largura: 1 }, dados: { valor: 22.4, anterior: 22.5, formato: "percentual", direcaoBoa: "aumentar" } },
    { id: "c4", tipo: "indicador", titulo: "Saldo em caixa", posicao: { linha: 0, coluna: 3, largura: 1 }, dados: { valor: 2860000, anterior: 2540000, formato: "moeda", prefixo: "R$", direcaoBoa: "aumentar" } },
    { id: "c5", tipo: "area", titulo: "Fluxo de caixa nos últimos 6 meses", posicao: { linha: 1, coluna: 0, largura: 2 }, dados: { eixoX: "Mês", eixoY: "Saldo", formato: "moeda", prefixo: "R$", pontos: serie([1920000, 2110000, 2040000, 2380000, 2540000, 2860000]) } },
    { id: "c6", tipo: "barra", titulo: "Despesas por mês", posicao: { linha: 1, coluna: 2, largura: 2 }, dados: { eixoX: "Mês", eixoY: "Despesas", formato: "moeda", prefixo: "R$", orientacao: "vertical", pontos: serie([874000, 902000, 865000, 931000, 918000, 962000]) } },
    { id: "c7", tipo: "pizza", titulo: "Gastos por categoria", posicao: { linha: 2, coluna: 0, largura: 2 }, dados: { formato: "moeda", prefixo: "R$", fatias: [
      { rotulo: "Pessoal", valor: 468000 }, { rotulo: "Fornecedores", valor: 214000 }, { rotulo: "Marketing", valor: 118000 }, { rotulo: "Ocupação", valor: 92000 }, { rotulo: "Tecnologia", valor: 70000 },
    ] } },
    { id: "c8", tipo: "tabela", titulo: "Contas a receber vencendo", posicao: { linha: 2, coluna: 2, largura: 2 }, dados: {
      colunas: [
        { chave: "cliente", rotulo: "Cliente", tipo: "texto" },
        { chave: "valor", rotulo: "Valor", tipo: "moeda" },
        { chave: "vencimento", rotulo: "Vencimento", tipo: "data" },
        { chave: "situacao", rotulo: "Situação", tipo: "texto" },
      ],
      linhas: [
        { cliente: "Distribuidora Serra Azul", valor: 186000, vencimento: "2026-10-05", situacao: "Em dia" },
        { cliente: "Indústria Pontal", valor: 142500, vencimento: "2026-09-28", situacao: "Atrasado" },
        { cliente: "Grupo Maresia", valor: 97800, vencimento: "2026-10-12", situacao: "Em dia" },
        { cliente: "Farmácias Bem Viver", valor: 64200, vencimento: "2026-10-18", situacao: "Em dia" },
        { cliente: "Atacado Central", valor: 51900, vencimento: "2026-09-30", situacao: "Atrasado" },
        { cliente: "Hotel Mirante", valor: 38400, vencimento: "2026-10-25", situacao: "Em dia" },
      ],
    } },
  ],
};

const MARKETING: EspecPainel = {
  titulo: "Painel de marketing e aquisição",
  resumo: "Reúne custo por lead, custo de aquisição, retorno sobre anúncios, a evolução dos leads e o desempenho por canal e campanha.",
  setor: "Marketing",
  componentes: [
    { id: "c1", tipo: "indicador", titulo: "Custo por lead", posicao: { linha: 0, coluna: 0, largura: 1 }, dados: { valor: 42.5, anterior: 48.1, formato: "moeda", prefixo: "R$", direcaoBoa: "diminuir" } },
    { id: "c2", tipo: "indicador", titulo: "Custo de aquisição de cliente", posicao: { linha: 0, coluna: 1, largura: 1 }, dados: { valor: 890, anterior: 940, formato: "moeda", prefixo: "R$", direcaoBoa: "diminuir" } },
    { id: "c3", tipo: "indicador", titulo: "Retorno sobre anúncios", posicao: { linha: 0, coluna: 2, largura: 1 }, dados: { valor: 4.2, anterior: 3.8, formato: "numero", direcaoBoa: "aumentar" } },
    { id: "c4", tipo: "indicador", titulo: "Leads no mês", posicao: { linha: 0, coluna: 3, largura: 1 }, dados: { valor: 2184, anterior: 1930, formato: "numero", direcaoBoa: "aumentar" } },
    { id: "c5", tipo: "linha", titulo: "Leads nos últimos 6 meses", posicao: { linha: 1, coluna: 0, largura: 2 }, dados: { eixoX: "Mês", eixoY: "Leads", formato: "numero", pontos: serie([1420, 1610, 1550, 1880, 1930, 2184]) } },
    { id: "c6", tipo: "barra", titulo: "Top 6 campanhas por conversão", posicao: { linha: 1, coluna: 2, largura: 2 }, dados: { eixoX: "Campanha", eixoY: "Conversão", formato: "percentual", orientacao: "horizontal", pontos: [
      { rotulo: "Volta às aulas", valor: 7.8 }, { rotulo: "Indique um amigo", valor: 6.9 }, { rotulo: "Webinar mensal", valor: 5.4 }, { rotulo: "Busca de marca", valor: 4.7 }, { rotulo: "Retomada de carrinho", valor: 3.9 }, { rotulo: "Dia dos Pais", valor: 3.1 },
    ] } },
    { id: "c7", tipo: "rosca", titulo: "Tráfego por canal", posicao: { linha: 2, coluna: 0, largura: 2 }, dados: { formato: "numero", fatias: [
      { rotulo: "Busca orgânica", valor: 48200 }, { rotulo: "Anúncios pagos", valor: 31500 }, { rotulo: "Redes sociais", valor: 22800 }, { rotulo: "E-mail", valor: 12400 }, { rotulo: "Direto", valor: 9700 },
    ] } },
    { id: "c8", tipo: "tabela", titulo: "Campanhas do mês", posicao: { linha: 2, coluna: 2, largura: 2 }, dados: {
      colunas: [
        { chave: "campanha", rotulo: "Campanha", tipo: "texto" },
        { chave: "investimento", rotulo: "Investimento", tipo: "moeda" },
        { chave: "leads", rotulo: "Leads", tipo: "numero" },
        { chave: "conversao", rotulo: "Conversão", tipo: "percentual" },
      ],
      linhas: [
        { campanha: "Volta às aulas", investimento: 28000, leads: 612, conversao: 7.8 },
        { campanha: "Indique um amigo", investimento: 9500, leads: 348, conversao: 6.9 },
        { campanha: "Webinar mensal", investimento: 12200, leads: 297, conversao: 5.4 },
        { campanha: "Busca de marca", investimento: 18400, leads: 455, conversao: 4.7 },
        { campanha: "Retomada de carrinho", investimento: 7600, leads: 221, conversao: 3.9 },
        { campanha: "Dia dos Pais", investimento: 16800, leads: 251, conversao: 3.1 },
      ],
    } },
  ],
};

const ASSINATURA: EspecPainel = {
  titulo: "Painel de receita recorrente",
  resumo: "Acompanha receita recorrente, cancelamento, novos clientes e caixa, com a evolução mensal, a base por plano e os maiores clientes.",
  setor: "SaaS",
  componentes: [
    { id: "c1", tipo: "indicador", titulo: "Receita recorrente mensal", posicao: { linha: 0, coluna: 0, largura: 1 }, dados: { valor: 386000, anterior: 352000, formato: "moeda", prefixo: "R$", direcaoBoa: "aumentar" } },
    { id: "c2", tipo: "indicador", titulo: "Cancelamento mensal", posicao: { linha: 0, coluna: 1, largura: 1 }, dados: { valor: 2.1, anterior: 2.6, formato: "percentual", direcaoBoa: "diminuir" } },
    { id: "c3", tipo: "indicador", titulo: "Novos clientes", posicao: { linha: 0, coluna: 2, largura: 1 }, dados: { valor: 58, anterior: 44, formato: "numero", direcaoBoa: "aumentar" } },
    { id: "c4", tipo: "indicador", titulo: "Meses de caixa", posicao: { linha: 0, coluna: 3, largura: 1 }, dados: { valor: 19, anterior: 21, formato: "numero", direcaoBoa: "aumentar" } },
    { id: "c5", tipo: "linha", titulo: "Receita recorrente nos últimos 6 meses", posicao: { linha: 1, coluna: 0, largura: 2 }, dados: { eixoX: "Mês", eixoY: "Receita recorrente", formato: "moeda", prefixo: "R$", pontos: serie([298000, 311000, 324000, 338000, 352000, 386000]) } },
    { id: "c6", tipo: "barra", titulo: "Novos contra cancelados por mês", posicao: { linha: 1, coluna: 2, largura: 2 }, dados: { eixoX: "Mês", eixoY: "Clientes", formato: "numero", orientacao: "vertical", pontos: [
      { rotulo: "Abr novos", valor: 41 }, { rotulo: "Abr cancelados", valor: 14 }, { rotulo: "Mai novos", valor: 44 }, { rotulo: "Mai cancelados", valor: 16 }, { rotulo: "Jun novos", valor: 58 }, { rotulo: "Jun cancelados", valor: 12 },
    ] } },
    { id: "c7", tipo: "rosca", titulo: "Receita por plano", posicao: { linha: 2, coluna: 0, largura: 2 }, dados: { formato: "moeda", prefixo: "R$", fatias: [
      { rotulo: "Empresarial", valor: 186000 }, { rotulo: "Profissional", valor: 124000 }, { rotulo: "Essencial", valor: 76000 },
    ] } },
    { id: "c8", tipo: "tabela", titulo: "Maiores clientes por receita", posicao: { linha: 2, coluna: 2, largura: 2 }, dados: {
      colunas: [
        { chave: "cliente", rotulo: "Cliente", tipo: "texto" },
        { chave: "plano", rotulo: "Plano", tipo: "texto" },
        { chave: "mensalidade", rotulo: "Mensalidade", tipo: "moeda" },
        { chave: "desde", rotulo: "Cliente desde", tipo: "data" },
      ],
      linhas: [
        { cliente: "Cooperativa Vale Verde", plano: "Empresarial", mensalidade: 18400, desde: "2023-03-10" },
        { cliente: "Logística Rápida", plano: "Empresarial", mensalidade: 15200, desde: "2022-11-02" },
        { cliente: "Escola Horizonte", plano: "Profissional", mensalidade: 9800, desde: "2024-02-19" },
        { cliente: "Clínica São Bento", plano: "Profissional", mensalidade: 8600, desde: "2023-08-25" },
        { cliente: "Studio Forma", plano: "Essencial", mensalidade: 4200, desde: "2025-01-14" },
      ],
    } },
  ],
};

export const PAINEIS_DEMO = { vendas: VENDAS, financeiro: FINANCEIRO, marketing: MARKETING, assinatura: ASSINATURA } as const;
export type ChaveDemo = keyof typeof PAINEIS_DEMO;

const PALAVRAS_CHAVE: Record<ChaveDemo, string[]> = {
  vendas: ["vendas", "venda", "comercial", "funil", "vendedor", "vendedores", "lead", "proposta", "conversao", "crm"],
  financeiro: ["financeiro", "caixa", "despesa", "despesas", "custo", "custos", "margem", "lucro", "contas", "orcamento", "inadimplencia"],
  marketing: ["marketing", "campanha", "campanhas", "anuncio", "anuncios", "trafego", "canal", "canais", "aquisicao", "lead", "retorno", "engajamento"],
  assinatura: ["assinatura", "assinaturas", "recorrente", "cancelamento", "churn", "mensalidade", "plano", "planos", "retencao", "saas"],
};

const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Escolhe o painel de exemplo pela contagem de palavras-chave; empate ou nenhum acerto devolve "vendas". */
export function painelDemo(descricao: string): EspecPainel {
  const tokens = normalizar(descricao).split(/[^a-z0-9]+/).filter(Boolean);
  let melhor: ChaveDemo = "vendas";
  let maior = 0;
  for (const chave of Object.keys(PALAVRAS_CHAVE) as ChaveDemo[]) {
    const pontos = tokens.filter((t) => PALAVRAS_CHAVE[chave].includes(t)).length;
    if (pontos > maior) { maior = pontos; melhor = chave; }
  }
  return clonar(PAINEIS_DEMO[melhor]);
}

/** Duas perguntas fixas (área e período) para quando a heurística local pede esclarecimento em demonstração. */
export function esclarecimentoDemo(): RespostaEsclarecimento {
  return {
    precisaEsclarecer: true,
    perguntas: [
      { id: "setor", pergunta: "Qual área você quer acompanhar?", sugestoes: ["Vendas", "Financeiro", "Marketing", "Assinaturas"] },
      { id: "periodo", pergunta: "Qual período interessa mais?", sugestoes: ["Últimos 6 meses", "Mês atual", "Ano corrente"] },
    ],
  };
}

/**
 * Transformação determinística de exemplo: pizza/rosca converte a primeira barra em rosca; "acrescente"/
 * "adicione" acrescenta um indicador de ticket médio; senão troca o título. A mensagem deixa claro que é exemplo.
 */
export function refinamentoDemo(painel: EspecPainel, pedido: string): RespostaRefinamento {
  const p = normalizar(pedido);
  const novo = clonar(painel);
  if (/pizza|rosca|distribuic/.test(p)) {
    const barra = novo.componentes.find((c) => c.tipo === "barra");
    if (barra && barra.tipo === "barra") {
      const convertido: ComponentePainel = { id: barra.id, titulo: barra.titulo, posicao: barra.posicao, tipo: /pizza/.test(p) ? "pizza" : "rosca", dados: { formato: barra.dados.formato, prefixo: barra.dados.prefixo, fatias: barra.dados.pontos.slice(0, 6) } };
      novo.componentes = novo.componentes.map((c) => (c.id === barra.id ? convertido : c));
      return { painel: novo, mensagem: `Exemplo de ajuste: troquei "${barra.titulo}" por um gráfico de ${convertido.tipo}, com os mesmos valores. Conecte a IA para ajustes sob medida.`, componentesAlterados: [barra.id] };
    }
  }
  if (/acrescent|adicion|inclu|coloc/.test(p)) {
    const dados = { valor: 487000, anterior: 412000, meta: 520000, formato: "moeda" as const, prefixo: "R$", direcaoBoa: "aumentar" as const };
    if (novo.componentes.length >= 8) {
      // O painel já está no máximo de 8 cartões: o último indicador da primeira linha dá lugar ao novo.
      const ultimo = [...novo.componentes].reverse().find((c) => c.tipo === "indicador");
      if (ultimo) {
        novo.componentes = novo.componentes.map((c) => (c.id === ultimo.id ? { id: c.id, posicao: c.posicao, tipo: "indicador", titulo: "Receita contra a meta", dados } : c));
        return { painel: novo, mensagem: `Exemplo de ajuste: o painel já tinha o máximo de 8 cartões, então troquei "${ultimo.titulo}" por um indicador de receita contra a meta. Conecte a IA para acrescentar exatamente o que você pediu.`, componentesAlterados: [ultimo.id] };
      }
    }
    const n = novo.componentes.length + 1;
    const ocupadas = novo.componentes.filter((c) => c.posicao.linha === 0).reduce((s, c) => s + c.posicao.largura, 0);
    const ultima = Math.max(...novo.componentes.map((c) => c.posicao.linha));
    const posicao = ocupadas < 4 ? { linha: 0, coluna: ocupadas, largura: 1 as const } : { linha: ultima + 1, coluna: 0, largura: 1 as const };
    const indicador: ComponentePainel = { id: `c${n}`, tipo: "indicador", titulo: "Receita contra a meta", posicao, dados };
    novo.componentes.push(indicador);
    return { painel: novo, mensagem: "Exemplo de ajuste: acrescentei um indicador de receita contra a meta, com números de exemplo. Conecte a IA para acrescentar exatamente o que você pediu.", componentesAlterados: [indicador.id] };
  }
  novo.titulo = novo.titulo.endsWith(" (ajustado)") ? novo.titulo : `${novo.titulo} (ajustado)`.slice(0, 60);
  return { painel: novo, mensagem: "Exemplo de ajuste: mudei só o título do painel. Em demonstração eu reconheço pedidos de pizza, rosca e acréscimo de indicador; conecte a IA para o resto.", componentesAlterados: [] };
}

/** Três observações calculadas de verdade a partir dos números do painel: maior crescimento da série, maior fatia e uma sugestão fixa por setor. */
export function observacoesDemo(painel: EspecPainel): Observacao[] {
  const observacoes: Observacao[] = [];
  const serieTemporal = painel.componentes.find((c) => c.tipo === "linha" || c.tipo === "area");
  if (serieTemporal && (serieTemporal.tipo === "linha" || serieTemporal.tipo === "area") && serieTemporal.dados.pontos.length >= 2) {
    const pontos = serieTemporal.dados.pontos;
    const primeiro = pontos[0];
    const ultimo = pontos[pontos.length - 1];
    const v = variacao(ultimo.valor, primeiro.valor);
    observacoes.push({ tipo: "tendencia", mensagem: `No painel gerado, "${serieTemporal.titulo}" vai de ${formatar(primeiro.valor, serieTemporal.dados.formato, true)} em ${primeiro.rotulo} para ${formatar(ultimo.valor, serieTemporal.dados.formato, true)} em ${ultimo.rotulo} (${variacaoTexto(v)}).` });
  }
  const distribuicao = painel.componentes.find((c) => c.tipo === "pizza" || c.tipo === "rosca");
  if (distribuicao && (distribuicao.tipo === "pizza" || distribuicao.tipo === "rosca")) {
    const fatias = [...distribuicao.dados.fatias].sort((a, b) => b.valor - a.valor);
    const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
    const maior = fatias[0];
    const parte = Math.round((maior.valor / total) * 100);
    observacoes.push({ tipo: "anomalia", mensagem: `Neste exemplo, "${maior.rotulo}" concentra ${parte}% de "${distribuicao.titulo}" — vale entender se essa dependência é confortável.` });
  }
  const sugestoes: Record<string, string> = {
    Vendas: "Falta um recorte por região: com ticket médio e conversão na mão, ver a receita por estado mostraria onde investir.",
    Financeiro: "Um indicador de inadimplência ao lado das contas a receber ajudaria a ler o risco de caixa dos próximos meses.",
    Marketing: "Vale acrescentar o valor do cliente ao longo do tempo por canal, para comparar com o custo de aquisição de cada um.",
    SaaS: "Um gráfico de expansão de receita nos clientes atuais mostraria quanto do crescimento vem da base, não só de novos contratos.",
  };
  observacoes.push({ tipo: "sugestao", mensagem: sugestoes[painel.setor] ?? "Um recorte por período (mês contra mês anterior) em cada gráfico deixaria a leitura de tendência mais direta." });
  return observacoes.slice(0, 3);
}
