// "Programar publicação": envia um post pronto ao webhook de saída configurado em /setup#publicacao
// (Zapier "Catch Hook" ou Make "Custom webhook"), que publica na rede ou agenda no gerenciador da empresa.
// O corpo é sempre o mesmo, para o cenário do outro lado ser montado uma vez só:
// { rede, texto, hashtags, horario, imagem } — `imagem` é a data URL da imagem gerada (ou null).
import { getConfig } from "./store";
import type { Rede } from "./types";

export type Publicacao = { rede: Rede; texto: string; hashtags: string[]; horario: string; imagem: string | null };

export class ErroPublicacao extends Error {
  status: number;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, status: number, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroPublicacao";
    this.status = status;
    this.acao = acao;
  }
}

const ACAO_CONFIGURAR = { rotulo: "Conectar o Zapier ou o Make", url: "/setup#publicacao" };

export function publicacaoConfigurada(): boolean {
  return Boolean(getConfig("PUBLICACAO_WEBHOOK_URL"));
}

/** Envia o post ao webhook. Lança ErroPublicacao (400 sem endereço, 502 quando o outro lado recusa/não responde). */
export async function programarPublicacao(p: Publicacao): Promise<void> {
  const url = getConfig("PUBLICACAO_WEBHOOK_URL");
  if (!url) throw new ErroPublicacao("Nenhum endereço do Zapier ou do Make foi configurado ainda.", 400, ACAO_CONFIGURAR);

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rede: p.rede, texto: p.texto, hashtags: p.hashtags, horario: p.horario, imagem: p.imagem }),
    });
  } catch (err) {
    console.error("Publicação: falha de rede ao chamar o webhook", err);
    throw new ErroPublicacao("Não foi possível alcançar o Zapier ou o Make. Confira o endereço em Configurações e tente de novo.", 502, ACAO_CONFIGURAR);
  }
  if (!r.ok) {
    console.error("Publicação: webhook recusou", r.status, (await r.text().catch(() => "")).slice(0, 200));
    throw new ErroPublicacao("O Zapier ou o Make não aceitou este post. Confira se o gatilho está ligado e tente de novo.", 502, ACAO_CONFIGURAR);
  }
}
