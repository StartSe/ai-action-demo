import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { useServicoDeConfiguracaoInicial } from '@/configuracao-inicial/contexto'
import {
  configuracaoConcluida,
  passosPendentes,
  quantidadeResolvida,
} from '@/configuracao-inicial/progresso'
import {
  BLOQUEIO_EM_PORTUGUES,
  PASSOS_EM_PORTUGUES,
  configuracaoInicial as copy,
} from '@/copy/configuracao-inicial'

/**
 * O checklist persistente da barra lateral. Fica enquanto houver pendência e
 * some da navegação quando não houver: acabada a configuração, ele não tem o
 * que dizer, e insistir nele gastaria a atenção que a operação precisa.
 *
 * Cada pendência vem com o que ela impede. É a diferença entre uma lista de
 * tarefas e uma explicação de por que a Sarah ainda não liga.
 */
export function ChecklistDeConfiguracao() {
  const servico = useServicoDeConfiguracaoInicial()

  // A mesma chave da tela do assistente: uma consulta serve as duas, e o
  // `refetch` de lá atualiza o checklist sem passar estado entre elas.
  const busca = useQuery({
    queryKey: ['configuracao-inicial'],
    queryFn: () => servico.carregar(),
  })

  const carga = busca.data
  // Falha de carga não vira aviso na barra lateral: o lugar de explicar o que
  // deu errado é a tela do assunto, e um erro fixo na navegação seguiria em
  // todas as telas sem nada a fazer a respeito.
  if (!carga?.ok) return null

  const configuracao = carga.configuracao
  if (configuracao.passos.length === 0) return null
  if (configuracaoConcluida(configuracao)) return null

  const pendentes = passosPendentes(configuracao)
  const resolvidos = quantidadeResolvida(configuracao)
  const fracao = Math.round((resolvidos / configuracao.passos.length) * 100)

  return (
    <section
      aria-label={copy.checklist.rotulo}
      className="mx-3 mt-4 rounded-cartao border border-borda-suave bg-superficie-funda px-3.5 py-3"
    >
      <h2 className="m-0 text-[12.5px] font-extrabold text-texto-principal">
        {copy.checklist.titulo}
      </h2>
      <p className="mt-1 mb-2 text-[11.5px] text-texto-apoio">
        <span className="val font-semibold text-texto-secundario">
          {resolvidos} de {configuracao.passos.length}
        </span>{' '}
        {copy.progresso.contagem}
      </p>
      {/* A mesma barra do tutorial: menta que chega ao carmim. */}
      <div
        aria-hidden="true"
        className="mb-3 h-[5px] overflow-hidden rounded-selo bg-superficie-3"
      >
        <div
          className="h-full rounded-selo bg-[image:var(--gradiente-progresso)]"
          style={{ width: `${fracao}%` }}
        />
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {pendentes.map((passo) => (
          <li key={passo.passo} className="flex gap-2">
            <span
              aria-hidden="true"
              className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-atencao"
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-texto-secundario">
                {PASSOS_EM_PORTUGUES[passo.passo].titulo}
              </span>
              {passo.bloqueia.map((codigo) => (
                <span
                  key={codigo}
                  className="block text-[11px] leading-snug text-texto-apoio-claro"
                >
                  {BLOQUEIO_EM_PORTUGUES[codigo]}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>

      <Link
        to="/configuracao-inicial"
        className="botao-link mt-3 block text-[12px]"
      >
        {copy.checklist.continuar}
      </Link>
    </section>
  )
}
