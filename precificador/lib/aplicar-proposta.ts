// Aplica o rascunho da conversa no banco. Server-only.
//
// Só roda depois de a pessoa ver os números e confirmar: a conversa propõe, ela decide. O que
// entra aqui é tratado como dado dela, não como exemplo — os itens não recebem a marca de exemplo,
// porque "apagar os exemplos" não pode levar embora o negócio que ela acabou de descrever.
import { definirCanais } from "./canais";
import { criarItem, definirInsumos } from "./itens";
import { definirCustosFixos, salvarNegocio } from "./negocio";
import type { Proposta } from "./proposta";

export type ResumoAplicacao = { negocioId: string; fixos: number; canais: number; itens: number; primeiroItemId: string | null };

export function aplicarProposta(proposta: Proposta): ResumoAplicacao {
  const negocio = salvarNegocio(proposta.negocio);

  const fixos = proposta.fixos.filter((f) => f.nome.trim());
  if (fixos.length > 0) definirCustosFixos(negocio.id, fixos);

  // Canal é obrigatório para precificar; sem nenhum proposto, os canais semente já criados com o
  // negócio ficam como estão.
  const canais = proposta.canais.filter((c) => c.nome.trim());
  if (canais.length > 0) definirCanais(negocio.id, canais);

  let primeiroItemId: string | null = null;
  let criados = 0;
  for (const modelo of proposta.itens) {
    if (!modelo.nome.trim()) continue;
    const item = criarItem(negocio.id, {
      nome: modelo.nome,
      tipo: modelo.tipo,
      tempoMinutos: modelo.tempoMinutos,
      perdaPct: modelo.perdaPct,
      exemplo: false,
    });
    const insumos = modelo.insumos.filter((l) => l.nome.trim());
    if (insumos.length > 0) definirInsumos(item.id, insumos);
    primeiroItemId ??= item.id;
    criados++;
  }

  return { negocioId: negocio.id, fixos: fixos.length, canais: canais.length, itens: criados, primeiroItemId };
}
