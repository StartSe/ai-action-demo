// Despachante da conversa com o número real da empresa: decide entre a z-api (conexão por QR Code,
// o caminho normal) e a WhatsApp Cloud API da Meta (opção avançada, credenciais coladas à mão), manda
// as mensagens pelo provedor ativo, traduz as falhas da Meta para linguagem de negócio e registra o
// que aconteceu por último (para "Para a equipe técnica" em Configurações conseguir dizer se as
// mensagens estão mesmo chegando).
//
// As falhas da z-api e as chamadas dela ficam em lib/zapi.ts; ErroWhatsApp e os códigos, em
// lib/erro-whatsapp.ts (re-exportados aqui para quem já importava deste arquivo).
import { ACAO_NUMERO, ErroWhatsApp, type CodigoErroWhatsApp } from "./erro-whatsapp";
import { credenciais as credenciaisZapi, enviarTexto as enviarTextoZapi, lerConexao, statusInstancia } from "./zapi";
import { getConfig, setConfig } from "./store";

export { ACAO_NUMERO, ErroWhatsApp };
export type { CodigoErroWhatsApp };

/**
 * Traduz a resposta da Meta para uma frase de negócio. A Cloud API devolve o motivo real dentro do
 * corpo (`error.code`/`error.message`), quase sempre com o mesmo status HTTP — por isso a decisão olha
 * o texto, não só o status.
 */
export function interpretarFalhaMeta(status: number, detalhe: string): ErroWhatsApp {
  console.error("WhatsApp Cloud API recusou:", status, detalhe.slice(0, 200));
  const texto = detalhe.toLowerCase();

  if (/\b131047\b|24 hours|24 horas|re-?engagement/.test(texto)) {
    return new ErroWhatsApp(
      "janela_24h",
      "Já passaram mais de 24 horas desde a última mensagem desse cliente, e a Meta só permite respostas livres dentro dessa janela. Espere o cliente escrever de novo ou use um modelo de mensagem aprovado na Meta.",
      409
    );
  }
  if (/\b131030\b|allowed list|lista de permitidos/.test(texto)) {
    return new ErroWhatsApp(
      "destino_nao_liberado",
      "Esse cliente não está na lista de destinatários de teste da Meta. Enquanto o número estiver em modo de testes, só quem foi cadastrado no painel da Meta recebe respostas.",
      403
    );
  }
  if (/\b133010\b|not registered|não registrado|verified_?name|display_?phone/.test(texto)) {
    return new ErroWhatsApp(
      "numero_nao_verificado",
      "O número da empresa ainda não terminou a verificação na Meta. Conclua a verificação no painel da Meta e teste a conexão de novo em Configurações.",
      409
    );
  }
  if (status === 401 || status === 403 || /\b190\b|access token|expired|oauth/.test(texto)) {
    return new ErroWhatsApp(
      "autorizacao",
      "A Meta recusou a autorização do número: o código de acesso expirou ou foi revogado. Gere um novo código permanente no painel da Meta e cole em Configurações.",
      401
    );
  }
  if (status === 429 || /\b130429\b|rate limit|throttl/.test(texto)) {
    return new ErroWhatsApp("limite", "A Meta está limitando o envio de mensagens agora. Espere um minuto e tente de novo.", 429);
  }
  if (status >= 500) {
    return new ErroWhatsApp("servico", "O WhatsApp da Meta não está respondendo agora. Tente de novo em alguns minutos.", 502);
  }
  return new ErroWhatsApp("servico", "A Meta não aceitou a mensagem agora. Confira a conexão do número em Configurações e tente de novo.", 502);
}

// --- Diagnóstico da conexão ------------------------------------------------------------------
// Uma espera por um evento externo (a Meta chamando o webhook) precisa de registro local do que
// aconteceu, senão não há como saber que a conexão travou — mesmo padrão já usado em simulador-vendas.

const CHAVE_RECEBIDA = "WHATSAPP_ULTIMA_RECEBIDA";
const CHAVE_FALHA = "WHATSAPP_ULTIMA_FALHA";

export type UltimaRecebida = { em: string; de: string };
export type UltimaFalha = { em: string; mensagem: string };

function lerJson<T>(chave: string): T | null {
  const bruto = getConfig(chave);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as T;
  } catch (err) {
    console.error(`Falha ao ler ${chave}`, err);
    return null;
  }
}

export function registrarRecebida(de: string): void {
  setConfig(CHAVE_RECEBIDA, JSON.stringify({ em: new Date().toISOString(), de } satisfies UltimaRecebida));
}

export function ultimaRecebida(): UltimaRecebida | null {
  return lerJson<UltimaRecebida>(CHAVE_RECEBIDA);
}

export function registrarFalhaEnvio(mensagem: string): void {
  setConfig(CHAVE_FALHA, JSON.stringify({ em: new Date().toISOString(), mensagem } satisfies UltimaFalha));
}

export function ultimaFalhaEnvio(): UltimaFalha | null {
  return lerJson<UltimaFalha>(CHAVE_FALHA);
}

// --- Provedor ativo --------------------------------------------------------------------------

export type ProvedorWhatsApp = "zapi" | "meta";

/**
 * Qual caminho está configurado para falar com o número real. A z-api (as três credenciais coladas em
 * Configurações, conexão por QR Code) tem preferência; a Meta só entra quando é a única preenchida.
 */
export function provedorAtivo(): ProvedorWhatsApp | null {
  if (credenciaisZapi()) return "zapi";
  if (getConfig("WHATSAPP_TOKEN") && getConfig("WHATSAPP_PHONE_NUMBER_ID")) return "meta";
  return null;
}

// --- Envio -----------------------------------------------------------------------------------

/**
 * Manda a resposta do atendente de volta pelo número real, pelo provedor configurado. Lança
 * ErroWhatsApp já traduzido; quem chama decide se mostra na tela (simulador) ou só registra (webhook,
 * que responde ao provedor na hora).
 */
export async function enviarMensagem(para: string, texto: string): Promise<void> {
  const provedor = provedorAtivo();
  if (!provedor) {
    throw new ErroWhatsApp("sem_numero", "O número da empresa ainda não está conectado. Conecte o WhatsApp em Configurações para responder clientes de verdade.", 400);
  }
  if (provedor === "zapi") return enviarTextoZapi(para, texto);
  return enviarPelaMeta(para, texto);
}

async function enviarPelaMeta(para: string, texto: string): Promise<void> {
  const codigo = getConfig("WHATSAPP_TOKEN");
  const numeroId = getConfig("WHATSAPP_PHONE_NUMBER_ID");
  let resposta: Response;
  try {
    resposta = await fetch(`https://graph.facebook.com/v21.0/${numeroId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${codigo}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
    });
  } catch (err) {
    console.error("Erro de rede ao chamar a WhatsApp Cloud API:", err);
    throw new ErroWhatsApp("rede", "Não foi possível falar com o WhatsApp da Meta agora. Confira a conexão da internet do servidor e tente de novo.", 503);
  }

  if (!resposta.ok) {
    throw interpretarFalhaMeta(resposta.status, await resposta.text().catch(() => ""));
  }
}

/** Confere se o número responde, para o botão "Testar conexão" do cartão de Configurações. */
export async function conferirNumero(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  if (config.ZAPI_INSTANCE_ID && config.ZAPI_TOKEN && config.ZAPI_CLIENT_TOKEN) return conferirNumeroZapi();
  return conferirNumeroMeta(config);
}

async function conferirNumeroZapi(): Promise<{ ok: boolean; mensagem: string }> {
  const estado = await statusInstancia();
  if (estado.erro) return { ok: false, mensagem: estado.erro };
  if (!estado.conectado) return { ok: false, mensagem: "O número ainda não está conectado. Escaneie o QR Code em Configurações." };
  const conexao = lerConexao();
  const quem = conexao?.numero ? ` Número: ${conexao.numero}.` : "";
  if (!estado.celularConectado) {
    return { ok: true, mensagem: `Número conectado, mas o celular da empresa está sem internet agora — enquanto isso as respostas podem atrasar.${quem}` };
  }
  return { ok: true, mensagem: `Número conectado e pronto para responder clientes.${quem}` };
}

async function conferirNumeroMeta(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  const codigo = config.WHATSAPP_TOKEN;
  const numeroId = config.WHATSAPP_PHONE_NUMBER_ID;
  if (!codigo || !numeroId) return { ok: false, mensagem: "Cole a identificação e as duas chaves da instância e salve antes de testar." };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${numeroId}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${codigo}` },
    });
    if (!r.ok) return { ok: false, mensagem: interpretarFalhaMeta(r.status, await r.text().catch(() => "")).message };
    const dados = (await r.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string };
    if (!dados.display_phone_number) {
      return { ok: false, mensagem: "A Meta respondeu, mas não reconheceu esse número. Confira o identificador do número em Opções avançadas." };
    }
    return { ok: true, mensagem: `Conectado ao número ${dados.display_phone_number} (${dados.verified_name ?? "sem nome verificado"}).` };
  } catch (err) {
    console.error("Erro de rede ao testar o número na Meta:", err);
    return { ok: false, mensagem: "Não foi possível falar com o WhatsApp da Meta agora. Tente de novo em alguns minutos." };
  }
}

// --- "O número está conectado de verdade?" -----------------------------------------------------
// O chip de /api/status precisa de uma resposta imediata (a rota é síncrona e é chamada em toda tela),
// mas a verdade mora na z-api. A conciliação é um cache de 30 s: a leitura devolve o último estado
// conhecido (o mesmo que os avisos da z-api gravam, ver lib/zapi.ts) e, quando ele está velho, dispara
// uma consulta em segundo plano que atualiza o banco para a próxima leitura.

const VALIDADE_CACHE_MS = 30_000;
let consultadoEm = 0;

export function numeroConectado(): boolean {
  const provedor = provedorAtivo();
  if (!provedor) return false;
  // Na Meta não há sessão para cair: ter as credenciais é o que dá para saber sem gastar uma chamada.
  if (provedor === "meta") return true;

  const agora = Date.now();
  if (agora - consultadoEm > VALIDADE_CACHE_MS) {
    consultadoEm = agora;
    statusInstancia().catch((err) => console.error("Falha ao atualizar o estado da conexão do WhatsApp:", err));
  }
  return lerConexao()?.conectado === true;
}
