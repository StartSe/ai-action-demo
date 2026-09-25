import { CaixaDeErro } from '@/componentes/caixa-de-erro'
import { comum } from '@/copy/comum'
import type { Membro } from '@/equipe/tipos'

/**
 * A negativa de quem abre uma tela que tem o que ler e não o que mudar.
 *
 * Tela fechada por papel nega na tela, e não na rota: desviar em silêncio
 * deixaria quem clicou no item da barra lateral sem saber por que não chegou a
 * lugar nenhum. E a negativa termina em quem concede o acesso, senão ela só
 * informa que há uma porta.
 *
 * O `aviso` é do assunto da tela e vem da copy dela; as duas frases genéricas
 * são de `copy/comum.ts`, para a mesma negativa não ser escrita de novo a cada
 * tela.
 */
export function NegativaPorPapel({
  aviso,
  administradores,
}: {
  aviso: string
  administradores: readonly Membro[]
}) {
  return (
    <CaixaDeErro tom="atencao">
      <p className="m-0 font-medium">{aviso}</p>
      {administradores.length ? (
        <>
          <p className="mt-2.5 mb-1.5">{comum.negativaPorPapel.pedirAcesso}</p>
          <ul
            aria-label={comum.negativaPorPapel.pedirAcesso}
            className="m-0 flex list-none flex-col gap-1 p-0"
          >
            {administradores.map((membro) => (
              <li key={membro.usuarioId}>
                {membro.nome}{' '}
                <span className="val text-[12.5px]">{membro.email}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2.5 mb-0">{comum.negativaPorPapel.semAdministrador}</p>
      )}
    </CaixaDeErro>
  )
}
