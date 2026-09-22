/**
 * O que o atendente lembra de uma conversa longa.
 *
 * Uma conversa de WhatsApp não termina: o cliente volta no dia seguinte e continua de onde parou. A
 * memória de curto prazo da IA são as últimas mensagens (lib/conversas.ts:historicoRecente), e numa
 * conversa comprida o começo — justamente onde o cliente disse o que queria, para quando e por quanto
 * — cai fora da janela. A partir daí o atendente pergunta de novo o que já foi dito, e é isso que faz
 * um atendimento parecer de robô.
 *
 * A solução aqui é um resumo rolante: passando de `MAX_HISTORICO` mensagens, tudo o que está antes das
 * últimas `MENSAGENS_COM_RESUMO` vira um parágrafo curto, guardado em `conversas.resumo`. A resposta
 * seguinte leva o resumo + as últimas 12 mensagens, em vez de 20 mensagens soltas.
 *
 * Três decisões que valem para quem mexer aqui:
 * - **Depois da resposta, nunca antes** (o padrão de `classificarEmSegundoPlano`): resumir custa uma
 *   ida à IA, e o cliente não pode esperar por ela. Uma falha só vai para o log.
 * - **Só quando há bastante coisa nova** (`MIN_NAO_RESUMIDAS`): reescrever o resumo a cada mensagem
 *   seria pagar uma chamada por mensagem para mudar uma vírgula.
 * - **Mescla, não substitui**: o resumo anterior entra no prompt do próximo, senão o começo da
 *   conversa (que ninguém mais vai ler) se perderia na primeira reescrita.
 *
 * A segunda metade do arquivo é a memória DO CLIENTE (tabela `contatos`, dona aqui): o que vale
 * lembrar dele de uma conversa para a outra. As duas coisas são diferentes de propósito — o resumo
 * morre com a conversa, a memória atravessa todas elas — e as três decisões acima valem para as duas.
 */
import { publicar } from "./eventos";
import { aiEnabled, askJSON } from "./ai";
import { definirResumo, isoDeBanco, MAX_HISTORICO, obterConversa, paraTextoDeBanco, resumoDaConversa } from "./conversas";
import { contatosExemplo } from "./demo";
import { getConfig } from "./estado";
import { textoParaIA } from "./midia";
import { numeroInterno } from "./rotulos";
import { abrirBanco } from "./store";
import {
  LIMITE_MEMORIA,
  PAPEIS_DE_CONVERSA,
  type AutorDaMemoria,
  type Config,
  type ContatoLembrado,
  type ConversaCompleta,
  type MensagemDaConversa,
} from "./types";

/** Quantas mensagens recentes vão inteiras para o prompt quando a conversa já tem resumo. */
export const MENSAGENS_COM_RESUMO = 12;

/**
 * Quantas mensagens ainda não resumidas justificam uma ida à IA. Abaixo disso o resumo continua como
 * está: as mensagens que faltam nele ainda estão no histórico recente, então nada se perde.
 */
const MIN_NAO_RESUMIDAS = 8;

/** Tamanho máximo do resumo guardado: um parágrafo, não uma segunda conversa dentro do prompt. */
const LIMITE_RESUMO = 600;

/** O nome que o bloco "Por que respondeu assim" mostra na linha do resumo. */
export const FONTE_RESUMO = "Resumo do começo desta conversa";

function montarSystemPrompt(config: Config): string {
  return `Você resume conversas de atendimento da ${config.negocio} para que o atendente não perca o começo de uma conversa longa.
Escreva em português do Brasil, em no máximo ${LIMITE_RESUMO} caracteres, num parágrafo corrido.
Guarde só o que ajuda a continuar o atendimento: o que o cliente quer, o que já foi combinado, dados que ele informou (nome, produto, data, endereço de entrega), o que ficou pendente e o que o atendente já respondeu.
Não invente nada que não esteja nas mensagens, não escreva opinião sobre o cliente e não repita mensagem por mensagem.
Responda no formato {"resumo": "..."}.`;
}

function corpoDoPrompt(anterior: string | null, mensagens: MensagemDaConversa[], atendente: string): string {
  const linhas = mensagens.map((m) => `${m.papel === "cliente" ? "Cliente" : atendente}: ${textoParaIA(m)}`).join("\n");
  // O resumo anterior vai junto e é isso que faz a memória ser rolante: o trecho mais antigo da
  // conversa já não existe em lugar nenhum além dele.
  return anterior
    ? `Resumo do que já aconteceu antes:\n${anterior}\n\nO que aconteceu depois disso:\n${linhas}\n\nEscreva UM resumo só, juntando os dois.`
    : `Conversa até aqui:\n${linhas}`;
}

/**
 * Atualiza (ou cria) o resumo do começo desta conversa. Devolve o resumo gravado, ou `null` quando não
 * havia o que resumir: sem IA conectada, conversa curta, conversa de exemplo (o que ela mostra faz
 * parte da demonstração) ou pouca coisa nova desde o último resumo.
 */
export async function atualizarResumo(numero: string): Promise<string | null> {
  if (!aiEnabled()) return null;
  const conversa = obterConversa(numero);
  if (!conversa || conversa.exemplo) return null;

  // Eventos da linha do tempo e notas internas não são conversa: eles não entram no resumo, pela mesma
  // razão de não entrarem no histórico que a IA vê.
  const mensagens = conversa.mensagens.filter((m) => PAPEIS_DE_CONVERSA.includes(m.papel));
  if (mensagens.length <= MAX_HISTORICO) return null;

  // O resumo cobre tudo o que está ANTES das mensagens que continuam indo inteiras no prompt: resumir
  // uma mensagem que o modelo vai ler na íntegra logo abaixo seria dizer a mesma coisa duas vezes.
  const antigas = mensagens.slice(0, -MENSAGENS_COM_RESUMO);
  const { resumo: anterior, ateId } = resumoDaConversa(numero);
  const novas = antigas.filter((m) => m.id > ateId);
  if (novas.length < MIN_NAO_RESUMIDAS) return null;

  const config = getConfig();
  const resposta = await askJSON<{ resumo?: string }>({
    system: montarSystemPrompt(config),
    prompt: corpoDoPrompt(anterior, novas, config.atendente),
    maxTokens: 300,
  });
  const texto = resposta?.resumo?.trim();
  if (!texto) return null;
  const resumo = texto.length > LIMITE_RESUMO ? `${texto.slice(0, LIMITE_RESUMO - 1)}…` : texto;
  definirResumo(numero, resumo, antigas[antigas.length - 1].id);
  return resumo;
}

/**
 * Resume sem segurar quem chamou: a resposta ao cliente já saiu, e o resumo só é usado na resposta
 * SEGUINTE. Uma falha (IA fora do ar, resposta em formato inesperado) fica no log e a conversa segue
 * com o resumo anterior — ou sem resumo, que é como ela estava antes desta rodada.
 */
export function atualizarResumoEmSegundoPlano(numero: string): void {
  atualizarResumo(numero).catch((err) => console.error(`Não foi possível resumir o começo da conversa ${numero}:`, err));
}

// --- O que o atendente lembra de cada cliente ---------------------------------------------------
// Tabela `contatos`, no mesmo `app.sqlite` de lib/store.ts. Dona deste arquivo, como `anexos` é de
// lib/anexos.ts: nada aqui consulta `conversas` ou `mensagens` por SQL — o que vem de lá chega pelas
// funções de lib/conversas.ts, e a chave entre as duas tabelas é só o número.
//
// A regra que manda no conteúdo é a mesma de todo o resto do app: só entra o que o app pode afirmar
// que o cliente disse, e o que está anotado fica à vista de quem atende, para ser corrigido ou
// apagado num clique. Saúde, documento, senha, cartão e opinião sobre o cliente são proibidos no
// prompt — não porque o modelo obedeceria sempre, mas porque a alternativa (não pedir nada disso) é
// a única que a equipe consegue conferir olhando o parágrafo no painel.

/** Quantas mensagens novas do cliente justificam uma ida à IA para reescrever o que ela lembra. */
const MIN_MENSAGENS_PARA_LEMBRAR = 4;

/** Por quantos dias o que uma pessoa escreveu à mão é intocável: a IA só acrescenta, nunca reescreve.
 *  Contados da correção (coluna `pessoa_em`), e não da última escrita — a IA acrescentar não reinicia
 *  o prazo, senão bastaria um acréscimo para a correção voltar a poder ser desfeita. */
const DIAS_DE_RESPEITO = 7;

/** Quantas mensagens da conversa vão no pedido: o suficiente para o que acabou de ser combinado. */
const MENSAGENS_NO_PEDIDO = 30;

/** O nome que o bloco "Por que respondeu assim" mostra na linha da memória do cliente. */
export const FONTE_MEMORIA = "O que o atendente lembra deste cliente";

type LinhaContato = {
  numero: string;
  nome_informado: string | null;
  email: string | null;
  telefone_retorno: string | null;
  memoria: string;
  ate_id: number;
  atualizado_em: string;
  atualizado_por: string;
  pessoa_em: string | null;
};

let contatosCriada = false;

function bancoDeContatos() {
  const d = abrirBanco();
  if (!contatosCriada) {
    d.exec(`CREATE TABLE IF NOT EXISTS contatos (
      numero TEXT PRIMARY KEY,
      nome_informado TEXT NULL,
      email TEXT NULL,
      telefone_retorno TEXT NULL,
      memoria TEXT NOT NULL DEFAULT '',
      ate_id INTEGER NOT NULL DEFAULT 0,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_por TEXT NOT NULL DEFAULT 'ia',
      pessoa_em TEXT NULL
    )`);
    // As duas colunas de marca (até onde a IA já leu, quando uma pessoa corrigiu) nasceram junto com a
    // tabela, mas o `CREATE TABLE IF NOT EXISTS` não as acrescentaria a um banco que já tivesse a
    // tabela sem elas. Padrão do resto do app: `ALTER TABLE` dentro de um `try`.
    for (const coluna of ["ate_id INTEGER NOT NULL DEFAULT 0", "pessoa_em TEXT NULL"]) {
      try {
        d.exec(`ALTER TABLE contatos ADD COLUMN ${coluna}`);
      } catch {
        // A coluna já existe: é o caminho normal.
      }
    }
    contatosCriada = true;
  }
  return d;
}

function paraContato(l: LinhaContato): ContatoLembrado {
  return {
    nomeInformado: l.nome_informado?.trim() || null,
    email: l.email?.trim() || null,
    telefoneRetorno: l.telefone_retorno?.trim() || null,
    memoria: l.memoria ?? "",
    atualizadoEm: isoDeBanco(l.atualizado_em),
    atualizadoPor: l.atualizado_por === "pessoa" ? "pessoa" : "ia",
  };
}

function linhaDoContato(numero: string): LinhaContato | undefined {
  return bancoDeContatos().prepare("SELECT * FROM contatos WHERE numero = ?").get(numero) as LinhaContato | undefined;
}

/** O que o atendente lembra deste cliente; `null` quando ele ainda não anotou nada. */
export function obterContato(numero: string): ContatoLembrado | null {
  const l = linhaDoContato(numero);
  return l ? paraContato(l) : null;
}

/** Os contatos de vários números de uma vez (a planilha de /relatorios), sem uma consulta por linha. */
export function contatosDe(numeros: string[]): Map<string, ContatoLembrado> {
  if (numeros.length === 0) return new Map();
  const marcas = numeros.map(() => "?").join(", ");
  const linhas = bancoDeContatos().prepare(`SELECT * FROM contatos WHERE numero IN (${marcas})`).all(...numeros) as LinhaContato[];
  return new Map(linhas.map((l) => [l.numero, paraContato(l)]));
}

/** O id da última mensagem desta conversa; 0 quando ela não existe mais (ou nunca existiu). */
function ultimaMensagemDaConversa(numero: string): number {
  const mensagens = obterConversa(numero)?.mensagens ?? [];
  return mensagens[mensagens.length - 1]?.id ?? 0;
}

/** Um campo de texto do contato, cortado no limite e sem espaço sobrando; `null` quando vazio. */
function campo(valor: string | null | undefined, limite = 120): string | null {
  const texto = (valor ?? "").trim();
  if (!texto) return null;
  return texto.length > limite ? texto.slice(0, limite) : texto;
}

/**
 * O que gravar. Campo AUSENTE (`undefined`) fica como está; campo vazio APAGA o que estava lá. É o que
 * deixa o "Salvar" do painel mexer só no parágrafo sem apagar o e-mail que o cliente tinha informado.
 */
export interface DadosDoContato {
  memoria: string;
  nomeInformado?: string | null;
  email?: string | null;
  telefoneRetorno?: string | null;
}

/**
 * Grava o que o atendente lembra deste cliente. `por` diz quem escreveu: `"pessoa"` quando veio do
 * painel do contato, e é isso que faz a IA parar de reescrever por sete dias (`atualizarMemoria`).
 */
export function salvarContato(numero: string, dados: DadosDoContato, por: AutorDaMemoria): ContatoLembrado {
  const memoria = dados.memoria.trim().slice(0, LIMITE_MEMORIA);
  // Até que mensagem esta anotação cobre. É um id, e não a data: duas mensagens do mesmo segundo
  // seriam indistinguíveis por data (o banco grava segundos inteiros), e uma delas ficaria de fora
  // para sempre. Mesma marca que o resumo da conversa usa (`resumo_ate_id`, em lib/conversas.ts).
  const ateId = ultimaMensagemDaConversa(numero);
  const atual = linhaDoContato(numero);
  const escolher = (novo: string | null | undefined, guardado: string | null) => (novo === undefined ? guardado : campo(novo));
  const agora = paraTextoDeBanco();
  bancoDeContatos()
    .prepare(
      `INSERT INTO contatos (numero, nome_informado, email, telefone_retorno, memoria, ate_id, atualizado_em, atualizado_por, pessoa_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(numero) DO UPDATE SET
            nome_informado = excluded.nome_informado,
            email = excluded.email,
            telefone_retorno = excluded.telefone_retorno,
            memoria = excluded.memoria,
            ate_id = excluded.ate_id,
            atualizado_em = excluded.atualizado_em,
            atualizado_por = excluded.atualizado_por,
            pessoa_em = excluded.pessoa_em`
    )
    .run(
      numero,
      escolher(dados.nomeInformado, atual?.nome_informado ?? null),
      escolher(dados.email, atual?.email ?? null),
      escolher(dados.telefoneRetorno, atual?.telefone_retorno ?? null),
      memoria,
      ateId,
      agora,
      por,
      // Quando uma PESSOA mexeu nisto pela última vez. É uma marca à parte de `atualizado_por` porque a
      // IA volta a ser a última a escrever no primeiro acréscimo, e sem esta coluna a proteção de sete
      // dias acabaria ali — na atualização seguinte a IA reescreveria por cima da correção.
      por === "pessoa" ? agora : (atual?.pessoa_em ?? null)
    );
  // A conversa aberta desenha este bloco no painel do contato: sem o aviso, a memória escrita depois
  // da resposta só apareceria na próxima vez que alguém abrisse a conversa.
  publicar({ tipo: "conversa", numero });
  return obterContato(numero) as ContatoLembrado;
}

/** Anota que a IA já leu até aqui, sem tocar no texto nem na data: ver `atualizarMemoria`. */
function avancarMarca(numero: string): void {
  bancoDeContatos().prepare("UPDATE contatos SET ate_id = ? WHERE numero = ?").run(ultimaMensagemDaConversa(numero), numero);
}

/** Apaga tudo o que o atendente lembra deste cliente (o "Apagar memória" do painel e a conversa apagada). */
export function apagarContato(numero: string): void {
  const apagou = bancoDeContatos().prepare("DELETE FROM contatos WHERE numero = ?").run(numero).changes > 0;
  if (apagou) publicar({ tipo: "conversa", numero });
}

/**
 * A conversa com o que o atendente lembra do cliente junto. É a rota que junta as duas tabelas (e não
 * `obterConversa`), para o dono de `conversas`/`mensagens` continuar sem saber que `contatos` existe.
 */
export function comContato<T extends ConversaCompleta | null>(conversa: T): T {
  if (!conversa) return conversa;
  return { ...conversa, contato: obterContato(conversa.numero) };
}

function montarSystemPromptMemoria(config: Config, soAcrescenta: boolean): string {
  const formato = soAcrescenta
    ? `Alguém da equipe escreveu à mão as anotações atuais, e elas NÃO podem ser alteradas nem repetidas. Em "acrescentar", escreva só os fatos novos que ainda não estão nelas — ou deixe vazio, se não houver nenhum.
Responda no formato {"acrescentar": "...", "nome": "...", "email": "...", "telefone": "..."}.`
    : `Junte os fatos novos às anotações atuais numa anotação só, sem repetir o que já está lá e sem perder o que continua valendo.
Responda no formato {"memoria": "...", "nome": "...", "email": "...", "telefone": "..."}.`;
  return `Você anota o que a ${config.negocio} precisa lembrar de um cliente para o próximo atendimento dele.
Escreva em português do Brasil, no máximo cinco fatos, num parágrafo corrido de até ${LIMITE_MEMORIA} caracteres.
O que vale anotar: como o cliente se apresentou, o que ele prefere, o que já comprou ou agendou, o que ficou pendente e o e-mail ou telefone que ele informou para retorno.
O que NUNCA pode ser anotado: informação de saúde, documentos (CPF, RG, passaporte, carteira), senhas, dados de cartão ou de conta bancária, e opinião sua sobre o cliente.
Não invente nada que não esteja escrito na conversa. Não havendo nada que valha a pena lembrar, deixe o texto vazio.
${formato}
Em "nome", "email" e "telefone" vão o nome como o cliente se apresentou e o e-mail e o telefone que ele deu para retorno; deixe vazio o que ele não informou.`;
}

function corpoDoPedidoDeMemoria(atual: ContatoLembrado | null, mensagens: MensagemDaConversa[], atendente: string): string {
  const linhas = mensagens.map((m) => `${m.papel === "cliente" ? "Cliente" : atendente}: ${textoParaIA(m)}`).join("\n");
  const anotacoes = atual?.memoria.trim() ? `Anotações atuais sobre este cliente:\n${atual.memoria}` : "Ainda não há anotações sobre este cliente.";
  return `${anotacoes}\n\nConversa com ele:\n${linhas}`;
}

/**
 * Junta o que já estava anotado com o que a IA acrescentou, sem estourar o limite nem deixar espaço
 * solto. O acréscimo que já está escrito ali é descartado: o prompt pede para não repetir, mas um
 * modelo que repita encheria a anotação com a mesma frase a cada conversa.
 */
function juntar(atual: string, novo: string): string {
  const anterior = atual.trim();
  const acrescimo = novo.trim();
  const texto = acrescimo && !anterior.includes(acrescimo) ? [anterior, acrescimo].filter(Boolean).join(" ") : anterior || acrescimo;
  return texto.length > LIMITE_MEMORIA ? `${texto.slice(0, LIMITE_MEMORIA - 1)}…` : texto;
}

/**
 * Anota o que valer a pena lembrar deste cliente. Devolve o contato gravado, ou `null` quando não havia
 * o que anotar: sem IA conectada, celular de teste ou assistente (números internos), conversa de
 * exemplo (o que ela mostra faz parte da demonstração), nenhuma mensagem nova do cliente desde a última
 * anotação, ou menos de quatro delas — e aí só quando a conversa está sendo resolvida (`aoResolver`),
 * que é a última chance de guardar o que foi combinado.
 *
 * Quando alguém da equipe escreveu a anotação nos últimos sete dias, a IA só ACRESCENTA: quem corrigiu
 * à mão o fez porque a IA tinha errado, e reescrever por cima desfaria a correção no dia seguinte.
 */
export async function atualizarMemoria(numero: string, { aoResolver = false }: { aoResolver?: boolean } = {}): Promise<ContatoLembrado | null> {
  if (!aiEnabled()) return null;
  // O celular de teste e o assistente de IA não são clientes: guardar memória deles encheria o painel
  // de anotações sobre conversas que a própria equipe escreveu para testar.
  if (numeroInterno(numero)) return null;
  const conversa = obterConversa(numero);
  if (!conversa || conversa.exemplo) return null;

  const linha = linhaDoContato(numero);
  const atual = linha ? paraContato(linha) : null;
  const ateId = Number(linha?.ate_id ?? 0);
  const mensagens = conversa.mensagens.filter((m) => PAPEIS_DE_CONVERSA.includes(m.papel));
  const novasDoCliente = mensagens.filter((m) => m.papel === "cliente" && m.id > ateId);
  if (novasDoCliente.length === 0) return null;
  if (!aoResolver && novasDoCliente.length < MIN_MENSAGENS_PARA_LEMBRAR) return null;

  const corrigidoEm = linha?.pessoa_em ? Date.parse(isoDeBanco(linha.pessoa_em)) : 0;
  const soAcrescenta = corrigidoEm > 0 && Date.now() - corrigidoEm < DIAS_DE_RESPEITO * 24 * 60 * 60 * 1000;
  const config = getConfig();
  const resposta = await askJSON<{ memoria?: string; acrescentar?: string; nome?: string; email?: string; telefone?: string }>({
    system: montarSystemPromptMemoria(config, soAcrescenta),
    prompt: corpoDoPedidoDeMemoria(atual, mensagens.slice(-MENSAGENS_NO_PEDIDO), config.atendente),
    maxTokens: 300,
  });
  if (!resposta) return null;

  const memoria = soAcrescenta ? juntar(atual?.memoria ?? "", resposta.acrescentar ?? "") : juntar("", resposta.memoria ?? "");
  // Em modo "só acrescenta", o que a pessoa escreveu à mão nos campos também fica: a IA só preenche o
  // que estiver em branco.
  const preferirAtual = (doAtual: string | null, daIA: string | undefined) => (soAcrescenta ? doAtual || campo(daIA) : campo(daIA) || doAtual);
  const dados: DadosDoContato = {
    memoria,
    nomeInformado: preferirAtual(atual?.nomeInformado ?? null, resposta.nome),
    email: preferirAtual(atual?.email ?? null, resposta.email),
    telefoneRetorno: preferirAtual(atual?.telefoneRetorno ?? null, resposta.telefone),
  };
  // Nada novo: não vale gravar uma linha vazia nem mexer na data (a tela diria "atualizado agora" sobre
  // uma anotação que continua a mesma).
  const igual =
    memoria === (atual?.memoria ?? "") &&
    dados.nomeInformado === (atual?.nomeInformado ?? null) &&
    dados.email === (atual?.email ?? null) &&
    dados.telefoneRetorno === (atual?.telefoneRetorno ?? null);
  if (igual || (!memoria && !dados.nomeInformado && !dados.email && !dados.telefoneRetorno)) {
    // Nada de novo para anotar. A marca de até onde a IA já leu avança assim mesmo: sem isso, as mesmas
    // mensagens contariam como novas para sempre e cada resposta custaria uma ida à IA à toa. O que não
    // pode mudar é a DATA — a tela diria "atualizado agora" sobre um texto que continua o mesmo, e a
    // proteção de sete dias do que uma pessoa escreveu se renovaria sozinha.
    if (atual) avancarMarca(numero);
    return null;
  }

  return salvarContato(numero, dados, "ia");
}

/**
 * As anotações dos clientes de exemplo vivem e morrem com as conversas de exemplo
 * (lib/demo.ts:contatosExemplo). Sem elas o bloco do painel só teria o que mostrar depois de uma chave
 * de IA e de algumas conversas de verdade, e o recurso ficaria invisível em toda demonstração.
 *
 * Quem chama passa se ainda EXISTE conversa de exemplo, em vez de mandar semear ou apagar: a
 * demonstração some por três caminhos diferentes (o link de Configurações, a primeira mensagem de um
 * cliente de verdade, a limpeza automática ao terminar de configurar), e nenhum deles precisa saber
 * que esta tabela existe — na leitura seguinte da lista, as anotações acompanham.
 */
export function sincronizarContatosDeExemplo(temExemplos: boolean): void {
  for (const c of contatosExemplo()) {
    const guardado = obterContato(c.numero);
    if (temExemplos && !guardado) {
      salvarContato(c.numero, { memoria: c.memoria, nomeInformado: c.nomeInformado, email: c.email, telefoneRetorno: c.telefoneRetorno }, "ia");
    } else if (!temExemplos && guardado) {
      apagarContato(c.numero);
    }
  }
}

/**
 * Anota sem segurar quem chamou, como o resumo: a resposta ao cliente já saiu, e o que for anotado só
 * vale para o próximo atendimento. Uma falha fica no log e o contato continua como estava.
 */
export function atualizarMemoriaEmSegundoPlano(numero: string, opcoes?: { aoResolver?: boolean }): void {
  atualizarMemoria(numero, opcoes).catch((err) => console.error(`Não foi possível anotar o que lembrar do cliente ${numero}:`, err));
}
