import { useState } from 'react'

import { refDoProjeto } from '@/conexao/configuracao-do-projeto'
import { useProjetoConectado } from '@/conexao/contexto'
import { conexao } from '@/copy/conexao'
import { copiarTexto } from '@/utilidades/area-de-transferencia'

const copy = conexao.enderecosDoAuth

/**
 * Os dois endereços que o Auth do projeto precisa conhecer para os links de
 * e-mail voltarem para esta cópia.
 *
 * O Supabase só aceita o `redirectTo` que a interface manda quando ele está na
 * lista de Redirect URLs do projeto; fora dela, o link cai no Site URL, que num
 * projeto novo é `http://localhost:3000`. A instalação não consegue gravar essa
 * lista (o instalador do painel não tem o escopo Auth), e o endereço da cópia
 * só é conhecido aqui. Então a tela mostra o endereço exato, com botão de
 * copiar e o atalho para a página certa do projeto.
 *
 * Aparece onde o link de e-mail importa: na fundação e no pedido de
 * recuperação de senha.
 */
export function EnderecosDoAuth({ origem = window.location.origin }: { origem?: string }) {
  const projeto = useProjetoConectado()
  const ref = projeto ? refDoProjeto(projeto.configuracao.url) : null
  const redirect = `${origem}/**`

  return (
    <aside className="mt-5 rounded-cartao border border-borda-suave px-4 py-3.5 text-[12.5px]">
      <p className="m-0 font-semibold text-texto-principal">{copy.titulo}</p>
      <p className="mt-1 mb-3 text-texto-apoio">{copy.texto}</p>
      <Linha rotulo={copy.siteUrl} valor={origem} />
      <Linha rotulo={copy.redirect} valor={redirect} />
      {ref ? (
        <a
          className="botao-link mt-2 inline-block"
          href={`https://supabase.com/dashboard/project/${ref}/auth/url-configuration`}
          target="_blank"
          rel="noreferrer"
        >
          {copy.abrir}
        </a>
      ) : null}
    </aside>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, definirCopiado] = useState(false)
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="block text-texto-desativado">{rotulo}</span>
        <code className="val block break-all">{valor}</code>
      </div>
      <button
        type="button"
        className="botao-fantasma shrink-0"
        aria-label={`${copy.copiar} ${rotulo}`}
        onClick={() => {
          void copiarTexto(valor).then(definirCopiado)
        }}
      >
        {copiado ? copy.copiado : copy.copiar}
      </button>
    </div>
  )
}
