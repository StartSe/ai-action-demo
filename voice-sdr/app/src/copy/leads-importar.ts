// Os literais da importação de planilha (`/leads/importar`).
//
// Arquivo próprio, e não mais um objeto em `leads.ts`, porque esta tela tem
// três passos e escreve mais do que as outras duas juntas. O que ela divide com
// elas continua lá: `RECUSA_DO_TELEFONE` é a mesma frase na lista, no cadastro
// e aqui, e a frase de cada linha recusada do relatório vem do servidor, em
// `supabase/functions/leads-import/respostas.ts` — o corpo traz o código por
// linha e a frase uma vez, e repeti-la aqui criaria a segunda versão.
//
// **A planilha do Excel entra (D-08).** O seletor aceita CSV, TSV e `.xlsx`; o
// `.xlsx` é lido no navegador, sem biblioteca (`app/src/leads/xlsx.ts`), e só
// a primeira aba. O `.xls` antigo continua de fora, e a recusa diz como
// salvar. O teto de linhas aparece antes de escolher o arquivo, para a base
// grande já chegar dividida.
//
// Registro direto e declarativo (docs/padrao-de-interface.md seção 4): a tela
// afirma o que vai acontecer com o arquivo e o que já aconteceu, sem travessão
// e sem fecho de efeito.

import type { CampoDoLead } from '@importacao/previa.ts'

import type { MotivoDaLeitura } from '@/leads/planilha'
import type { EscolhaDeDuplicata, MotivoDaImportacao } from '@/leads/tipos'

/** Os três passos, na ordem em que a tela os percorre. */
export const PASSOS = ['arquivo', 'mapeamento', 'previa'] as const

export type Passo = (typeof PASSOS)[number]

/** O campo do lead como a tela o chama, no seletor do mapeamento. */
export const CAMPO_EM_PORTUGUES: Record<CampoDoLead, string> = {
  nome: 'Nome',
  telefone: 'Telefone',
  email: 'E-mail',
  empresa: 'Empresa',
  cidade: 'Cidade',
  estado: 'Estado',
  origem: 'Origem',
}

export const importacaoDeLeads = {
  titulo: 'Importar leads',
  explicacao:
    'Suba a planilha, confira o que entra e o que não entra, e só então mande gravar.',

  passos: {
    arquivo: { numero: '1', titulo: 'Arquivo' },
    mapeamento: { numero: '2', titulo: 'Colunas' },
    previa: { numero: '3', titulo: 'Prévia' },
  } satisfies Record<Passo, { numero: string; titulo: string }>,

  /** O passo 1. O arquivo é lido aqui, no navegador. */
  arquivo: {
    titulo: 'A planilha',
    apoio:
      'Aceita planilha do Excel (.xlsx) e CSV ou TSV, com vírgula, ponto e vírgula ou tabulação. O arquivo é lido no seu navegador: só as linhas seguem para o servidor.',
    campo: 'Arquivo da planilha',
    formatos: (teto: number) =>
      `Do Excel, entra a primeira aba. Cada importação leva até ${teto.toLocaleString('pt-BR')} linhas; base maior se importa em partes.`,
    vazio: {
      titulo: 'Nenhum arquivo escolhido',
      explicacao:
        'Escolha a planilha para ver as colunas que ela traz e o que cada linha faria.',
    },
    lido: (linhas: number, colunas: number) =>
      `${String(linhas)} ${linhas === 1 ? 'linha' : 'linhas'} e ${String(colunas)} ${colunas === 1 ? 'coluna' : 'colunas'} no arquivo.`,
    trocar: 'Escolher outro arquivo',
    seguir: 'Conferir as colunas',
  },

  /** Por que o arquivo não virou planilha. Todos se resolvem no arquivo. */
  falhasDaLeitura: {
    'arquivo-vazio': 'O arquivo não tem conteúdo. Confira se foi o certo.',
    'sem-linhas':
      'O arquivo tem só o cabeçalho. Nenhuma linha de lead para importar.',
    'cabecalho-vazio':
      'A primeira linha do arquivo precisa ter os nomes das colunas.',
    'colunas-repetidas':
      'Duas colunas do arquivo têm o mesmo nome. Renomeie uma delas e envie de novo.',
    'linhas-demais':
      'A planilha passa do limite de uma importação. Divida o arquivo e importe em partes.',
    'xlsx-ilegivel':
      'Não foi possível ler esta planilha do Excel. Abra no Excel, use Salvar como e escolha .xlsx de novo, ou CSV.',
    'xls-antigo':
      'Esta é uma planilha do Excel antigo (.xls) ou protegida por senha. No Excel, tire a senha e use Salvar como, escolhendo .xlsx ou CSV.',
  } satisfies Record<MotivoDaLeitura, string>,

  /** O passo 2. O palpite está pronto; a escolha é de quem importa (RF-101). */
  mapeamento: {
    titulo: 'De qual coluna vem cada campo',
    apoio:
      'O palpite vem do nome de cada coluna. Troque o que estiver errado: a coluna de telefone é a única sem a qual não dá para importar.',
    semColuna: 'Não importar',
    semTelefone:
      'Escolha a coluna de telefone. É por ele que a assistente liga, e é ele que diz se o lead já está na conta.',
    ignoradas: (colunas: readonly string[]) =>
      `Fica de fora do lead: ${colunas.join(', ')}.`,
    amostra: 'As três primeiras linhas, já pelo mapeamento acima',
    linha: 'Linha',
    vazio: '—',
    voltar: 'Voltar para o arquivo',
    seguir: 'Ver a prévia',
  },

  /** O passo 3. Os três números, as listas e a decisão (RF-103, RF-104). */
  previa: {
    carregando: 'Conferindo a planilha com os leads que a conta já tem.',
    titulo: 'O que esta planilha faria',
    semGravar:
      'Nada foi gravado. A prévia só lê a base para saber quais telefones já existem; a gravação acontece no botão abaixo.',
    validos: 'Entram como lead novo',
    invalidos: 'Ficam de fora',
    duplicados: 'Já estão na conta ou repetem no arquivo',
    linha: (numero: number) => `Linha ${String(numero)}`,
    semNome: 'Lead sem nome',
    verTodas: (quantas: number) => `Ver as ${String(quantas)} linhas`,
    verMenos: 'Ver menos',
    duplicadoNoArquivo: (primeira: number) =>
      `Repete o telefone da linha ${String(primeira)}.`,
    duplicadoNaBase: 'Este telefone já está cadastrado nesta conta.',
    nadaAImportar:
      'Nenhuma linha desta planilha entra como lead novo. Confira o mapeamento das colunas e os telefones do arquivo.',

    /** A decisão sobre duplicado, com a razão de `criar` não estar aqui. */
    decisao: 'O que fazer com telefone que já está na conta',
    escolhas: {
      ignorar: 'Manter o que já está cadastrado e pular a linha',
      atualizar: 'Preencher os campos vazios do lead que já existe',
    } satisfies Record<EscolhaDeDuplicata, string>,
    semCriar:
      'Criar um segundo lead com o mesmo telefone não é oferecido: um telefone responde por um lead só nesta conta, e a gravação recusaria a linha.',

    voltar: 'Voltar para as colunas',
    confirmar: 'Importar os leads',
    importando: 'Importando…',
  },

  /** O relatório, depois de gravar (RF-105). */
  relatorio: {
    titulo: 'Importação concluída',
    criados: 'Criados',
    ignorados: 'Ignorados',
    atualizados: 'Atualizados',
    erros: 'Com erro',
    resumo: (arquivo: string, linhas: number) =>
      `${arquivo}, ${String(linhas)} ${linhas === 1 ? 'linha' : 'linhas'}.`,
    listaDeErros: 'As linhas que não entraram',
    semRegistro: (linhas: readonly number[]) =>
      `Estes leads foram criados e ficaram sem o registro de qual arquivo os trouxe: ${linhas.join(', ')}. Os leads estão na lista.`,
    baixar: 'Baixar a lista de erros',
    semDownload:
      'Este navegador não deixou salvar o arquivo. A lista continua na tela.',
    arquivoDeErros: 'linhas-com-erro.csv',
    colunasDoArquivo: ['Linha', 'Motivo'],
    verLeads: 'Ver os leads importados',
    outraPlanilha: 'Importar outra planilha',
  },

  falhas: {
    'sem-permissao':
      'Seu papel nesta conta não permite importar leads. Peça acesso a quem administra a conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'planilha-recusada':
      'O servidor não entendeu o formato desta planilha. Confira o arquivo e envie de novo.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Nada foi gravado. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDaImportacao, string>,

  /** Quem acompanha a conta em leitura abre a tela e lê por que não importa. */
  leitura: {
    aviso:
      'Seu acesso a esta conta é de leitura. Importar leads é de quem opera o funil.',
    pedirAcesso: 'Peça acesso a uma destas pessoas:',
    semAdministrador:
      'Esta conta não tem administrador registrado. Fale com o suporte.',
  },

  equipeIndisponivel:
    'Não foi possível conferir seu papel nesta conta, e importar depende dele. Recarregue a tela em alguns minutos.',
} as const
