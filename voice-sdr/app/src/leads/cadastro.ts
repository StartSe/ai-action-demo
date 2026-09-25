// As decisões puras do cadastro manual de lead (RF-106, RF-109). Nada aqui
// toca React, rede nem Supabase, e é por isso que tudo se prova em
// `cadastro.test.ts`.
//
// Três regras estruturam o arquivo:
//
// 1. **Quem decide se o número presta é `@compartilhado/telefone`.** A tela não
//    tem versão própria de "telefone válido": a mesma função que a planilha e o
//    endereço público usam decide aqui. Uma segunda regra aceitaria o que a
//    gravação recusa — ou, pior, produziria um E.164 diferente do dos outros
//    caminhos, e a duplicata passaria pelo índice único em vez de bater nele.
// 2. **Cidade, estado e fuso têm dois valores: o do DDD e o escrito.** O campo
//    guarda `null` enquanto ninguém o tocou, e o que aparece é o que o DDD
//    resolveu; escrever nele grava texto e o DDD para de mandar naquele campo.
//    Sem essa distinção, trocar o telefone depois de corrigir a cidade à mão
//    apagaria a correção — ou, no outro extremo, o campo ficaria preso no
//    primeiro DDD digitado. Derivar no desenho é também o que mantém a
//    sincronia fora de `useEffect`, que o lint desta base recusa.
// 3. **Campo vazio não é campo malformado.** A recusa só aparece depois que há
//    algo escrito: um formulário que abre pedindo desculpa pelo que ninguém
//    digitou ainda ensina a ignorar a mensagem de erro.
//
// A recusa é código (`MotivoDeRecusa`), nunca frase: a frase em português mora
// em `app/src/copy/leads.ts`, como em todo o resto desta base.

import { resolverDdd, type LocalDoDdd } from '@compartilhado/ddd.ts'
import {
  normalizarTelefone,
  type MotivoDeRecusa,
} from '@compartilhado/telefone.ts'

import type { NovoLead } from '@/leads/tipos'

/** `source` de todo lead que entra por esta tela. */
export const ORIGEM_DO_CADASTRO = 'manual'

/**
 * Os campos do formulário, como o operador os digita.
 *
 * `cidade`, `estado` e `fuso` são `string | null` e os outros são `string`: o
 * `null` é o "ainda não tocado" que deixa o DDD mandar no valor à vista.
 */
export interface CamposDoCadastro {
  nome: string
  telefone: string
  email: string
  empresa: string
  /** O que o operador chamou de origem. Vai para `source_ref`, não `source`. */
  origem: string
  /** A chave da etapa do funil padrão. Vazio é lead sem etapa. */
  etapa: string
  cidade: string | null
  estado: string | null
  fuso: string | null
}

export const CADASTRO_EM_BRANCO: CamposDoCadastro = {
  nome: '',
  telefone: '',
  email: '',
  empresa: '',
  origem: '',
  etapa: '',
  cidade: null,
  estado: null,
  fuso: null,
}

/** O que o normalizador e a tabela de DDD responderam sobre o que foi digitado. */
export interface LeituraDoTelefone {
  /** O E.164 que vai para o banco, ou `null` quando o número foi recusado. */
  readonly e164: string | null
  /** O código da recusa, ou `null` quando o número foi aceito. */
  readonly motivo: MotivoDeRecusa | null
  /** Os dois dígitos do DDD, quando o número foi aceito. */
  readonly ddd: string | null
  /** Cidade, estado e fuso do DDD. `null` quando não há número aceito. */
  readonly local: LocalDoDdd | null
}

/**
 * Lê o telefone a cada tecla. O DDD só é resolvido depois de o número passar:
 * resolver a partir dos dois primeiros dígitos de algo que ainda não é
 * telefone preencheria a cidade com o palpite de um número que não existe.
 */
export function lerTelefone(texto: string): LeituraDoTelefone {
  const normalizado = normalizarTelefone(texto)

  if (!normalizado.ok) {
    return { e164: null, motivo: normalizado.motivo, ddd: null, local: null }
  }

  return {
    e164: normalizado.e164,
    motivo: null,
    ddd: normalizado.ddd,
    local: resolverDdd(normalizado.ddd),
  }
}

/**
 * A recusa que a tela mostra. Campo em branco não mostra nada: `vazio` só
 * aparece quando se escreveu algo que não tem dígito nenhum, como um espaço.
 */
export function recusaAVista(
  texto: string,
  leitura: LeituraDoTelefone,
): MotivoDeRecusa | null {
  return texto === '' ? null : leitura.motivo
}

/** Cidade, estado e fuso como a tela os desenha. */
export interface Localidade {
  readonly cidade: string
  readonly estado: string
  readonly fuso: string
}

/** O escrito à mão vence; onde não houver escrito, o que o DDD resolveu. */
export function localidadeAVista(
  campos: CamposDoCadastro,
  local: LocalDoDdd | null,
): Localidade {
  return {
    cidade: campos.cidade ?? local?.cidade ?? '',
    estado: campos.estado ?? local?.estado ?? '',
    fuso: campos.fuso ?? local?.fuso ?? '',
  }
}

/**
 * Se algum dos três ainda mostra o que o DDD resolveu — é isso que a tela
 * precisa dizer para o operador não tomar o palpite por dado conferido.
 */
export function localidadeVeioDoDdd(
  campos: CamposDoCadastro,
  local: LocalDoDdd | null,
): boolean {
  if (local === null) return false
  return campos.cidade === null || campos.estado === null || campos.fuso === null
}

/**
 * Se o botão de gravar pode ser clicado.
 *
 * O telefone aceito é a primeira condição, e o duplicado conhecido é a outra:
 * mandar o RPC para receber a recusa do índice único gastaria uma ida ao
 * servidor para dizer o que a tela já sabe, e devolveria ao operador um erro no
 * lugar do lead que ele está procurando.
 */
export function podeGravar({
  e164,
  duplicado,
  gravando,
  podeEscrever,
}: {
  e164: string | null
  duplicado: boolean
  gravando: boolean
  podeEscrever: boolean
}): boolean {
  return e164 !== null && !duplicado && !gravando && podeEscrever
}

/**
 * O lead que o formulário grava.
 *
 * Tudo vai aparado, e o vazio continua vazio: quem o transforma em `null` antes
 * do RPC é o serviço, porque é lá que se fala a língua das colunas. A tela não
 * monta jsonb.
 */
export function montarNovoLead(
  campos: CamposDoCadastro,
  e164: string,
  local: LocalDoDdd | null,
): NovoLead {
  const localidade = localidadeAVista(campos, local)

  return {
    telefone: e164,
    nome: campos.nome.trim(),
    email: campos.email.trim(),
    empresa: campos.empresa.trim(),
    origem: campos.origem.trim(),
    etapa: campos.etapa.trim() || null,
    cidade: localidade.cidade.trim(),
    estado: localidade.estado.trim(),
    fuso: localidade.fuso.trim(),
  }
}
