// Leitura de "E-mails dos participantes" (uma pessoa por linha, "Nome: e-mail"). Arquivo sem nenhum
// import `node:*` de propósito: é usado tanto no servidor (lib/cobranca.ts, para achar o e-mail do
// responsável de cada ação) quanto no navegador (app/page.tsx, para montar o `mailto:` do e-mail de
// acompanhamento com endereços de verdade, nunca com nomes). Próprio deste app.

function normalizarNome(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lê o texto num mapa nome normalizado -> e-mail. Linhas sem ":" ou sem um dos lados são ignoradas. */
export function emailsPorNome(texto?: string): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const linha of (texto || "").split("\n")) {
    const indice = linha.indexOf(":");
    if (indice < 0) continue;
    const nome = linha.slice(0, indice).trim();
    const email = linha.slice(indice + 1).trim();
    if (!nome || !email) continue;
    mapa[normalizarNome(nome)] = email;
  }
  return mapa;
}

/** Todos os e-mails cadastrados, na ordem das linhas, sem repetição. */
export function listarEmails(texto?: string): string[] {
  return Array.from(new Set(Object.values(emailsPorNome(texto))));
}

/** E-mail do responsável por uma ação: casa pelo nome completo e, se não achar, por um nome que contenha o outro (ex.: "Renata" casa com "Renata Cavalcanti"). */
export function emailDoResponsavel(emailsParticipantes: string | undefined, responsavel: string): string | undefined {
  const alvo = normalizarNome(responsavel || "");
  if (!alvo) return undefined;
  const mapa = emailsPorNome(emailsParticipantes);
  if (mapa[alvo]) return mapa[alvo];
  const chave = Object.keys(mapa).find((k) => k.includes(alvo) || alvo.includes(k));
  return chave ? mapa[chave] : undefined;
}
