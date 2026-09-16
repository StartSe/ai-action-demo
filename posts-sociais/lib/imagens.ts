// Geração da imagem de um post pela OpenAI (gpt-image-1 / gpt-image-1-mini), com as falhas do provedor
// traduzidas em ErroImagem: causa em português, código, status HTTP para a rota e ação para a tela.
// O detalhe técnico do provedor nunca chega à tela — só ao console.error (mesma regra de lib/ai.ts).
import { getConfig } from "./store";
import type { Rede } from "./types";

export type CodigoErroImagem =
  | "chave_ausente"
  | "chave_invalida"
  | "organizacao_nao_verificada"
  | "descricao_recusada"
  | "sem_credito"
  | "limite_pedidos"
  | "provedor_fora"
  | "rede"
  | "resposta_vazia";

const ACAO_CONFIGURAR = { rotulo: "Configurar as imagens", url: "/setup#openai" };
const ACAO_TROCAR_MODELO = { rotulo: "Trocar o modelo de imagem", url: "/setup#openai" };
const ACAO_ADICIONAR_CREDITO = { rotulo: "Adicionar crédito na OpenAI", url: "https://platform.openai.com/settings/organization/billing/overview" };

export class ErroImagem extends Error {
  codigo: CodigoErroImagem;
  status: number;
  acao?: { rotulo: string; url: string };
  /** true quando o app deve responder com o cartaz provisório no lugar da falha (ex.: conta sem crédito). */
  usarCartaz: boolean;

  constructor(codigo: CodigoErroImagem, mensagem: string, status: number, opcoes: { acao?: { rotulo: string; url: string }; usarCartaz?: boolean } = {}) {
    super(mensagem);
    this.name = "ErroImagem";
    this.codigo = codigo;
    this.status = status;
    this.acao = opcoes.acao;
    this.usarCartaz = Boolean(opcoes.usarCartaz);
  }
}

export function imagensEnabled(): boolean {
  return Boolean(getConfig("OPENAI_API_KEY"));
}

export function modeloImagem(): string {
  return getConfig("OPENAI_IMAGE_MODEL") || "gpt-image-1";
}

/** Único ponto que traduz uma resposta não-ok da OpenAI (ou uma falha de rede) em ErroImagem. */
export function interpretarFalhaImagem(status: number, detalheBruto: string): ErroImagem {
  console.error("OpenAI images", status, detalheBruto.slice(0, 300));
  const detalhe = detalheBruto.toLowerCase();

  if (status === 401) {
    return new ErroImagem("chave_invalida", "A chave da OpenAI foi recusada. Confira a chave em Configurações.", 401, { acao: ACAO_CONFIGURAR });
  }
  if (status === 400 || status === 403) {
    if (/organization must be verified|verify organization|verified to use/.test(detalhe)) {
      return new ErroImagem(
        "organizacao_nao_verificada",
        `Sua organização na OpenAI ainda não foi verificada para gerar imagens com o modelo ${modeloImagem()}. Verifique a organização no painel da OpenAI ou troque para o modelo mais leve (gpt-image-1-mini) em Configurações.`,
        400,
        { acao: ACAO_TROCAR_MODELO }
      );
    }
    if (/safety|content_policy|content policy|moderation|rejected|not allowed/.test(detalhe)) {
      return new ErroImagem("descricao_recusada", "A OpenAI recusou a descrição desta imagem. Edite o tema do post (ou reescreva o texto) e tente de novo.", 400);
    }
  }
  if (status === 429) {
    if (/insufficient_quota|exceeded your current quota|billing/.test(detalhe)) {
      return new ErroImagem(
        "sem_credito",
        "Sua conta na OpenAI está sem crédito para gerar imagens. Adicione crédito no painel da OpenAI; enquanto isso, o app usa o cartaz provisório.",
        402,
        { acao: ACAO_ADICIONAR_CREDITO, usarCartaz: true }
      );
    }
    return new ErroImagem("limite_pedidos", "A OpenAI está recebendo pedidos demais desta conta agora. Aguarde um minuto e tente de novo.", 429);
  }
  if (status >= 500) {
    return new ErroImagem("provedor_fora", "O gerador de imagens da OpenAI está indisponível neste momento. Tente de novo em alguns minutos.", 502);
  }
  return new ErroImagem("provedor_fora", "A OpenAI não conseguiu gerar esta imagem agora. Tente de novo em alguns minutos.", 502);
}

/** Chama a OpenAI e devolve a imagem como data URL (PNG). Lança ErroImagem em qualquer falha. */
export async function gerarImagemOpenAI({ prompt, rede }: { prompt: string; rede: Rede }): Promise<string> {
  const chave = getConfig("OPENAI_API_KEY");
  if (!chave) throw new ErroImagem("chave_ausente", "Nenhuma chave da OpenAI foi configurada. Conecte em Configurações.", 401, { acao: ACAO_CONFIGURAR });

  let r: Response;
  try {
    r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({ model: modeloImagem(), prompt, size: rede === "instagram" ? "1024x1024" : "1536x1024", n: 1 }),
    });
  } catch (err) {
    console.error("OpenAI images: falha de rede", err);
    throw new ErroImagem("rede", "Não foi possível falar com a OpenAI. Confira a conexão do servidor e tente de novo.", 503);
  }
  if (!r.ok) {
    throw interpretarFalhaImagem(r.status, await r.text().catch(() => ""));
  }
  const data = (await r.json().catch(() => null)) as { data?: { b64_json?: string }[] } | null;
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    console.error("OpenAI images: resposta sem imagem", JSON.stringify(data).slice(0, 200));
    throw new ErroImagem("resposta_vazia", "A OpenAI devolveu uma resposta sem imagem. Tente de novo.", 502);
  }
  return `data:image/png;base64,${b64}`;
}
