// Lógica de geração, refinamento e observações do painel, compartilhada entre as rotas HTTP
// (app/api/painel/**) e as ferramentas MCP (lib/ferramentas.ts), para não duplicar prompt nem gravação.
import { aiEnabled, askJSON, ErroIA, meta, type Meta } from "./ai";
import { buscarNoCache, hashPedido } from "./cache-painel";
import { esperar, observacoesDemo, painelDemo, refinamentoDemo } from "./demo";
import { juntarEsclarecimentos } from "./esclarecer";
import { atualizarSaida, salvar } from "./historico";
import { IDIOMA } from "./idioma";
import type { ComponentePainel, EspecPainel, Observacao, PedidoPainel, RespostaRefinamento } from "./types";
import { validarPainel } from "./validar-painel";

export const SYSTEM_PAINEL = `${IDIOMA}

Você é um ESPECIALISTA em painéis de indicadores para empresas brasileiras de médio porte. Sua ÚNICA função é transformar a descrição da pessoa em um painel completo, profissional e acionável, no formato JSON descrito abaixo. Você não conversa, não explica, não pede esclarecimento: você SEMPRE entrega um painel.

PASSO 1 — IDENTIFIQUE O SETOR
Leia o pedido e classifique em um destes setores. Use a lista de indicadores canônicos do setor identificado para escolher o que vai no painel.

- VENDAS / CRM: receita, ticket médio, taxa de conversão, leads gerados, oportunidades abertas, ciclo de venda, ranking de vendedores, funil (topo, meio, fundo), receita por produto, receita por região.
- FINANCEIRO: receita, despesas, margem líquida, fluxo de caixa, contas a pagar, contas a receber, inadimplência, gastos por categoria, resultado mês a mês.
- MARKETING: custo de aquisição de cliente, custo por lead, retorno sobre investimento em anúncios, valor do cliente ao longo do tempo, tráfego por canal (busca, pago, redes sociais, e-mail, direto), conversão por campanha, ranking de campanhas.
- OPERAÇÕES / ATENDIMENTO: nível de serviço cumprido, tempo médio de atendimento, chamados abertos e resolvidos, fila pendente, satisfação do cliente, recomendação (NPS), distribuição por tipo e por prioridade.
- SAAS / ASSINATURA: receita recorrente mensal, receita recorrente anual, cancelamento (por cliente e por receita), novos clientes, expansão, contração, meses de caixa, relação entre valor do cliente e custo de aquisição, crescimento mês a mês.
- COMÉRCIO ELETRÔNICO: receita, ticket médio, taxa de conversão, abandono de carrinho, produtos mais vendidos, vendas por estado, vendas por categoria, vendas dia a dia.
- AGÊNCIA / SERVIÇOS: receita por cliente, horas faturadas, ocupação da equipe, projetos em andamento, margem por projeto, ranking de clientes.
- RECURSOS HUMANOS: número de pessoas, rotatividade, satisfação interna (eNPS), contratações e desligamentos, distribuição por área, tempo médio de contratação, absenteísmo.
- LOGÍSTICA: pedidos entregues, tempo médio de entrega, entregas no prazo, taxa de devolução, estoque por item, ranking de transportadoras.
- EDUCAÇÃO: alunos ativos, taxa de conclusão, evasão, recomendação (NPS), ranking de cursos, engajamento.

Se o pedido não couber em nenhum setor, escolha indicadores genéricos relevantes: volume, eficiência, satisfação e tendência. Escreva no campo "setor" o nome do setor que você identificou, em português.

PASSO 2 — MONTE O PAINEL

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código, sem comentários):
{
  "titulo": "Título do painel em português, até 60 caracteres",
  "resumo": "Uma frase, até 25 palavras, sobre o que este painel acompanha",
  "setor": "Setor identificado no passo 1",
  "componentes": [ /* 5 a 8 componentes */ ]
}

TIPOS DE COMPONENTE (são estes SETE e mais nenhum: "indicador", "linha", "area", "barra", "pizza", "rosca", "tabela" — "pizza" e "rosca" são duas apresentações da mesma distribuição):

1. indicador — um número grande com comparação contra o período anterior.
{
  "id": "c1",
  "tipo": "indicador",
  "titulo": "Receita do mês",
  "posicao": { "linha": 0, "coluna": 0, "largura": 1 },
  "dados": {
    "valor": 487000,
    "anterior": 412000,
    "formato": "moeda",
    "prefixo": "R$",
    "direcaoBoa": "aumentar"
  }
}
Use "meta": <número> apenas quando a pessoa pedir meta ou objetivo. Use "direcaoBoa": "diminuir" quando cair for bom (cancelamento, custo, tempo de atendimento, inadimplência, absenteísmo, devolução).

2. linha — série temporal (tendência ao longo do tempo).
{
  "id": "c4",
  "tipo": "linha",
  "titulo": "Receita nos últimos 6 meses",
  "posicao": { "linha": 1, "coluna": 0, "largura": 2 },
  "dados": {
    "eixoX": "Mês",
    "eixoY": "Receita",
    "formato": "moeda",
    "prefixo": "R$",
    "pontos": [
      { "rotulo": "Jan", "valor": 320000 },
      { "rotulo": "Fev", "valor": 358000 },
      { "rotulo": "Mar", "valor": 341000 },
      { "rotulo": "Abr", "valor": 402000 },
      { "rotulo": "Mai", "valor": 388000 },
      { "rotulo": "Jun", "valor": 487000 }
    ]
  }
}

3. area — igual à linha, para volume acumulado ou tráfego. Mesmo formato de dados.

4. barra — comparação ou ranking. Mesmo formato da linha, mais "orientacao".
{
  "id": "c5",
  "tipo": "barra",
  "titulo": "Top 5 vendedores",
  "posicao": { "linha": 1, "coluna": 2, "largura": 2 },
  "dados": {
    "eixoX": "Vendedor",
    "eixoY": "Receita",
    "formato": "moeda",
    "prefixo": "R$",
    "orientacao": "horizontal",
    "pontos": [
      { "rotulo": "Ana Silva", "valor": 142000 },
      { "rotulo": "Carlos Souza", "valor": 118000 }
    ]
  }
}
Use "horizontal" quando os rótulos forem nomes de pessoa, cliente ou produto. Use "vertical" quando forem meses, dias ou categorias curtas.

5. pizza — distribuição em partes de um todo.
{
  "id": "c6",
  "tipo": "pizza",
  "titulo": "Receita por canal",
  "posicao": { "linha": 2, "coluna": 0, "largura": 2 },
  "dados": {
    "formato": "moeda",
    "prefixo": "R$",
    "fatias": [
      { "rotulo": "Indicação", "valor": 185000 },
      { "rotulo": "Busca paga", "valor": 142000 }
    ]
  }
}

6. rosca — mesmo formato da pizza, com o total no centro.

7. tabela — detalhamento linha a linha.
{
  "id": "c7",
  "tipo": "tabela",
  "titulo": "Maiores oportunidades abertas",
  "posicao": { "linha": 2, "coluna": 2, "largura": 2 },
  "dados": {
    "colunas": [
      { "chave": "cliente", "rotulo": "Cliente", "tipo": "texto" },
      { "chave": "valor", "rotulo": "Valor", "tipo": "moeda" },
      { "chave": "fechamento", "rotulo": "Previsão", "tipo": "data" }
    ],
    "linhas": [
      { "cliente": "Construtora Aurora", "valor": 148000, "fechamento": "2026-07-15" }
    ]
  }
}
Toda chave usada em "linhas" tem de existir em "colunas", e toda coluna tem de aparecer em todas as linhas.

REGRAS DE COMPOSIÇÃO (OBRIGATÓRIAS):
- Mínimo 5 e máximo 8 componentes.
- A grade tem 4 colunas. Em cada linha, a soma das larguras é no máximo 4 e nenhum componente se sobrepõe a outro.
- Linha 0: 3 ou 4 componentes do tipo "indicador", cada um com largura 1, nas colunas 0, 1, 2 e 3. SEMPRE com "anterior" preenchido.
- Linha 1: um gráfico de tendência ("linha" ou "area") na coluna 0 com largura 2, e um comparativo ("barra") na coluna 2 com largura 2.
- Linha 2: uma distribuição ("pizza" ou "rosca") na coluna 0 com largura 2 e, quando fizer sentido, uma "tabela" na coluna 2 com largura 2. Uma tabela sozinha pode ocupar a linha inteira (coluna 0, largura 4).
- Use no máximo 4 linhas (0 a 3).
- Ids sequenciais: "c1", "c2", "c3", ... na ordem em que aparecem.

REGRAS DOS NÚMEROS DE EXEMPLO (RÍGIDAS):
- Os números são fictícios, mas têm de ser realistas para uma empresa brasileira de médio porte: receita mensal entre R$ 50 mil e R$ 5 milhões.
- Séries temporais: 6 pontos (Jan a Jun, ou os últimos 6 meses), com variação natural entre eles — nunca uma sequência perfeitamente crescente nem números redondos demais.
- Tabelas: de 3 a 10 linhas e de 3 a 6 colunas.
- Pizza e rosca: de 3 a 6 fatias, somando um todo coerente (agrupe o resto em "Outros" se precisar).
- Barras de ranking: de 5 a 8 itens, JÁ ORDENADOS do maior para o menor, com o título começando por "Top N ".
- Nomes de pessoas brasileiros e variados (Ana Silva, Carlos Souza, Mariana Costa, Pedro Lima, Juliana Alves, Rafael Nunes).
- Cidades e estados brasileiros (São Paulo, Rio de Janeiro, Belo Horizonte, Curitiba, Recife, Porto Alegre).
- Nomes de produtos, clientes e campanhas plausíveis em português.
- Percentuais no campo "valor" como número inteiro ou com uma casa (18.5 quer dizer 18,5%), com "formato": "percentual" e sem prefixo.
- Valores em dinheiro sempre com "formato": "moeda" e "prefixo": "R$".
- Contagens com "formato": "numero" e sem prefixo.
- Datas sempre no formato AAAA-MM-DD.

ANTI-PADRÕES (NUNCA FAÇA):
- NUNCA devolva markdown, cercas de código ou qualquer texto fora do JSON.
- NUNCA invente um tipo de componente fora dos sete nomes listados.
- NUNCA escreva em inglês em título, rótulo, nome ou dado.
- NUNCA omita "anterior" em um indicador.
- NUNCA gere menos de 5 nem mais de 8 componentes.
- NUNCA peça esclarecimento: entregue sempre um painel, mesmo com pedido vago, usando o melhor palpite pelo contexto.
- NUNCA sobreponha posições nem estoure a largura 4 de uma linha.
- NUNCA repita o mesmo indicador em dois cartões.
- NUNCA use uma sigla sem que ela seja de uso corrente no Brasil (NPS pode; MRR escreva como "receita recorrente mensal").
- NUNCA escreva texto sem acentuação.

Responda SOMENTE com o JSON. Nada antes, nada depois.`;

export const PROMPT_PAINEL = (pedido: PedidoPainel) => {
  const detalhes = Object.entries(pedido.esclarecimentos ?? {})
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `Monte um painel a partir desta descrição:\n\n"${pedido.descricao}"` +
    (detalhes ? `\n\nDetalhes adicionais:\n${detalhes}` : "");
};

export const SYSTEM_REFINAR = `${IDIOMA}

Você faz edições CIRÚRGICAS em painéis de indicadores. A pessoa já tem um painel pronto e quer mudar UMA coisa. Você faz SOMENTE o que foi pedido e não toca em mais nada.

Você recebe um resumo do painel atual, o JSON completo dele e o pedido da pessoa. Devolva o painel COMPLETO atualizado, preservando EXATAMENTE todos os componentes que a pessoa não mencionou.

REGRAS CRÍTICAS:
1. Altere SOMENTE os componentes que a pessoa mencionou explicitamente.
2. NUNCA remova, reordene nem altere um componente que a pessoa não mencionou.
3. Ao acrescentar um componente, coloque-o na próxima posição livre, SEM mover os que já existem.
4. Ao trocar o tipo de um gráfico, preserve os dados e adapte apenas o formato: uma série vira fatias somando os mesmos valores; fatias viram uma série com os mesmos rótulos.
5. Preserve TODOS os ids existentes. NUNCA renomeie um id.
6. Devolva o painel completo, com o MÍNIMO de alterações.
7. Um componente não mencionado tem de voltar IDÊNTICO ao original: mesmo tipo, mesmo título, mesma posição e exatamente os mesmos dados.
8. Respeite os mesmos limites da geração: 5 a 8 componentes, grade de 4 colunas, soma de largura por linha no máximo 4. Um indicador ACRESCENTADO vai para a linha 0, com largura 1, se lá houver coluna livre; senão vai para a última linha, com largura 1.

EXEMPLOS DE COMPORTAMENTO CORRETO:
- "troque o gráfico de barras por pizza" → mude SOMENTE aquele componente para "pizza", convertendo os pontos em fatias. Todo o resto idêntico.
- "acrescente um indicador de ticket médio" → acrescente UM componente novo, com id novo (o próximo da sequência), na linha 0 se houver coluna livre; senão na última linha. Não toque em nada existente.
- "tire a tabela" → remova SOMENTE o componente do tipo "tabela". Mantenha todo o resto.
- "mude o título do painel" → altere SOMENTE o campo "titulo" do painel. Os componentes ficam idênticos e "componentesAlterados" volta vazio.
- "os valores estão baixos demais" → ajuste os números SOMENTE dos componentes que a pessoa citou; se ela não citou nenhum, pergunte em "esclarecimento".

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):

Quando você conseguiu fazer a alteração:
{
  "painel": {
    "titulo": "...",
    "resumo": "...",
    "setor": "...",
    "componentes": [ /* TODOS os componentes: os inalterados copiados EXATAMENTE, e só o(s) mencionado(s) alterado(s) */ ]
  },
  "mensagem": "Uma frase, em português, dizendo o que você fez",
  "componentesAlterados": ["c3"]
}

Quando o pedido não está claro o bastante para agir:
{
  "esclarecimento": "Uma pergunta curta, em português, para entender o que a pessoa quer"
}

REGRAS DO CAMPO "componentesAlterados":
- Liste SOMENTE os ids que você de fato alterou.
- Para cada componente NOVO que você acrescentou, inclua o id dele na lista.
- Para cada componente que você removeu, inclua o id removido na lista.
- Se você não alterou nenhum componente (por exemplo, só o título do painel), devolva uma lista vazia.
- Se você alterar um componente e não listar o id dele, a alteração será DESCARTADA e o original restaurado.

TIPOS DE COMPONENTE E SEUS DADOS (os mesmos sete da geração, e mais nenhum):
- indicador: { valor, anterior, formato: "moeda"|"numero"|"percentual", prefixo?, meta?, direcaoBoa?: "aumentar"|"diminuir" }
- linha, area: { eixoX, eixoY, formato, prefixo?, pontos: [{ rotulo, valor }] }
- barra: { eixoX, eixoY, formato, prefixo?, orientacao: "vertical"|"horizontal", pontos: [{ rotulo, valor }] }
- pizza, rosca: { formato, prefixo?, fatias: [{ rotulo, valor }] }
- tabela: { colunas: [{ chave, rotulo, tipo }], linhas: [{ ... }] }

Números novos seguem as mesmas regras de realismo da geração: escala de empresa brasileira de médio porte, nomes e cidades brasileiras, tudo em português acentuado.

Responda SOMENTE com o JSON. Nada antes, nada depois.`;

function resumoDoComponente(c: ComponentePainel): string {
  switch (c.tipo) {
    case "indicador":
      return `valor ${c.dados.valor} contra ${c.dados.anterior} (${c.dados.formato})`;
    case "linha":
    case "area":
    case "barra":
      return `${c.dados.pontos.length} pontos de ${c.dados.eixoX} por ${c.dados.eixoY}`;
    case "pizza":
    case "rosca":
      return `${c.dados.fatias.length} fatias`;
    case "tabela":
      return `${c.dados.linhas.length} linhas e ${c.dados.colunas.length} colunas`;
  }
}

export const PROMPT_REFINAR = (painel: EspecPainel, pedido: string) => {
  const lista = painel.componentes
    .map((c, i) => `${i + 1}. [${c.tipo}] "${c.titulo}" (id: ${c.id}, linha ${c.posicao.linha}, coluna ${c.posicao.coluna}, largura ${c.posicao.largura}) — ${resumoDoComponente(c)}`)
    .join("\n");
  return `Painel atual: "${painel.titulo}" (setor: ${painel.setor})
Componentes:
${lista}

Pedido da pessoa: "${pedido}"

JSON completo do painel atual:
${JSON.stringify(painel)}

Devolva o painel COMPLETO. Altere SOMENTE o que a pessoa pediu. Todos os outros componentes têm de voltar IDÊNTICOS.`;
};

export const SYSTEM_OBSERVACOES = `${IDIOMA}

Você é um analista de dados que lê um painel de indicadores e aponta o que chama atenção nele.

Os números do painel são exemplos gerados para a pessoa validar o formato, não dados reais da empresa dela. Por isso, fale sempre sobre o PAINEL ("no painel gerado, ...", "neste exemplo, ..."), nunca sobre a empresa ("sua receita caiu").

Regras:
- No máximo 3 observações.
- Cada observação tem de 1 a 2 frases.
- Seja específico: cite o nome do indicador, o número e o percentual.
- Prefira observações acionáveis: o que a pessoa olharia a seguir.
- Nunca repita o que o cartão já mostra sem acrescentar leitura ("a receita foi de R$ 487 mil" não é uma observação).
- Escreva números no formato brasileiro (R$ 487 mil, 18,5%).

Tipos de observação:
- "anomalia": um valor bem acima ou bem abaixo dos demais da mesma série ou distribuição.
- "tendencia": crescimento ou queda consistente em três períodos ou mais.
- "sugestao": um recorte, um indicador ou um gráfico que faria falta neste painel.

FORMATO DA RESPOSTA (JSON estrito, sem markdown, sem cercas de código):
{
  "observacoes": [
    { "tipo": "tendencia", "mensagem": "No painel gerado, a receita cresce há seis meses seguidos, de R$ 320 mil para R$ 487 mil (+52%)." },
    { "tipo": "anomalia", "mensagem": "Ana Silva responde por R$ 142 mil do ranking, 20% acima do segundo colocado — vale entender o que ela faz diferente." },
    { "tipo": "sugestao", "mensagem": "Falta um recorte por região: com ticket médio e conversão na mão, ver a receita por estado mostraria onde investir." }
  ]
}

Responda SOMENTE com o JSON. Nada antes, nada depois.`;

export const PROMPT_OBSERVACOES = (painel: EspecPainel) =>
  `Painel: "${painel.titulo}" (setor: ${painel.setor})\n\n` +
  painel.componentes.map((c) => {
    switch (c.tipo) {
      case "indicador":
        return `[indicador] ${c.titulo}: ${c.dados.valor} (anterior ${c.dados.anterior}, ${c.dados.formato})`;
      case "linha":
      case "area":
      case "barra":
        return `[${c.tipo}] ${c.titulo} (${c.dados.eixoY} por ${c.dados.eixoX}): ` +
          c.dados.pontos.map((p) => `${p.rotulo}=${p.valor}`).join(", ");
      case "pizza":
      case "rosca":
        return `[${c.tipo}] ${c.titulo}: ` + c.dados.fatias.map((f) => `${f.rotulo}=${f.valor}`).join(", ");
      case "tabela":
        return `[tabela] ${c.titulo}: ${c.dados.linhas.length} linhas — colunas ${c.dados.colunas.map((x) => x.rotulo).join(", ")}`;
    }
  }).join("\n");

// ---------------------------------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------------------------------

const INSUMO = "descrição do painel";
const MINIMO_BOM = 5;
const MINIMO_ACEITAVEL = 3;
const MENSAGEM_INVALIDA = "A IA devolveu uma resposta que não deu para usar. Tente de novo ou descreva o painel de outro jeito.";

export type ResultadoGeracao = { demo: boolean; painel: EspecPainel; meta: Meta; id?: string; reaproveitado: boolean };

/**
 * Gera o painel. `forcar` ignora o cache (botão "Gerar outra versão"); `guardar` (padrão true) só existe
 * para a ferramenta MCP — a rota HTTP salva sempre, como o pdi-time com SENSIVEL = false.
 */
export async function gerarPainel(entrada: PedidoPainel, opts: { forcar?: boolean; guardar?: boolean } = {}): Promise<ResultadoGeracao> {
  const guardar = opts.guardar ?? true;
  const pedido: PedidoPainel = { descricao: entrada.descricao.trim(), esclarecimentos: entrada.esclarecimentos, hash: "" };
  pedido.hash = hashPedido(pedido);
  const demo = !aiEnabled();

  if (!opts.forcar) {
    const acerto = buscarNoCache(pedido.hash, demo);
    if (acerto) {
      console.log(`[painel] cache: pedido ${pedido.hash.slice(0, 8)} reaproveitado (${acerto.id}).`);
      return { demo, painel: acerto.painel, meta: { ...acerto.meta, insumo: `${INSUMO} (painel reaproveitado)` }, id: acerto.id, reaproveitado: true };
    }
  }

  let painel: EspecPainel;
  if (demo) {
    await esperar(1200);
    painel = painelDemo(juntarEsclarecimentos(pedido.descricao, pedido.esclarecimentos ?? {}));
  } else {
    let bruto = await askJSON<EspecPainel>({ system: SYSTEM_PAINEL, prompt: PROMPT_PAINEL(pedido), maxTokens: 8000 });
    painel = validarPainel(bruto);
    if (painel.componentes.length < MINIMO_BOM) {
      console.warn(`[painel] segunda tentativa: sobraram ${painel.componentes.length} componentes válidos`);
      const reforco = "\n\nA resposta anterior veio incompleta ou fora do formato. Devolva um painel completo, com 5 a 8 componentes válidos.";
      bruto = await askJSON<EspecPainel>({ system: SYSTEM_PAINEL, prompt: PROMPT_PAINEL(pedido) + reforco, maxTokens: 8000 });
      const segundo = validarPainel(bruto);
      if (segundo.componentes.length > painel.componentes.length) painel = segundo;
    }
    if (painel.componentes.length < MINIMO_ACEITAVEL) {
      throw new ErroIA("resposta_invalida", MENSAGEM_INVALIDA, 502);
    }
  }

  const metaGerada = meta({ demo, insumo: INSUMO });
  const id = guardar ? salvar({ tipo: "painel", titulo: painel.titulo, resumo: painel.resumo, entrada: pedido, saida: painel, meta: metaGerada }) : undefined;
  return { demo, painel, meta: metaGerada, id, reaproveitado: false };
}

// ---------------------------------------------------------------------------------------------------
// Refinamento
// ---------------------------------------------------------------------------------------------------

/** Igualdade estrutural com chaves ordenadas (JSON.stringify puro depende da ordem das chaves). */
function ordenarChaves(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenarChaves);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenarChaves((v as Record<string, unknown>)[k])]));
  }
  return v;
}
export const igual = (a: unknown, b: unknown) => JSON.stringify(ordenarChaves(a)) === JSON.stringify(ordenarChaves(b));

/** O componente sem `id` e sem `posicao`: é isso que se compara para reconhecer um id renomeado. */
function semIdentidade(c: ComponentePainel): Omit<ComponentePainel, "id" | "posicao"> {
  const copia: Partial<ComponentePainel> = { ...c };
  delete copia.id;
  delete copia.posicao;
  return copia as Omit<ComponentePainel, "id" | "posicao">;
}

/**
 * Devolve o painel refinado com todo componente não declarado restaurado do original
 * (conteúdo E posição), os sumidos reinseridos no índice original e ids renomeados desfeitos.
 */
export function validarRefinamento(
  original: EspecPainel,
  refinado: EspecPainel,
  alterados: string[],
): { painel: EspecPainel; restaurados: string[] } {
  const porId = new Map(original.componentes.map((c) => [c.id, c]));
  const restaurados: string[] = [];
  const declarados = new Set(alterados);
  const idsRefinados = new Set(refinado.componentes.map((c) => c.id));
  const sumidos = original.componentes.filter((c) => !idsRefinados.has(c.id));

  const componentes: ComponentePainel[] = refinado.componentes.map((novo) => {
    const antigo = porId.get(novo.id);
    if (!antigo) {
      // Id desconhecido: acréscimo de verdade OU um original renomeado pela IA (c3 -> c9 com o mesmo conteúdo).
      const renomeado = sumidos.find((s) => igual(semIdentidade(s), semIdentidade(novo)));
      if (renomeado) {
        console.warn(`[refinar] id "${novo.id}" é "${renomeado.id}" renomeado; original devolvido.`);
        sumidos.splice(sumidos.indexOf(renomeado), 1);
        return renomeado;
      }
      return novo;
    }
    if (declarados.size > 0) {
      if (!declarados.has(novo.id) && !igual(antigo, novo)) {
        console.warn(`[refinar] componente "${novo.id}" mudou sem ser declarado; original restaurado.`);
        restaurados.push(novo.id);
        return antigo; // conteúdo E posicao do original
      }
      return novo;
    }
    // Sem lista declarada: heurística — mesmo tipo e mesmo título com dados diferentes é deriva.
    if (novo.tipo === antigo.tipo && novo.titulo === antigo.titulo && !igual(antigo, novo)) {
      restaurados.push(novo.id);
      return antigo;
    }
    return novo;
  });

  // Componente sumido sem ser declarado volta para o painel, no ÍNDICE original (não no fim),
  // para que o reempacotamento do validador não mova os vizinhos.
  for (const antigo of sumidos) {
    if (declarados.has(antigo.id)) continue; // remoção pedida: fica removido
    const indice = original.componentes.indexOf(antigo);
    componentes.splice(Math.min(indice, componentes.length), 0, antigo);
    restaurados.push(antigo.id);
  }

  return { painel: { ...refinado, componentes }, restaurados };
}

export type ResultadoRefinamento =
  | { demo: boolean; esclarecimento: string }
  | { demo: boolean; painel: EspecPainel; mensagem: string; componentesAlterados: string[]; restaurados: string[]; meta: Meta };

/** Refina um painel; quando `id` é informado, grava o resultado (com `refinadoEm`) no histórico. */
export async function refinarPainel(original: EspecPainel, pedido: string, id?: string): Promise<ResultadoRefinamento> {
  const demo = !aiEnabled();
  const base = validarPainel(original);
  let resposta: RespostaRefinamento & { esclarecimento?: string };
  if (demo) {
    await esperar(1200);
    resposta = refinamentoDemo(base, pedido);
  } else {
    const bruto = await askJSON<Partial<RespostaRefinamento> & { esclarecimento?: string }>({ system: SYSTEM_REFINAR, prompt: PROMPT_REFINAR(base, pedido), maxTokens: 8000 });
    if (typeof bruto?.esclarecimento === "string" && bruto.esclarecimento.trim()) {
      return { demo, esclarecimento: bruto.esclarecimento.trim() };
    }
    if (!bruto?.painel || !Array.isArray(bruto.painel.componentes)) {
      throw new ErroIA("resposta_invalida", MENSAGEM_INVALIDA, 502);
    }
    resposta = {
      painel: validarPainel({ ...bruto.painel, componentes: bruto.painel.componentes }, { modo: "refinamento", moviveis: base.componentes.map((c) => c.id) }),
      mensagem: typeof bruto.mensagem === "string" && bruto.mensagem.trim() ? bruto.mensagem.trim() : "Pronto, ajustei o painel.",
      componentesAlterados: Array.isArray(bruto.componentesAlterados) ? bruto.componentesAlterados.filter((x): x is string => typeof x === "string") : [],
    };
  }

  const { painel: restaurado, restaurados } = validarRefinamento(base, resposta.painel, resposta.componentesAlterados);
  const novos = restaurado.componentes.filter((c) => !base.componentes.some((o) => o.id === c.id)).map((c) => c.id);
  const moviveis = new Set([...resposta.componentesAlterados, ...novos]);
  const painel = validarPainel(restaurado, { modo: "refinamento", moviveis });
  painel.refinadoEm = new Date().toISOString();
  if (restaurados.length > 0) console.warn(`[refinar] restaurados por deriva: ${restaurados.join(", ")}`);
  if (id && !atualizarSaida(id, painel)) console.warn(`[refinar] painel ${id} não existe mais; resultado não gravado.`);
  return { demo, painel, mensagem: resposta.mensagem, componentesAlterados: resposta.componentesAlterados, restaurados, meta: meta({ demo, insumo: "pedido de ajuste" }) };
}

// ---------------------------------------------------------------------------------------------------
// Observações
// ---------------------------------------------------------------------------------------------------

const TIPOS_OBSERVACAO = new Set(["anomalia", "tendencia", "sugestao"]);

export async function observarPainel(painelBruto: EspecPainel): Promise<{ demo: boolean; observacoes: Observacao[]; meta: Meta }> {
  const demo = !aiEnabled();
  const painel = validarPainel(painelBruto);
  const metaGerada = meta({ demo, insumo: "painel gerado" });
  if (demo) {
    await esperar(900);
    return { demo, observacoes: observacoesDemo(painel), meta: metaGerada };
  }
  const bruto = await askJSON<{ observacoes?: unknown }>({ system: SYSTEM_OBSERVACOES, prompt: PROMPT_OBSERVACOES(painel), maxTokens: 1200 });
  const lista = Array.isArray(bruto?.observacoes) ? bruto.observacoes : [];
  const observacoes: Observacao[] = [];
  for (const o of lista) {
    if (!o || typeof o !== "object") continue;
    const { tipo, mensagem } = o as { tipo?: unknown; mensagem?: unknown };
    if (typeof mensagem !== "string" || !mensagem.trim()) continue;
    observacoes.push({ tipo: TIPOS_OBSERVACAO.has(String(tipo)) ? (tipo as Observacao["tipo"]) : "sugestao", mensagem: mensagem.trim() });
    if (observacoes.length === 3) break;
  }
  return { demo, observacoes, meta: metaGerada };
}
