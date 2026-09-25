import { FUSOS_DO_BRASIL } from '@compartilhado/ddd.ts'
import { useState } from 'react'

import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Seletor } from '@/componentes/seletor'
import { campoDeFuso as copy } from '@/copy/fuso'

/** O valor da opção que abre o campo de texto. Não é fuso nenhum. */
const OUTRO = 'outro'

type CampoDeFusoProps = {
  rotulo: string
  /** A zona IANA gravada, ou `''` quando ainda não há fuso. */
  valor: string
  aoTrocar: (fuso: string) => void
  disabled?: boolean
}

/**
 * O fuso horário como seletor (D-09): os cinco fusos do Brasil pelo nome, e
 * "Outro fuso" para quem atende de fora deles, que abre o campo de texto. O que
 * se grava é sempre a zona IANA.
 *
 * O modo à vista se deriva do valor: zona da lista é ela mesma, valor fora da
 * lista é "outro". O único estado próprio é a escolha de "Outro fuso" com o
 * campo ainda vazio, que o valor sozinho não distingue de "nada escolhido".
 */
export function CampoDeFuso({ rotulo, valor, aoTrocar, disabled = false }: CampoDeFusoProps) {
  const [outroEscolhido, definirOutroEscolhido] = useState(false)
  const daLista = (FUSOS_DO_BRASIL as readonly string[]).includes(valor)
  const opcao = daLista ? valor : outroEscolhido || valor !== '' ? OUTRO : ''

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Seletor
        rotulo={rotulo}
        valor={opcao}
        desativado={disabled}
        aoTrocar={(escolha) => {
          if (escolha === OUTRO) {
            definirOutroEscolhido(true)
            // Sai da lista com o campo vazio: o fuso da lista não pode ficar
            // gravado debaixo de "Outro fuso".
            if (daLista) aoTrocar('')
            return
          }
          definirOutroEscolhido(false)
          aoTrocar(escolha)
        }}
      >
        {opcao === '' ? <option value="">{copy.escolha}</option> : null}
        {FUSOS_DO_BRASIL.map((fuso) => (
          <option key={fuso} value={fuso}>
            {copy.nomes[fuso]}
          </option>
        ))}
        <option value={OUTRO}>{copy.outro}</option>
      </Seletor>

      {opcao === OUTRO ? (
        <CampoDeTexto
          rotulo={copy.outroRotulo}
          exemplo={copy.outroExemplo}
          apoio={copy.outroApoio}
          autoComplete="off"
          value={valor}
          disabled={disabled}
          onChange={(evento) => aoTrocar(evento.target.value)}
        />
      ) : null}
    </div>
  )
}
