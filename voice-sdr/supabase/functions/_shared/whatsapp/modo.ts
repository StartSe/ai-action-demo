// Quem a assistente atende pelo WhatsApp: `account_settings.whatsapp_mode`.
//
// **Por que existe.** A instância Z-API costuma ser um número em uso (o
// celular do dono, o comercial da empresa). Com o canal ligado e sem filtro,
// a assistente responderia a qualquer pessoa que escrevesse para ele, inclusive
// a família e os clientes de sempre. O modo `teste` limita a conversa à lista
// de números de teste da conta (`account_test_numbers`), a mesma que libera a
// discagem antes do portão da fatia: é um lugar só para dizer "estes são os
// números com que se pode testar".
//
// **O que o modo decide.** No modo `teste`, número fora da lista não é contato
// do produto: a mensagem dele é ignorada por inteiro (nada gravado, nenhum
// lead, nenhuma conversa, nenhuma resposta, nem descadastro), e a assistente
// não escreve para ele por iniciativa própria (pré-contato, ação `iniciar`).
// Mensagem escrita por gente do time não passa por aqui: quem escreve à mão
// sabe para quem está escrevendo.
//
// **Valor desconhecido é `teste`.** Coluna nula, linha ausente ou valor que o
// banco não conhece caem no lado seguro.
//
// Módulo portável: sem Deno, sem rede.

export const MODOS_DO_WHATSAPP = ['teste', 'todos'] as const
export type ModoDoWhatsapp = (typeof MODOS_DO_WHATSAPP)[number]

/** O padrão da coluna, e o que vale quando o valor gravado não se lê. */
export const MODO_PADRAO_DO_WHATSAPP: ModoDoWhatsapp = 'teste'

export function lerModoDoWhatsapp(valor: unknown): ModoDoWhatsapp {
  return valor === 'todos' ? 'todos' : MODO_PADRAO_DO_WHATSAPP
}

/** O modo deixa a assistente conversar com este número? */
export function modoAtendeONumero(
  modo: ModoDoWhatsapp,
  numerosDeTeste: Iterable<string>,
  telefone: string,
): boolean {
  if (modo === 'todos') return true
  for (const numero of numerosDeTeste) if (numero === telefone) return true
  return false
}
