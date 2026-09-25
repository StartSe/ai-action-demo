import type { ReactNode } from 'react'

/**
 * Uma coluna. O título é o que aparece no cabeçalho, e `conteudo` é o que cada
 * linha desenha na célula — texto, selo ou o que a tela precisar.
 *
 * As colunas são **dado**, e não JSX repetido tela a tela: assim o teste varre
 * a lista para conferir o cabeçalho, em vez de repetir os títulos à mão, e
 * coluna nova entra nas asserções sozinha.
 */
export type ColunaDensa<Linha> = {
  titulo: string
  /**
   * Classe da célula. Dado que se lê como valor (telefone, duração, custo,
   * nota, horário) leva `.val`, pela seção 2 de docs/padrao-de-interface.md.
   */
  classe?: string
  conteudo: (linha: Linha) => ReactNode
}

/**
 * A seleção por linha, quando a tabela a oferece. Ela é **da tela**, e não da
 * tabela: quem guarda o que está marcado é quem sabe o que fazer com isso, e a
 * tabela só desenha a caixa e avisa o clique.
 */
export type SelecaoDaTabela<Linha> = {
  /** Nome acessível da caixa de cada linha. */
  rotuloDaLinha: (linha: Linha) => string
  /** Nome acessível da caixa do cabeçalho, que marca tudo o que está à vista. */
  rotuloDeTudo: string
  selecionada: (linha: Linha) => boolean
  /** Todas as linhas à vista estão marcadas. */
  tudoSelecionado: boolean
  /** Desabilita as caixas sem tirá-las da tela, para quem só lê. */
  desabilitada?: boolean
  aoAlternar: (linha: Linha) => void
  aoAlternarTudo: () => void
}

type TabelaDensaProps<Linha> = {
  /** Nome acessível da tabela, para quem navega por marcos e para o teste. */
  rotulo: string
  colunas: readonly ColunaDensa<Linha>[]
  linhas: readonly Linha[]
  chaveDaLinha: (linha: Linha) => string
  /** Quando presente, a tabela ganha a coluna de caixas à esquerda. */
  selecao?: SelecaoDaTabela<Linha>
}

/**
 * O `DataTable` da suíte: a tabela de trabalho, densa, sem zebra e sem
 * moldura própria. Quem decide o que é vazio, o que é erro e o que é espera é
 * a tela — esta só desenha as linhas que recebeu.
 */
export function TabelaDensa<Linha>({
  rotulo,
  colunas,
  linhas,
  chaveDaLinha,
  selecao,
}: TabelaDensaProps<Linha>) {
  // O invólucro é o table-wrap do design system: em tela estreita a tabela
  // rola de lado dentro da própria moldura, em vez de empurrar a página.
  return (
    <div className="max-w-full overflow-x-auto rounded-cartao">
    <table aria-label={rotulo} className="tabela">
      <thead>
        <tr>
          {selecao ? (
            <th className="w-9">
              <input
                type="checkbox"
                aria-label={selecao.rotuloDeTudo}
                checked={selecao.tudoSelecionado}
                disabled={selecao.desabilitada}
                onChange={selecao.aoAlternarTudo}
              />
            </th>
          ) : null}
          {colunas.map((coluna) => (
            <th key={coluna.titulo}>{coluna.titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => (
          <tr key={chaveDaLinha(linha)}>
            {selecao ? (
              <td>
                <input
                  type="checkbox"
                  aria-label={selecao.rotuloDaLinha(linha)}
                  checked={selecao.selecionada(linha)}
                  disabled={selecao.desabilitada}
                  onChange={() => selecao.aoAlternar(linha)}
                />
              </td>
            ) : null}
            {colunas.map((coluna) => (
              <td key={coluna.titulo} className={coluna.classe}>
                {coluna.conteudo(linha)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}
