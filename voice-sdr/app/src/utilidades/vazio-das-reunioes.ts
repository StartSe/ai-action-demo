/**
 * Qual das três telas `/reunioes` mostra: as reuniões, a conta que ainda não
 * tem reunião nenhuma, ou o recorte que não achou nada.
 *
 * São dois vazios, e não um, porque pedem coisas diferentes: a conta sem
 * reunião precisa saber de onde elas vêm, e quem filtrou precisa saber que há
 * reuniões fora do recorte. Por isso a decisão lê `contaTemReuniao`, medido
 * fora de qualquer filtro, e não a presença de filtro na busca: a lista abre
 * em "próximas", e uma conta só com reuniões passadas veria "nenhuma reunião
 * marcada" sem filtro nenhum escolhido.
 */
export type EstadoDasReunioes = 'reunioes' | 'nenhuma-reuniao' | 'recorte-vazio'

export function estadoDasReunioes(quantidade: number, contaTemReuniao: boolean): EstadoDasReunioes {
  if (quantidade > 0) return 'reunioes'
  return contaTemReuniao ? 'recorte-vazio' : 'nenhuma-reuniao'
}
