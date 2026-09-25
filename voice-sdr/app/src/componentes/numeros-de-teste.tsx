import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { CampoDeTexto } from '@/componentes/campo-de-texto'
import { Carregando } from '@/componentes/carregando'
import { LinhaDeCampos } from '@/componentes/linha-de-campos'
import { Secao } from '@/componentes/secao'
import { discagem as copyDaDiscagem } from '@/copy/discagem'
import { useServicoDeDiscagem } from '@/discagem/contexto'
import type { MotivoDeFalhaDoNumeroDeTeste } from '@/discagem/tipos'

const copy = copyDaDiscagem.numerosDeTeste

/** A mesma chave da tela, para a lista se refazer depois de cada escrita. */
const CHAVE = ['numeros-de-teste'] as const

/**
 * Os números para os quais a conta pode discar enquanto o portão da fatia
 * estiver fechado.
 *
 * Mora aqui, na política de discagem, porque é onde o painel manda quem tenta
 * fazer a primeira ligação — e porque a lista é parte da política: ela diz para
 * quem se pode ligar, do mesmo jeito que a janela diz quando.
 *
 * Leitura de membro e escrita de admin, como a classe Configuração da seção
 * 3.9: sem `podeEditar`, a lista aparece sem o cadastro e sem a remoção. Quem
 * recusa de verdade é a política de `account_test_numbers`; aqui só não se
 * oferece o que ela nega.
 */
export function NumerosDeTeste({ podeEditar }: { podeEditar: boolean }) {
  const servico = useServicoDeDiscagem()

  const [telefone, definirTelefone] = useState('')
  const [rotulo, definirRotulo] = useState('')
  const [falha, definirFalha] = useState<MotivoDeFalhaDoNumeroDeTeste>()
  const [enviando, definirEnviando] = useState(false)
  const [removendo, definirRemovendo] = useState<string>()

  const lista = useQuery({
    queryKey: CHAVE,
    queryFn: () => servico.numerosDeTeste(),
  })

  async function cadastrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    definirFalha(undefined)
    definirEnviando(true)
    const resultado = await servico.cadastrarNumeroDeTeste(telefone, rotulo)
    definirEnviando(false)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }

    // Limpa só depois do aceite: recusa que apagasse o que foi digitado
    // obrigaria a redigitar o número inteiro para corrigir o rótulo.
    definirTelefone('')
    definirRotulo('')
    await lista.refetch()
  }

  async function remover(id: string) {
    definirFalha(undefined)
    definirRemovendo(id)
    const resultado = await servico.removerNumeroDeTeste(id)
    definirRemovendo(undefined)

    if (!resultado.ok) {
      definirFalha(resultado.motivo)
      return
    }
    await lista.refetch()
  }

  const numeros = Array.isArray(lista.data) ? lista.data : []
  const falhaDaLista = typeof lista.data === 'string' ? lista.data : undefined

  return (
    <Secao titulo={copy.titulo}>
      <p className="mt-0 mb-4 max-w-[62ch] text-texto-apoio">{copy.explicacao}</p>

      {lista.isPending ? <Carregando texto={copy.carregando} /> : null}

      {falhaDaLista ? (
        <p role="alert" className="m-0 mb-4 text-[12.5px] text-perigo">
          {copy.falhas[falhaDaLista]}
        </p>
      ) : null}

      {!lista.isPending && !falhaDaLista ? (
        numeros.length === 0 ? (
          <p className="mt-0 mb-4 text-texto-apoio">{copy.vazio}</p>
        ) : (
          <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
            {numeros.map((numero) => (
              <li
                key={numero.id}
                className="bloco-secundario flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="val text-[13px]">{numero.e164}</span>
                  <span className="ml-2 text-[12.5px] text-texto-apoio">
                    {numero.rotulo}
                  </span>
                </span>
                {podeEditar ? (
                  <button
                    type="button"
                    className="botao-link shrink-0"
                    disabled={removendo === numero.id}
                    onClick={() => void remover(numero.id)}
                  >
                    {removendo === numero.id ? copy.removendo : copy.remover}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {podeEditar ? (
        <form onSubmit={cadastrar} noValidate className="flex flex-col gap-3">
          <LinhaDeCampos>
            <CampoDeTexto
              rotulo={copy.numero.rotulo}
              exemplo={copy.numero.exemplo}
              name="telefoneDeTeste"
              autoComplete="tel"
              value={telefone}
              onChange={(evento) => definirTelefone(evento.target.value)}
            />
            <CampoDeTexto
              rotulo={copy.rotuloDoNumero.rotulo}
              exemplo={copy.rotuloDoNumero.exemplo}
              name="rotuloDoNumeroDeTeste"
              value={rotulo}
              onChange={(evento) => definirRotulo(evento.target.value)}
            />
          </LinhaDeCampos>

          {falha ? (
            <p role="alert" className="m-0 text-[12.5px] text-perigo">
              {copy.falhas[falha]}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando}
            className="botao-secundario self-start"
          >
            {enviando ? copy.acaoEmCurso : copy.acao}
          </button>
        </form>
      ) : (
        <p className="m-0 text-[12.5px] text-texto-apoio">{copy.somenteLeitura}</p>
      )}
    </Secao>
  )
}
