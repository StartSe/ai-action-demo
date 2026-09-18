// "Convite para treinar" (US-029): o formulário público que entrega o link do treino.
//
// O caminho normal é o gestor colar `/simular/<código>` no grupo do time. Quem precisa **divulgar** o
// treino — numa reunião, num anúncio interno, num e-mail para uma lista — costuma não querer o link
// direto: prefere saber quem pediu. Este convite é isso. A pessoa informa nome e e-mail, o app já a
// registra como participante e devolve o endereço do treino na tela de confirmação.
//
// O participante nasce aqui, antes da primeira conversa, para que quem abrir o link em seguida seja
// reconhecido pelo e-mail que já informou (`participantes.garantir` casa pelo e-mail normalizado).
import {
  contarRespostas,
  criar,
  expirou,
  listarPorTipo,
  obter as obterFormulario,
  registrarCallback,
  type CampoFormulario,
  type ParametrosPublicos,
} from "./formularios";
import { garantir } from "./participantes";
import { obter as obterSimulacao } from "./simulacoes";

export const TIPO_CONVITE = "convite-treino";

/** Dois campos e nada mais. Cada pergunta a mais é gente que desiste antes de treinar uma vez. */
export const CAMPOS_CONVITE: CampoFormulario[] = [
  { chave: "nome", rotulo: "Seu nome", tipo: "texto", obrigatorio: true },
  { chave: "email", rotulo: "Seu e-mail", tipo: "texto", obrigatorio: true },
];

/** O que a tela pública mostra. `codigo` é o treino que o convite abre — é ele que liga a resposta a
 * uma simulação, já que a tela pública (infraestrutura compartilhada) só conhece `parametros`. */
export type ParametrosConvite = ParametrosPublicos & { codigo: string };

/** O convite já criado para este treino, se houver. Um treino tem um convite, não um por clique. */
export function conviteDe(codigo: string): { token: string; parametros: ParametrosConvite } | null {
  const existente = listarPorTipo<ParametrosConvite>(TIPO_CONVITE, 200).find((f) => f.parametros?.codigo === codigo);
  return existente ? { token: existente.token, parametros: existente.parametros } : null;
}

/**
 * Cria (ou reaproveita) o convite de um treino e devolve o endereço dele.
 *
 * `base` é o endereço público da instalação, porque o link do treino precisa viajar **dentro** do
 * texto de agradecimento: a tela pública de formulário é infraestrutura compartilhada pelos 17 apps e
 * não tem onde encaixar um botão nosso. O agradecimento é a única superfície disponível, e ele é
 * escrito na criação — por isso o endereço tem de ser conhecido aqui, não no envio.
 *
 * Devolve `null` quando o treino não existe.
 */
export function criarLinkConvite(codigo: string, base: string): { token: string; url: string } | null {
  const simulacao = obterSimulacao(codigo);
  if (!simulacao) return null;

  const jaExiste = conviteDe(codigo);
  if (jaExiste) return { token: jaExiste.token, url: `${base}/f/${jaExiste.token}` };

  const parametros: ParametrosConvite = {
    marca: "S",
    nome: "Simulador de Vendas",
    titulo: `Treino de vendas: ${simulacao.nome}`,
    descricao: "Informe seu nome e seu e-mail para receber o endereço do treino. Você conversa com um cliente virtual e recebe um retorno no fim.",
    agradecimento: `Pronto! Seu treino está em ${base}/simular/${codigo}`,
    codigo,
  };

  // Sem prazo e sem limite: o convite acompanha o treino, e é o gestor quem tira um treino do ar
  // (mudando o status) — a mesma decisão do link do treino, que também não expira (US-011).
  const token = criar({ tipo: TIPO_CONVITE, campos: CAMPOS_CONVITE, parametros });
  return { token, url: `${base}/f/${token}` };
}

/**
 * Registra quem pediu o convite.
 *
 * A guarda de expiração/limite é repetida aqui porque `app/api/f/[token]/route.ts` chama o callback
 * **antes** de `responder()` validar: sem ela, uma resposta que a pessoa viu ser recusada com 410
 * ainda criaria o participante. Hoje o convite não tem prazo nem teto, mas quem vier acrescentar um
 * não deve precisar descobrir isto de novo.
 */
registrarCallback(TIPO_CONVITE, ({ token, dados }) => {
  const formulario = obterFormulario(token);
  if (!formulario) return;
  if (expirou(formulario)) return;
  if (formulario.limite !== null && contarRespostas(token) >= formulario.limite) return;

  const nome = (dados.nome || "").trim();
  const email = (dados.email || "").trim();
  if (!nome || !email) return;
  garantir({ nome, email, origem: "link" });
});
