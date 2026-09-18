// Valor puro (sem node:sqlite/fs) para poder ser importado tanto por Client Components (app/page.tsx)
// quanto por lib/historico.ts (Server-only). Reexportado por lib/historico.ts.
export const SENSIVEL = false;

// Lista FECHADA de categorias de dado sensível (LGPD art. 5º, II) usada só pela qualificação B2C
// (US-028): "dados pessoais... nada de categoria sensível" (prd.json > regras). Termos representativos
// em português, não exaustivos — o objetivo é recusar um critério ou trecho ÓBVIO de categoria protegida,
// nunca um filtro perfeito. Cada entrada nova deve continuar dentro de uma das sete categorias da lei;
// não é um lugar para heurística de "assunto sensível" em geral.
// Entradas em RADICAL (sem sufixo de gênero/número: "religi", não "religião") de propósito — um `.includes`
// depois de normalizar acentos, então "religi" cobre religião/religioso/religiosa/religiosidade e "deficien"
// cobre deficiência/deficiente sem precisar listar cada flexão (achado real: a frase-modelo sem IA de
// `gerarHipoteseDor` monta "enfrentando <dor, já em minúsculas>", e uma `dor` do ICP como "Convicção
// religiosa" só batia com o radical, nunca com a palavra completa "religião").
export const CATEGORIAS_SENSIVEIS: Record<string, string[]> = {
  "origem racial ou étnica": ["negro", "negra", "branco", "branca", "pardo", "parda", "indígena", "afrodescendente", "amarelo", "amarela", "etnia"],
  "convicção religiosa": ["evangélic", "católic", "espírita", "umbandista", "candomblecista", "judeu", "judia", "muçulman", "ateu", "ateia", "religi"],
  "opinião política": ["petista", "bolsonarista", "comunista", "socialista", "esquerdista", "direitista", "filiad", "partid", "militante político"],
  "filiação sindical": ["sindical", "diretoria sindical"],
  "saúde": ["deficien", "doença crônica", "hiv", "soropositiv", "câncer", "depress", "transtorno mental", "gestante", "grávida"],
  "vida sexual": ["homossexual", "heterossexual", "bissexual", "lgbt", "gay", "lésbica", "transgênero", "orientação sexual", "sexualidade"],
  "dado genético ou biométrico": ["genétic", "teste de dna", "biométric", "genoma"],
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Termo de categoria sensível encontrado num texto (critério do ICP ou trecho citado pela IA), com a
 * categoria correspondente — `null` quando nenhum termo da lista fechada aparece. Usado para RECUSAR a
 * qualificação com aquele termo (a evidência é omitida, nunca marcada "nao_atende"/"atende"). */
export function termoSensivel(texto: string): { categoria: string; termo: string } | null {
  if (!texto.trim()) return null;
  const alvo = normalizar(texto);
  for (const [categoria, termos] of Object.entries(CATEGORIAS_SENSIVEIS)) {
    for (const termo of termos) {
      if (alvo.includes(normalizar(termo))) return { categoria, termo };
    }
  }
  return null;
}
