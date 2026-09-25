// A porta do e-mail transacional (convite de reunião, e depois apuração e
// aviso de crédito).
//
// Uma porta, como a do calendário: quem decide o que mandar não conhece o
// provedor, e o provedor (`email-resend.ts`) não conhece reunião nenhuma. Três
// regras seguram o contrato:
//
// 1. **`ok: true` só com 2xx do provedor** (R-05). É o que autoriza quem chamou
//    a gravar `sent_at`; qualquer outra coisa é falha, com a frase traduzida.
// 2. **Nenhum método levanta.** O que o adaptador deixar escapar (rede caída,
//    prazo estourado) vira `sem_resposta` por `protegerPortaDeEmail`, e a
//    mensagem da exceção fica para trás: ela pode trazer URL ou corpo.
// 3. **Chave de idempotência por mensagem.** Duas idas com a mesma chave são o
//    mesmo envio para o provedor; quem chama a deriva do fato (reunião e
//    destinatário), nunca do relógio.
//
// Portável: sem Deno, sem rede, sem banco.

import { traduzirErroDoProvedor, type MotivoDoProvedor } from '../provedor/erros.ts'

/** Um anexo. `conteudo` é o texto cru; o adaptador codifica como o provedor pedir. */
export interface AnexoDeEmail {
  readonly nome: string
  readonly tipo: string
  readonly conteudo: string
}

export interface MensagemDeEmail {
  readonly para: string
  readonly assunto: string
  readonly texto: string
  readonly anexos: readonly AnexoDeEmail[]
  /** Mesma chave, mesmo envio: é o que impede o segundo convite na corrida. */
  readonly chaveDeIdempotencia: string
}

export type MotivoDoEmail = MotivoDoProvedor | 'destinatario_recusado' | 'nao_configurado' | 'remetente_invalido'

/**
 * Os motivos de e-mail que são da configuração da conta, e não do envio: o
 * convite não conta tentativa por eles, espera a conta configurar e sai
 * sozinho depois (`_shared/agenda/convite-de-reuniao.ts`).
 */
export const MOTIVOS_DE_CONFIGURACAO: ReadonlySet<MotivoDoEmail> = new Set(['nao_configurado', 'remetente_invalido'])

export interface FalhaDoEmail {
  readonly ok: false
  readonly motivo: MotivoDoEmail
  readonly mensagem: string
}

export type ResultadoDoEmail = { readonly ok: true; readonly idDoEnvio: string | null } | FalhaDoEmail

export interface PortaDeEmail {
  enviar(mensagem: MensagemDeEmail): Promise<ResultadoDoEmail>
}

// Registro de interface, não fala da Sarah: direto e declarativo
// (docs/padrao-de-interface.md seção 4). A tela de reuniões mostra estas
// frases ao lado do convite pendente.
export const MENSAGENS_DO_EMAIL: Record<MotivoDoEmail, string> = {
  chave_invalida:
    'O provedor de e-mail recusou a chave cadastrada. Gere uma nova no painel dele e substitua em Integrações.',
  sem_permissao:
    'O provedor de e-mail recusou o envio por permissão. Confira se o domínio de envio está verificado no painel dele.',
  sem_credito: 'A conta no provedor de e-mail está sem saldo. Recarregue no painel dele para voltar a enviar.',
  limite_de_taxa: 'O provedor de e-mail recusou por excesso de envios. O convite sai sozinho na próxima tentativa.',
  provedor_indisponivel: 'O provedor de e-mail está fora do ar. O convite sai sozinho na próxima tentativa.',
  sem_resposta: 'O provedor de e-mail não respondeu no tempo esperado. O convite sai sozinho na próxima tentativa.',
  falha_do_provedor:
    'O provedor de e-mail recusou o envio e não informou o motivo. Confira a configuração em Integrações se a falha continuar.',
  // Só a Z-API produz este motivo; para o e-mail é uma recusa sem nome.
  sessao_desconectada:
    'O provedor de e-mail recusou o envio e não informou o motivo. Confira a configuração em Integrações se a falha continuar.',
  destinatario_recusado: 'O provedor de e-mail recusou o endereço do destinatário. Confira o e-mail cadastrado.',
  nao_configurado:
    'Convite não enviado: configure o e-mail em Integrações, com a chave do provedor e o remetente num domínio verificado nele. O convite sai sozinho depois disso.',
  remetente_invalido:
    'Convite não enviado: o remetente cadastrado em Integrações não é um endereço de e-mail. Use o formato Nome <agenda@seudominio.com.br>, com o domínio verificado no provedor.',
}

export function falhaDoEmail(motivo: MotivoDoEmail): FalhaDoEmail {
  return { ok: false, motivo, mensagem: MENSAGENS_DO_EMAIL[motivo] }
}

/**
 * Código que só o e-mail produz, antes da tabela comum: endereço que o
 * provedor não aceita. É o único caso em que a correção é do cadastro, e não
 * da chave nem da paciência.
 */
const DO_EMAIL: ReadonlyArray<readonly [RegExp, MotivoDoEmail]> = [
  [/invalid[_\-\s]?(to|recipient)(?![a-z])/i, 'destinatario_recusado'],
]

/**
 * Reduz o que o provedor respondeu a motivo e frase. O código bruto é lido
 * aqui e morre aqui: nada do que esta função devolve o carrega.
 */
export function traduzirErroDoEmail(codigo: string | null | undefined, status?: number | null): FalhaDoEmail {
  const texto = codigo?.trim() ?? ''
  if (texto) {
    for (const [padrao, motivo] of DO_EMAIL) {
      if (padrao.test(texto)) return falhaDoEmail(motivo)
    }
  }
  return falhaDoEmail(traduzirErroDoProvedor(texto, status).motivo)
}

/** Embrulha um adaptador para que exceção não atravesse a porta. */
export function protegerPortaDeEmail(porta: PortaDeEmail): PortaDeEmail {
  return {
    async enviar(mensagem) {
      try {
        return await porta.enviar(mensagem)
      } catch {
        return falhaDoEmail('sem_resposta')
      }
    },
  }
}

/**
 * Base64 de texto UTF-8, sem `Buffer` (que o Deno não tem) e sem `btoa` direto
 * (que recusa caractere fora do Latin-1, e o convite tem acento).
 */
export function base64DoTexto(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario)
}
