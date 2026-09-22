// Modo demonstração: sem chave de IA configurada, o app continua funcionando com dados de exemplo
// plausíveis (public/exemplo-perdas.csv) e, principalmente, com um agrupamento REAL das notas enviadas
// (não uma resposta fixa desconectada do que a pessoa subiu) — mesmo espírito de financas-ia, onde os
// números do resumo são sempre reais e só a leitura interpretativa muda com a IA. Aqui, como agrupar é o
// próprio trabalho da IA, o fallback usa um classificador por palavra-chave determinístico: nunca inventa
// um motivo sem nota real por trás, e qualquer nota que ele não reconheça cai em "sem motivo identificado"
// (o mesmo destino de uma nota vazia ou ambígua) em vez de forçar um grupo inventado.
import type { AnalisePerdas, GrupoMotivo, NotaPerda } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

type Regra = { motivo: string; padrao: RegExp };

// Ordem importa: a primeira regra que casar decide o grupo da nota.
const REGRAS: Regra[] = [
  { motivo: "Preço acima do concorrente", padrao: /concorrente.*(mais barato|menor pre[cç]o|desconto)|pre[cç]o (alto|elevado|fora)|muito caro|achou caro|fechou com (a|o) concorrente por/i },
  { motivo: "Demora no atendimento", padrao: /demor|atras|lentid[aã]o|n[aã]o retornamos a tempo|proposta chegou tarde/i },
  { motivo: "Cliente parou de responder", padrao: /sumiu|parou de responder|n[aã]o retornou|sem retorno|n[aã]o atende mais|n[aã]o conseguimos mais contato/i },
  { motivo: "Sem orçamento aprovado", padrao: /sem or[cç]amento|sem verba|or[cç]amento (foi )?cortado|n[aã]o aprovado pel[ao]|reduziu o investimento|congelou o investimento/i },
  { motivo: "Falta de funcionalidade", padrao: /n[aã]o (tem|possui|oferece|atende)|falta (a |o )?(integra[cç][aã]o|funcionalidade|recurso)|sem integra[cç][aã]o com/i },
  { motivo: "Decisor mudou ou saiu", padrao: /trocou de (cargo|emprego)|saiu da empresa|novo (decisor|gestor|diretor)|mudan[cç]a de diretoria/i },
  { motivo: "Optou por solução interna", padrao: /internamente|equipe pr[oó]pria|n[aã]o vai contratar|resolveu n[aã]o contratar/i },
];

/** Classificador determinístico (sem IA): usado tanto no modo demonstração quanto sempre que a IA não
 * está conectada, para que o resultado continue refletindo as notas de verdade que a pessoa enviou. */
export function agruparPorPalavraChave(notas: NotaPerda[]): AnalisePerdas {
  const porMotivo = new Map<string, NotaPerda[]>();
  const semMotivo: NotaPerda[] = [];

  for (const nota of notas) {
    const texto = nota.texto.trim();
    if (texto.length < 6) {
      semMotivo.push(nota);
      continue;
    }
    const regra = REGRAS.find((r) => r.padrao.test(texto));
    if (!regra) {
      semMotivo.push(nota);
      continue;
    }
    const lista = porMotivo.get(regra.motivo) ?? [];
    lista.push(nota);
    porMotivo.set(regra.motivo, lista);
  }

  const paraGrupo = (motivo: string, itens: NotaPerda[]): GrupoMotivo => ({
    motivo,
    contagem: itens.length,
    evidencias: itens.map((n) => n.texto),
  });

  const todosOsGrupos = [...porMotivo.entries()].map(([motivo, itens]) => paraGrupo(motivo, itens));
  const grupos = todosOsGrupos.filter((g) => g.contagem >= 3).sort((a, b) => b.contagem - a.contagem);
  const poucasOcorrencias = todosOsGrupos.filter((g) => g.contagem < 3).sort((a, b) => b.contagem - a.contagem);

  const motivoPrincipal = grupos[0]?.motivo ?? poucasOcorrencias[0]?.motivo;
  const resumo = motivoPrincipal
    ? `De ${notas.length} notas analisadas, o motivo mais comum foi "${motivoPrincipal}"${grupos[0] ? ` (${grupos[0].contagem} ocorrências)` : ""}. Nenhuma nota é reclassificada no CRM — este é só um agrupamento de leitura.`
    : "Não foi possível identificar um motivo recorrente nas notas enviadas.";

  return {
    resumo,
    totalNotas: notas.length,
    grupos,
    poucasOcorrencias,
    semMotivo: { contagem: semMotivo.length, evidencias: semMotivo.map((n) => n.texto).filter(Boolean) },
  };
}
