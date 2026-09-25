import { Seletor } from '@/componentes/seletor'

type SeletorPeriodoProps<P extends string> = {
  rotulo: string
  valor: P
  opcoes: readonly { valor: P; rotulo: string }[]
  aoTrocar: (periodo: P) => void
}

/**
 * O período de uma tela de números. É um `Seletor` com a lista fechada: o
 * valor que volta é sempre uma das opções, e quem traduz o período em
 * intervalo é quem pede os dados.
 */
export function SeletorPeriodo<P extends string>({
  rotulo,
  valor,
  opcoes,
  aoTrocar,
}: SeletorPeriodoProps<P>) {
  return (
    <Seletor
      rotulo={rotulo}
      valor={valor}
      aoTrocar={(escolhido) => {
        const opcao = opcoes.find((item) => item.valor === escolhido)
        if (opcao) aoTrocar(opcao.valor)
      }}
    >
      {opcoes.map((opcao) => (
        <option key={opcao.valor} value={opcao.valor}>
          {opcao.rotulo}
        </option>
      ))}
    </Seletor>
  )
}
