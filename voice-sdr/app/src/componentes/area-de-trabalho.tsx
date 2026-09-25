import type { ReactNode } from 'react'

/**
 * As props de uma tela que o assistente de configuração inicial embute. Sem
 * `dentroDoAssistente`, a tela é a da rota, sem mudança nenhuma.
 */
export type PropsDeTelaEmbutivel = {
  dentroDoAssistente?: boolean
}

type AreaDeTrabalhoProps = {
  titulo: string
  /** Uma frase abaixo do título, dizendo para que a tela serve. */
  lead?: string
  /** Botões ou links no canto superior direito, alinhados ao título. */
  acoes?: ReactNode
  /**
   * A tela aparece dentro do passo de `/configuracao-inicial`. Sai o `h1`, a
   * frase de apoio e o `main`: quem diz onde a pessoa está é o passo, e a
   * página já tem o seu. As ações ficam, porque costumam abrir o formulário.
   */
  embutida?: boolean
  children: ReactNode
}

/**
 * O `Workspace` da suíte, adaptado: a moldura de toda tela de trabalho. Traz o
 * único `h1` da tela, a frase de apoio e o conteúdo, numa coluna de largura
 * limitada.
 *
 * Não leva nome acessível de propósito. As telas contam suas próprias regiões
 * (o cartão de cada provedor em `/config/integracoes`, por exemplo), e uma
 * moldura rotulada somaria um marco a mais em toda tela sem dizer nada novo.
 */
export function AreaDeTrabalho({
  titulo,
  lead,
  acoes,
  embutida = false,
  children,
}: AreaDeTrabalhoProps) {
  if (embutida) {
    return (
      <div className="flex flex-col gap-4">
        {acoes ? (
          <div className="sem-impressao flex flex-wrap gap-2.5">{acoes}</div>
        ) : null}
        {children}
      </div>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[var(--largura-leitura)] px-8 pt-7 pb-14 max-md:px-4 max-md:pt-5 max-md:pb-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="titulo-de-tela m-0">{titulo}</h1>
          {lead ? (
            <p className="mt-2 mb-0 max-w-[68ch] text-texto-apoio">{lead}</p>
          ) : null}
        </div>
        {acoes ? (
          <div className="sem-impressao flex shrink-0 gap-2.5">{acoes}</div>
        ) : null}
      </header>

      {children}
    </main>
  )
}
