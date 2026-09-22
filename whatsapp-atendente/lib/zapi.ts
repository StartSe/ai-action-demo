// Conversa com a instância da empresa na z-api (z-api.io): estado da conexão, QR Code, envio de
// texto, desconexão e o cadastro dos avisos que a z-api manda de volta para este app.
//
// Endereços e formatos CONFERIDOS na documentação oficial em 17/09/2026 (https://developer.z-api.io,
// versão "API Reference" em português, 246 páginas). Todos os caminhos saem da mesma base
// `https://api.z-api.io/instances/<identificação>/token/<chave>/`, e toda chamada leva o cabeçalho
// `Client-Token` com a chave de segurança da conta:
//
//   GET  status                     → { connected, error, smartphoneConnected }
//   GET  qr-code/image              → { value: "data:image/png;base64,..." } (ou { challenge } quando o
//                                      aparelho exige chave de acesso; aqui isso conta como "sem código")
//   POST send-text  { phone, message, delayTyping }  → { zaapId, messageId, id }
//                                     (`delayTyping`: segundos de "Digitando..." antes de enviar, 1 a 15;
//                                      reconferido em 22/09/2026 em /message/send-text)
//   GET  disconnect                 → { value: true }
//   GET  restart                    → { value: true }
//   PUT  update-webhook-received     { value }  → { value: true }
//   PUT  update-webhook-connected    { value }  → { value: true }
//   PUT  update-webhook-disconnected { value }  → { value: true }
//
// A documentação atual não tem mais `restore-session` (o nome citado na PRD desta rodada): o endereço
// equivalente hoje é `restart`, e é ele que `reiniciarSessao()` chama.
import { randomBytes } from "node:crypto";
import { ErroWhatsApp, type CodigoErroWhatsApp } from "./erro-whatsapp";
import { getConfig, setConfig } from "./store";

/** Base da z-api. A variável só existe para os testes locais apontarem para uma z-api falsa. */
const BASE = process.env.ZAPI_BASE_URL || "https://api.z-api.io";

export type CredenciaisZapi = { instanceId: string; token: string; clientToken: string };

/** As três credenciais da instância, ou null quando alguma ainda não foi colada em Configurações. */
export function credenciais(): CredenciaisZapi | null {
  const instanceId = getConfig("ZAPI_INSTANCE_ID");
  const token = getConfig("ZAPI_TOKEN");
  const clientToken = getConfig("ZAPI_CLIENT_TOKEN");
  if (!instanceId || !token || !clientToken) return null;
  return { instanceId, token, clientToken };
}

/**
 * Chave secreta que vai na URL dos avisos da z-api (`/webhook/zapi?chave=...`). Mesmo padrão do valor
 * de verificação da Meta: 32 bytes aleatórios gerados na primeira necessidade e guardados no banco.
 */
export function chaveWebhookZapi(): string {
  const atual = getConfig("WHATSAPP_WEBHOOK_CHAVE");
  if (atual) return atual;
  const gerada = randomBytes(32).toString("hex");
  setConfig("WHATSAPP_WEBHOOK_CHAVE", gerada);
  return gerada;
}

/** Endereço completo dos avisos, com a chave. Usado no cadastro automático e em "Para a equipe técnica". */
export function enderecoAvisos(urlBase: string): string {
  return `${urlBase.replace(/\/+$/, "")}/webhook/zapi?chave=${chaveWebhookZapi()}`;
}

// --- Estado conhecido da conexão ---------------------------------------------------------------
// O número conectar ou cair é um evento externo: a z-api avisa por `/webhook/zapi`, e toda consulta ao
// estado também atualiza esta chave. Guardar no banco é o que permite a tela abrir já sabendo o
// estado, sem esperar uma ida à z-api.

const CHAVE_CONEXAO = "WHATSAPP_CONEXAO";

export type ConexaoWhatsApp = { conectado: boolean; em: string; numero?: string; nome?: string };

export function lerConexao(): ConexaoWhatsApp | null {
  const bruto = getConfig(CHAVE_CONEXAO);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as ConexaoWhatsApp;
  } catch (err) {
    console.error(`Falha ao ler ${CHAVE_CONEXAO}`, err);
    return null;
  }
}

export function gravarConexao(conexao: ConexaoWhatsApp): void {
  const anterior = lerConexao();
  // Nome e número só chegam no aviso de conexão: uma consulta de estado posterior não pode apagá-los.
  const numero = conexao.numero ?? (conexao.conectado ? anterior?.numero : undefined);
  const nome = conexao.nome ?? (conexao.conectado ? anterior?.nome : undefined);
  setConfig(CHAVE_CONEXAO, JSON.stringify({ ...conexao, numero, nome } satisfies ConexaoWhatsApp));
}

// --- Tradução das falhas -----------------------------------------------------------------------

/**
 * Traduz a recusa da z-api para uma frase de negócio, no mesmo formato de `interpretarFalhaMeta`.
 * A z-api devolve o motivo real dentro do corpo (`error`), muitas vezes com o mesmo status — por isso
 * a decisão olha o texto, não só o status.
 */
export function interpretarFalhaZapi(status: number, detalhe: string): ErroWhatsApp {
  console.error("z-api recusou:", status, detalhe.slice(0, 200));
  const texto = detalhe.toLowerCase();

  if (/not connected|restore the session|disconnected|instance is not|não conectado/.test(texto)) {
    return new ErroWhatsApp("sem_sessao", "O número ainda não está conectado. Escaneie o QR Code em Configurações.", 409);
  }
  if (status === 401 || status === 403 || status === 404 || /null not allowed|client-?token|unauthorized|invalid token|forbidden/.test(texto)) {
    return new ErroWhatsApp(
      "credenciais",
      "A z-api não reconheceu a identificação ou as chaves da instância. Confira os três valores em Configurações.",
      401
    );
  }
  if (status === 429 || /rate limit|too many|throttl/.test(texto)) {
    return new ErroWhatsApp("limite", "A z-api está limitando o envio agora. Espere um minuto.", 429);
  }
  return new ErroWhatsApp("servico", "A z-api não está respondendo agora.", 502);
}

// --- Chamadas ----------------------------------------------------------------------------------

function endereco(c: CredenciaisZapi, caminho: string): string {
  return `${BASE}/instances/${encodeURIComponent(c.instanceId)}/token/${encodeURIComponent(c.token)}/${caminho}`;
}

function semCredenciais(): ErroWhatsApp {
  return new ErroWhatsApp(
    "sem_numero",
    "O número da empresa ainda não está conectado. Conecte o WhatsApp em Configurações para responder clientes de verdade.",
    400
  );
}

async function chamar(caminho: string, opcoes: { metodo?: "GET" | "POST" | "PUT"; corpo?: unknown } = {}): Promise<Record<string, unknown>> {
  const c = credenciais();
  if (!c) throw semCredenciais();
  const { metodo = "GET", corpo } = opcoes;

  let resposta: Response;
  try {
    resposta = await fetch(endereco(c, caminho), {
      method: metodo,
      headers: { "Content-Type": "application/json", "Client-Token": c.clientToken },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch (err) {
    console.error("Erro de rede ao chamar a z-api:", err);
    throw new ErroWhatsApp("rede", "Não foi possível falar com o WhatsApp agora. Confira a conexão da internet do servidor e tente de novo.", 503);
  }

  const texto = await resposta.text().catch(() => "");
  if (!resposta.ok) throw interpretarFalhaZapi(resposta.status, texto);

  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    dados = {};
  }
  return dados;
}

/**
 * Estado da instância: se o número está ligado à z-api e se o celular da empresa está com internet.
 * O `codigo` acompanha o `erro` porque quem desenha a tela precisa separar "ainda não escanearam o
 * QR Code" (`sem_sessao`, espera normal) de "as credenciais estão erradas" (`credenciais`, problema).
 */
export async function statusInstancia(): Promise<{ conectado: boolean; celularConectado: boolean; erro?: string; codigo?: CodigoErroWhatsApp }> {
  try {
    const dados = await chamar("status");
    const conectado = dados.connected === true;
    const celularConectado = dados.smartphoneConnected === true;
    gravarConexao({ conectado, em: new Date().toISOString() });
    return { conectado, celularConectado };
  } catch (err) {
    if (err instanceof ErroWhatsApp) {
      if (err.codigo === "sem_sessao") gravarConexao({ conectado: false, em: new Date().toISOString() });
      return { conectado: false, celularConectado: false, erro: err.message, codigo: err.codigo };
    }
    console.error("Falha inesperada ao consultar a z-api:", err);
    return { conectado: false, celularConectado: false, erro: "A z-api não está respondendo agora.", codigo: "servico" };
  }
}

/**
 * Imagem do QR Code pronta para um `<img src>` (data URL). Devolve null quando o número já está
 * conectado (a z-api recusa o código nesse caso) ou quando o aparelho pede a chave de acesso do
 * WhatsApp, fluxo que este app não cobre.
 */
export async function qrCode(): Promise<string | null> {
  const c = credenciais();
  if (!c) throw semCredenciais();

  let resposta: Response;
  try {
    resposta = await fetch(endereco(c, "qr-code/image"), { headers: { "Content-Type": "application/json", "Client-Token": c.clientToken } });
  } catch (err) {
    console.error("Erro de rede ao pedir o QR Code à z-api:", err);
    throw new ErroWhatsApp("rede", "Não foi possível falar com o WhatsApp agora. Confira a conexão da internet do servidor e tente de novo.", 503);
  }

  const texto = await resposta.text().catch(() => "");
  // "You are already connected": não é falha, é o número já ligado — quem chamou mostra o estado conectado.
  if (/already connected/i.test(texto)) return null;
  if (!resposta.ok) throw interpretarFalhaZapi(resposta.status, texto);

  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    dados = {};
  }
  if (dados.challenge) return null;
  const valor = typeof dados.value === "string" ? dados.value : null;
  if (!valor) return null;
  return valor.startsWith("data:") ? valor : `data:image/png;base64,${valor}`;
}

/**
 * Segundos de "Digitando..." que o cliente vê antes da resposta chegar: proporcional ao tamanho do
 * texto, entre 1 s e 3 s. Uma resposta que aparece no mesmo instante da pergunta denuncia o robô; três
 * segundos é o teto para não parecer que ninguém está lá.
 */
export function segundosDigitando(texto: string): number {
  return Math.min(3, Math.max(1, Math.ceil(texto.length / 80)));
}

/** Manda a resposta do atendente pelo número real. Lança ErroWhatsApp já traduzido. */
export async function enviarTexto(para: string, texto: string): Promise<void> {
  const dados = await chamar("send-text", { metodo: "POST", corpo: { phone: soDigitos(para), message: texto, delayTyping: segundosDigitando(texto) } });
  // A z-api às vezes responde 200 com { error: "..." } em vez de um status de erro.
  if (!dados.messageId && !dados.zaapId && typeof dados.error === "string") {
    throw interpretarFalhaZapi(200, dados.error);
  }
}

/** Só os dígitos, no formato que a z-api exige (DDI + DDD + número, sem máscara). */
function soDigitos(numero: string): string {
  return numero.replace(/\D/g, "");
}

export async function desconectar(): Promise<void> {
  await chamar("disconnect");
  gravarConexao({ conectado: false, em: new Date().toISOString() });
}

/** Reinicia a instância sem precisar ler o QR Code de novo (era `restore-session` em versões antigas). */
export async function reiniciarSessao(): Promise<void> {
  await chamar("restart");
}

/**
 * Cadastra na instância os três avisos que este app precisa receber: mensagem recebida, número
 * conectado e número desconectado. Todos apontam para a mesma rota, que separa os casos pelo corpo.
 * Chamado logo depois de salvar as credenciais em Configurações — a pessoa nunca faz isso à mão.
 */
export async function configurarWebhooks(urlBase: string): Promise<void> {
  const value = enderecoAvisos(urlBase);
  for (const caminho of ["update-webhook-received", "update-webhook-connected", "update-webhook-disconnected"]) {
    await chamar(caminho, { metodo: "PUT", corpo: { value } });
  }
  setConfig(CHAVE_AVISOS_CADASTRADOS, value);
}

/** Último endereço de avisos que este app cadastrou na instância — a memória de `garantirWebhooks`. */
const CHAVE_AVISOS_CADASTRADOS = "ZAPI_AVISOS_CADASTRADOS";

/**
 * Garante que a instância está avisando ESTE app, no endereço de agora. Existe porque `configurarWebhooks`
 * só roda no `PUT /api/setup`, e há três caminhos que deixam a instância apontando para o lugar errado
 * sem ninguém perceber:
 *   - as credenciais vieram por variável de ambiente (ninguém salvou nada em Configurações);
 *   - o app mudou de endereço público (domínio novo, outro serviço);
 *   - a chave da URL dos avisos foi gerada de novo (o banco é apagado a cada reinício quando não há
 *     disco, como no plano gratuito do Render) — a z-api continua chamando com a chave velha, e a rota
 *     responde 401 em silêncio, por desenho.
 * Só fala com a z-api quando o endereço mudou, então pode ser chamada em toda leitura do estado da
 * conexão. Nunca derruba quem chamou: falhar aqui só escreve no log.
 */
export async function garantirWebhooks(urlBase: string): Promise<void> {
  if (!credenciais()) return;
  const desejado = enderecoAvisos(urlBase);
  if (getConfig(CHAVE_AVISOS_CADASTRADOS) === desejado) return;
  try {
    await configurarWebhooks(urlBase);
    console.log("Avisos da z-api cadastrados para", desejado.split("?")[0]);
  } catch (err) {
    console.error("Falha ao cadastrar os avisos da z-api:", err);
  }
}
