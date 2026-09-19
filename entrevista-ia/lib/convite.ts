import type { AoProgressoConvite } from "./progresso-convite";
import { montarContexto, roteiroDaEntrevista } from "./roteiro";
// O convite de uma entrevista (US-014): o link público que o candidato abre, até quando ele vale e a
// mensagem pronta para colar num e-mail ou numa conversa.
//
// Por que um módulo acima das entidades (mesma razão de `lib/painel.ts`): o convite junta entrevista,
// vaga e candidato, e nenhum dos três pode importar os outros sem fechar ciclo.
//
// **O prazo mora na entrevista, não no formulário.** `lib/formularios.ts` é infraestrutura copiada
// igual em todos os apps: sabe criar um link com prazo e encerrá-lo, mas não sabe ESTENDER um prazo —
// e "Reenviar convite" é exatamente estender. Por isso o link nasce sem prazo próprio e quem decide
// se ele ainda vale é o status da entrevista (`expirarVencidas()` em lib/entrevistas.ts), conferido
// aqui em `resolverConvite()`. O limite de uma resposta continua sendo do formulário.
import { obter as obterCandidato } from "./candidatos";
import { caixaConectada } from "./email-envio";
import {
  cancelar,
  criar as criarEntrevista,
  definirCodigo,
  entrevistaViva,
  mudarStatus,
  obter as obterEntrevista,
  obterPorCodigo,
  type Entrevista,
} from "./entrevistas";
import { AGRADECIMENTO_APOIO, data } from "./formato";
import { contarRespostas, criar, encerrar, expirou, obter as obterFormulario, type ParametrosPublicos } from "./formularios";
import { getConfig } from "./store";
import type { Vaga as VagaDaSala } from "./types";
import { obter as obterVaga } from "./vagas";

/** O `tipo` do formulário dos convites novos. Os links antigos (`scorecard`) continuam abrindo a
 * mesma sala até vencerem — ver a nota de remoção no CLAUDE.md. */
export const TIPO_CONVITE = "entrevista";
export const TIPO_CONVITE_ANTIGO = "scorecard";

export const PRAZOS_VALIDOS = [7, 15, 30];
export const PRAZO_PADRAO = 15;

const MARCA = "E";
export const NOME_PUBLICO = "Entrevistadora IA";

/** Parâmetros guardados no formulário do convite: só o id da entrevista. Vaga, candidato e roteiro
 * são lidos do banco na hora, para uma vaga corrigida depois do convite valer para quem já o recebeu. */
export type ParametrosConvite = ParametrosPublicos & { entrevistaId: string };

/** O convite como as telas do painel o recebem. */
export type Convite = {
  entrevistaId: string;
  codigo: string;
  link: string;
  /** A mensagem pronta, com o link dentro — a mesma que o envio por e-mail usa. */
  mensagem: string;
  assunto: string;
  expiraEm?: string;
  candidatoNome: string;
  candidatoEmail?: string;
  cargo: string;
  duracaoMin: number;
  /** Só então a tela oferece "Enviar por e-mail": há canal conectado e o candidato tem endereço. */
  podeEnviarPorEmail: boolean;
  status: Entrevista["status"];
};

export type ResultadoConvite = { ok: true; convite: Convite } | { ok: false; erro: string; status: number };

export function prazoValido(bruto: unknown): number {
  const dias = Number(bruto);
  return PRAZOS_VALIDOS.includes(dias) ? dias : PRAZO_PADRAO;
}

/** Há canal de e-mail conectado (caixa própria, Resend ou SMTP)? `lib/notificacoes.ts` é copiado sem
 * alterar entre os apps e não expõe essa pergunta; a resposta é montada aqui. */
export function emailConectado(): boolean {
  return (
    caixaConectada("gmail") ||
    caixaConectada("outlook") ||
    Boolean(getConfig("NOTIFICACOES_RESEND_API_KEY")) ||
    Boolean(getConfig("NOTIFICACOES_SMTP_HOST"))
  );
}

function linkDoCodigo(origem: string, codigo: string): string {
  return `${origem.replace(/\/$/, "")}/entrevista/${codigo}`;
}

/**
 * A mensagem que o candidato recebe.
 *
 * Mora aqui, e não no diálogo, porque o envio por e-mail manda exatamente o mesmo texto: duas versões
 * da mesma mensagem viram duas promessas diferentes sobre a mesma conversa. Diz o que esperar, avisa
 * da gravação, da análise por inteligência artificial e da consulta a informações públicas (D12), e
 * fecha com o prazo e o uso único.
 */
export function mensagemConvite({
  candidatoNome,
  cargo,
  duracaoMin,
  link,
  expiraEm,
  remetente,
}: {
  candidatoNome: string;
  cargo: string;
  duracaoMin: number;
  link: string;
  expiraEm?: string;
  remetente?: string;
}): string {
  const primeiroNome = candidatoNome.trim().split(/\s+/)[0] || "Olá";
  const prazo = expiraEm
    ? `O link vale até ${data(expiraEm)} e pode ser usado uma vez só.`
    : "O link pode ser usado uma vez só.";
  const linhas = [
    `${primeiroNome}, tudo bem?`,
    "",
    `Queremos seguir com você no processo da vaga de ${cargo}. O próximo passo é uma conversa com a nossa entrevistadora de inteligência artificial: cerca de ${duracaoMin} minutos por voz, no seu celular ou computador, no horário que preferir.`,
    "",
    `É só abrir este link: ${link}`,
    "",
    `Sobre a conversa: ela é gravada e analisada por inteligência artificial para apoiar a nossa decisão, e também consultamos informações públicas sobre você na internet. ${prazo}`,
    "",
    "Qualquer dúvida, é só responder esta mensagem.",
  ];
  if (remetente?.trim()) linhas.push("", remetente.trim());
  return linhas.join("\n");
}

/** O convite de uma entrevista que já tem código, do jeito que a tela e o envio por e-mail o usam. */
export function conviteDaEntrevista(entrevistaId: string, origem: string, remetente?: string): ResultadoConvite {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) return { ok: false, erro: "Essa entrevista não existe mais.", status: 404 };
  if (!entrevista.codigo) return { ok: false, erro: "Este candidato ainda não tem convite. Envie o convite para gerar o link.", status: 409 };
  return montar(entrevista, entrevista.codigo, origem, remetente);
}

function montar(entrevista: Entrevista, codigo: string, origem: string, remetente?: string): ResultadoConvite {
  const vaga = obterVaga(entrevista.vagaId);
  const candidato = obterCandidato(entrevista.candidatoId);
  if (!vaga || !candidato) return { ok: false, erro: "A vaga ou o candidato deste convite foi apagado.", status: 404 };

  const link = linkDoCodigo(origem, codigo);
  return {
    ok: true,
    convite: {
      entrevistaId: entrevista.id,
      codigo,
      link,
      mensagem: mensagemConvite({
        candidatoNome: candidato.nome,
        cargo: vaga.cargo,
        duracaoMin: vaga.duracaoMin,
        link,
        expiraEm: entrevista.expiraEm,
        remetente,
      }),
      assunto: `Conversa sobre a vaga de ${vaga.cargo}`,
      expiraEm: entrevista.expiraEm,
      candidatoNome: candidato.nome,
      candidatoEmail: candidato.email,
      cargo: vaga.cargo,
      duracaoMin: vaga.duracaoMin,
      podeEnviarPorEmail: Boolean(candidato.email) && emailConectado(),
      status: entrevista.status,
    },
  };
}

/**
 * Cria ou renova o convite de uma entrevista.
 *
 * Enquanto o link não foi usado, **o código não muda**: reenviar só empurra o prazo, para quem já
 * recebeu a mensagem não descobrir que o endereço morreu. Um convite vencido ganha um link novo e a
 * entrevista volta a esperar o candidato.
 */
export async function convidar({
  entrevistaId,
  expiraEmDias,
  origem,
  remetente,
  progresso,
}: {
  entrevistaId: string;
  expiraEmDias?: unknown;
  origem: string;
  remetente?: string;
  progresso?: AoProgressoConvite;
}): Promise<ResultadoConvite> {
  progresso?.("dados");
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) return { ok: false, erro: "Essa entrevista não existe mais.", status: 404 };
  if (entrevista.status === "cancelada") {
    return { ok: false, erro: "Este convite foi cancelado. Adicione o candidato à vaga de novo para convidá-lo.", status: 400 };
  }
  if (entrevista.codigo && contarRespostas(entrevista.codigo) > 0) {
    return { ok: false, erro: "Esta pessoa já conversou com a entrevistadora; não há convite novo a enviar.", status: 400 };
  }
  // Um convite vencido só volta a valer se ninguém convidou a mesma pessoa para a mesma vaga no
  // meio-tempo: o índice parcial de lib/banco.ts não deixa duas entrevistas vivas do mesmo par.
  if (entrevista.status === "expirada") {
    const viva = entrevistaViva(entrevista.vagaId, entrevista.candidatoId);
    if (viva && viva.id !== entrevista.id) {
      return { ok: false, erro: "Esta pessoa já tem um convite em aberto para esta vaga.", status: 409 };
    }
  }

  const contexto = montarContexto(entrevista.id);
  if (!contexto) return { ok: false, erro: "Não foi possível preparar os dados desta entrevista.", status: 404 };
  try {
    progresso?.("roteiro");
    await roteiroDaEntrevista(entrevista.id, contexto);
  } catch (err) {
    console.error("Preparação do convite falhou:", err);
    return { ok: false, erro: "Não conseguimos preparar o roteiro. Tente gerar o convite novamente; o link só será liberado quando estiver pronto.", status: 503 };
  }
  // Revalida depois da IA: o gestor pode ter cancelado durante a preparação.
  const vigente = obterEntrevista(entrevista.id);
  if (!vigente || vigente.status === "cancelada") return { ok: false, erro: "Esta entrevista foi cancelada durante a preparação.", status: 409 };

  const vagaAtual = obterVaga(vigente.vagaId);
  if (!vagaAtual || vagaAtual.status === "encerrada") return { ok: false, erro: "A vaga foi encerrada durante a preparação. Reabra a vaga antes de gerar o convite.", status: 409 };
  progresso?.("link");
  const dias = prazoValido(expiraEmDias);
  const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
  const precisaDeLinkNovo = !vigente.codigo || vigente.status === "expirada" || !obterFormulario(vigente.codigo);

  let codigo = vigente.codigo as string;
  if (precisaDeLinkNovo) {
    const vaga = obterVaga(entrevista.vagaId);
    if (!vaga) return { ok: false, erro: "A vaga deste convite foi apagada.", status: 404 };
    const parametros: ParametrosConvite = {
      marca: MARCA,
      nome: NOME_PUBLICO,
      titulo: `Entrevista para ${vaga.cargo}`,
      descricao: `Uma conversa de cerca de ${vaga.duracaoMin} minutos sobre a vaga de ${vaga.cargo}, no horário que você preferir.`,
      entrevistaId: entrevista.id,
    };
    // Sem prazo próprio no formulário: quem manda no prazo é a entrevista (ver o cabeçalho deste arquivo).
    codigo = criar({ tipo: TIPO_CONVITE, campos: [], parametros, limite: 1 });
  }

  definirCodigo(entrevista.id, codigo, expiraEm);
  if (entrevista.status === "expirada") mudarStatus(entrevista.id, "convidada");

  const atualizada = obterEntrevista(entrevista.id);
  if (!atualizada) return { ok: false, erro: "Essa entrevista não existe mais.", status: 404 };
  return montar(atualizada, codigo, origem, remetente);
}

export type ResultadoAtribuicao = { ok: true; entrevista: Entrevista; convite: Convite } | { ok: false; erro: string; status: number };

/**
 * Atribui um candidato a uma vaga e já cria o convite (US-014).
 *
 * Atribuir e convidar são **um passo só**: uma entrevista sem link é uma linha que não faz nada, e
 * quem atribuiu teria de lembrar de um segundo clique para o candidato existir do lado de fora.
 *
 * Mora aqui, e não na rota, porque a mesma decisão vale para a tela, para o assistente de IA (a
 * ferramenta `criar_convite` em `lib/ferramentas.ts`, US-027) e para qualquer porta que venha depois:
 * duas cópias das regras de "esta vaga aceita mais alguém?" viram duas respostas diferentes para a
 * mesma pergunta. Convidar duas vezes o mesmo par não cria dois históricos — `criar()` devolve a
 * entrevista que já vale e o convite mantém o mesmo link enquanto ele não foi usado.
 */
export async function atribuirEConvidar({
  vagaId,
  candidatoId,
  expiraEmDias,
  origem,
  remetente,
  progresso,
}: {
  vagaId: string;
  candidatoId: string;
  expiraEmDias?: unknown;
  origem: string;
  remetente?: string;
  progresso?: AoProgressoConvite;
}): Promise<ResultadoAtribuicao> {
  progresso?.("dados");
  const vaga = obterVaga(vagaId);
  if (!vaga) return { ok: false, erro: "Essa vaga não existe mais.", status: 404 };
  if (vaga.status === "encerrada") {
    return { ok: false, erro: "Esta vaga está encerrada. Reabra a vaga para chamar mais candidatos.", status: 400 };
  }
  if (!obterCandidato(candidatoId)) return { ok: false, erro: "Esse candidato não existe mais.", status: 404 };

  const entrevista = criarEntrevista({ vagaId, candidatoId });
  const resultado = await convidar({ entrevistaId: entrevista.id, expiraEmDias, origem, remetente, progresso });
  if (!resultado.ok) return resultado;
  return { ok: true, entrevista: obterEntrevista(entrevista.id)!, convite: resultado.convite };
}

/** Cancela a entrevista e encerra o link: quem abrir o endereço depois disso lê que o convite foi
 * cancelado, em vez de entrar numa conversa que ninguém vai ler. */
export function cancelarConvite(entrevistaId: string): Entrevista | null {
  const entrevista = obterEntrevista(entrevistaId);
  if (!entrevista) return null;
  if (entrevista.codigo) encerrar(entrevista.codigo);
  return cancelar(entrevistaId);
}

/** Por que um link público não abre. Cada motivo tem a sua frase na tela do candidato.
 *
 * `concluida` é o único que não é má notícia: a conversa aconteceu e quem volta ao endereço vê a
 * mesma tela de agradecimento do fim da entrevista (US-021). Dizer "este link já foi usado" a quem
 * acabou de responder a oito perguntas soa como se a entrevista tivesse se perdido. */
export type MotivoFechado = "invalido" | "expirado" | "usado" | "cancelado" | "concluida";

export type SalaPublica = {
  marca: string;
  nome: string;
  /** A vaga no formato que `components/Sala.tsx` já conhece. */
  vaga: VagaDaSala;
  /** Quanto tempo a conversa costuma levar — o "cerca de N minutos" das boas-vindas (US-016). */
  duracaoMin: number;
  /** Só nos convites novos: os links antigos não têm entrevista no banco. */
  entrevistaId?: string;
};

/** Quanto dura a conversa de um link antigo (`scorecard`), que não tem vaga cadastrada por trás. */
export const DURACAO_PADRAO = 15;

export type ResolucaoConvite =
  | { ok: true; sala: SalaPublica }
  /** `nome` só vem com `motivo: "concluida"`: é o nome do agradecimento ("Obrigado, Bruno."). */
  | { ok: false; motivo: MotivoFechado; nome?: string };

/**
 * O que existe por trás de um código de link público — a única porta das quatro rotas públicas.
 *
 * Dois tipos convivem: `entrevista` (o convite desta história, que sabe de qual vaga e de qual pessoa
 * é) e `scorecard` (os links criados antes, que carregam a vaga digitada dentro dos parâmetros).
 */
export function resolverConvite(codigo: string): ResolucaoConvite {
  const formulario = obterFormulario<ParametrosConvite & { vaga?: VagaDaSala }>(codigo);
  // Sem formulário, a entrevista ainda pode saber o que aconteceu: `limparExpirados()` (rodado na
  // subida do servidor, ver instrumentation.ts) apaga o link encerrado, e sem esta consulta um
  // convite cancelado passaria a dizer "este link não existe" depois da primeira reinicialização.
  if (!formulario) {
    const orfa = obterPorCodigo(codigo);
    if (orfa?.status === "concluida" || orfa?.status === "avaliada") {
      return { ok: false, motivo: "concluida", nome: obterCandidato(orfa.candidatoId)?.nome };
    }
    if (orfa?.status === "cancelada") return { ok: false, motivo: "cancelado" };
    if (orfa?.status === "expirada") return { ok: false, motivo: "expirado" };
    return { ok: false, motivo: "invalido" };
  }

  if (formulario.tipo === TIPO_CONVITE_ANTIGO) {
    if (expirou(formulario)) return { ok: false, motivo: "expirado" };
    if (formulario.limite !== null && contarRespostas(codigo) >= formulario.limite) return { ok: false, motivo: "usado" };
    const { marca, nome, vaga } = formulario.parametros;
    if (!vaga) return { ok: false, motivo: "invalido" };
    return { ok: true, sala: { marca, nome, vaga, duracaoMin: DURACAO_PADRAO } };
  }

  if (formulario.tipo !== TIPO_CONVITE) return { ok: false, motivo: "invalido" };

  const entrevista = obterPorCodigo(codigo);
  if (!entrevista) return { ok: false, motivo: "invalido" };
  if (entrevista.status === "cancelada") return { ok: false, motivo: "cancelado" };

  const vaga = obterVaga(entrevista.vagaId);
  const candidato = obterCandidato(entrevista.candidatoId);
  if (!vaga || !candidato) return { ok: false, motivo: "invalido" };

  // A conclusão vem ANTES do prazo: uma entrevista respondida no último dia do convite continua
  // agradecendo a quem volta ao endereço na semana seguinte, em vez de dizer que o link venceu.
  // O limite de uso do formulário é a mesma notícia por outro caminho (`responder()` na conclusão).
  const concluida =
    entrevista.status === "concluida" ||
    entrevista.status === "avaliada" ||
    (formulario.limite !== null && contarRespostas(codigo) >= formulario.limite);
  if (concluida) return { ok: false, motivo: "concluida", nome: candidato.nome };

  if (entrevista.status === "expirada" || expirou(formulario)) return { ok: false, motivo: "expirado" };

  return {
    ok: true,
    sala: {
      marca: formulario.parametros.marca || MARCA,
      nome: formulario.parametros.nome || NOME_PUBLICO,
      vaga: {
        titulo: vaga.cargo,
        requisitos: vaga.requisitos,
        candidato: candidato.nome,
        tom: vaga.tom,
        numero_perguntas: vaga.numeroPerguntas,
      },
      duracaoMin: vaga.duracaoMin,
      entrevistaId: entrevista.id,
    },
  };
}

/** As frases que a tela pública mostra em cada motivo. Ficam aqui para a página e as rotas dizerem a
 * mesma coisa sobre o mesmo link. */
export const FECHADO: Record<MotivoFechado, { titulo: string; descricao: string; status: number }> = {
  invalido: {
    titulo: "Este link não existe",
    descricao: "Confira se o endereço foi copiado inteiro, ou peça um link novo a quem enviou este convite.",
    status: 404,
  },
  expirado: {
    titulo: "Este link expirou",
    descricao: "Peça um link novo a quem enviou este convite.",
    status: 410,
  },
  usado: {
    titulo: "Esta entrevista já foi concluída",
    descricao: "Este link já foi usado e não vale mais. A equipe de recrutamento entra em contato com os próximos passos.",
    status: 410,
  },
  // A página do candidato não mostra esta frase: ela renderiza o agradecimento (`agradecimentoTitulo`,
  // lib/formato.ts) com o nome de quem conversou. Estas palavras são as que as ROTAS devolvem quando
  // alguém tenta continuar uma conversa que já acabou.
  concluida: {
    titulo: "Esta entrevista já foi concluída",
    descricao: AGRADECIMENTO_APOIO,
    status: 410,
  },
  cancelado: {
    titulo: "Este convite foi cancelado",
    descricao: "Fale com quem enviou.",
    status: 410,
  },
};
