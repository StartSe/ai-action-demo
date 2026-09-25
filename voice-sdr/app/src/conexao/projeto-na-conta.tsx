import { useState } from 'react'

import { Dialogo } from '@/componentes/dialogo'
import { Painel } from '@/componentes/painel'
import { useProjetoConectado } from '@/conexao/contexto'
import { conexao } from '@/copy/conexao'

const copy = conexao.projeto

/**
 * /config/conta: o projeto Supabase desta cópia e a troca dele.
 *
 * A troca é do navegador, não da conta: ela esquece o projeto gravado aqui,
 * encerra a sessão e volta para a tela de conexão. Os dados continuam no
 * projeto de antes.
 */
export function ProjetoNaConta() {
  const projeto = useProjetoConectado()
  const [perguntando, definirPerguntando] = useState(false)
  const [trocando, definirTrocando] = useState(false)
  if (!projeto) return null

  return (
    <Painel titulo={copy.titulo} apoio={copy.apoio}>
      <p className="m-0 text-[13px] font-semibold">{copy.endereco}</p>
      <p className="val mt-1 mb-4 text-[12.5px] break-all">{projeto.configuracao.url}</p>
      <button type="button" className="botao-secundario" onClick={() => definirPerguntando(true)}>
        {copy.trocar}
      </button>

      {perguntando ? (
        <Dialogo
          titulo={copy.trocar}
          explicacao={copy.confirmarTroca}
          confirmar={copy.confirmar}
          cancelar={copy.cancelar}
          ocupado={trocando}
          aoCancelar={() => definirPerguntando(false)}
          aoConfirmar={() => {
            definirTrocando(true)
            void projeto.trocarDeProjeto()
          }}
        />
      ) : null}
    </Painel>
  )
}

/** O atalho da tela de entrada, para quem conectou o projeto errado e não consegue entrar. */
export function TrocarDeProjetoNaEntrada() {
  const projeto = useProjetoConectado()
  if (!projeto) return null
  return (
    <button type="button" className="botao-link self-start" onClick={() => void projeto.trocarDeProjeto()}>
      {copy.trocarNaEntrada}
    </button>
  )
}
