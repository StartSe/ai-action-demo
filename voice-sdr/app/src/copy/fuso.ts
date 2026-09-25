// O fuso horário como a tela o mostra e o pede (D-09).
//
// A zona IANA é identificador, não texto de interface: ninguém escolhe
// "America/Sao_Paulo". O campo oferece os cinco fusos do Brasil de
// `@compartilhado/ddd.ts` pelo nome de quem mora lá e grava o identificador;
// "Outro fuso" abre o campo de texto para quem atende de fora deles. O nome de
// um fuso fora da lista cai em `nomeDoFuso`, o mesmo da frase da janela.

import type { FusoDoBrasil } from '@compartilhado/ddd.ts'
import { nomeDoFuso } from '@compartilhado/discagem/janela.ts'

const NOMES: Readonly<Record<FusoDoBrasil, string>> = {
  'America/Sao_Paulo': 'Horário de Brasília',
  'America/Manaus': 'Amazonas, Roraima e Rondônia (Manaus)',
  'America/Cuiaba': 'Mato Grosso (Cuiabá)',
  'America/Campo_Grande': 'Mato Grosso do Sul (Campo Grande)',
  'America/Rio_Branco': 'Acre (Rio Branco)',
}

/** O nome do fuso para ler: o da lista do Brasil, senão a cidade do identificador. */
export function nomeDoFusoNaTela(fuso: string): string {
  return Object.hasOwn(NOMES, fuso) ? NOMES[fuso as FusoDoBrasil] : nomeDoFuso(fuso)
}

export const campoDeFuso = {
  nomes: NOMES,
  escolha: 'Escolha o fuso',
  outro: 'Outro fuso',
  outroRotulo: 'Nome do outro fuso',
  outroExemplo: 'America/Noronha',
  outroApoio:
    'O nome do fuso como o relógio do sistema o conhece, região e cidade: America/Noronha para Fernando de Noronha, Europe/Lisbon para Lisboa.',
} as const
