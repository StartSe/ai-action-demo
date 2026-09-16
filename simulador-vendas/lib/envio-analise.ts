// "Enviar a análise ao vendedor": manda por e-mail, para o endereço cadastrado do vendedor
// (Vendedor.email), a nota e os pontos a melhorar da conversa analisada. Usa lib/notificacoes.ts,
// o mesmo canal das rotinas — a diferença é que o destino não é o gestor, é o vendedor da conversa.
import { anotacaoDaConversa } from "./crm";
import { obter as obterResultado } from "./historico";
import { enviar } from "./notificacoes";
import { motivoCanalIndisponivel } from "./rotinas";
import { enderecoPublico } from "./setup-comum";
import { obter as obterVendedor } from "./vendedores";
import type { Meta } from "./ai";
import type { Analise, Conversa } from "./types";

export const ACAO_NOTIFICACOES = { rotulo: "Configurar Notificações", url: "/setup#notificacoes" };

/** Falha ao enviar a análise. `status` 400 quando falta um pré-requisito da pessoa, 502 quando o provedor recusa. */
export class ErroEnvioAnalise extends Error {
  status: number;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, status = 502, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroEnvioAnalise";
    this.status = status;
    this.acao = acao;
  }
}

/** Envia a análise salva em `resultadoId` para o e-mail do vendedor daquela conversa. */
export async function enviarAnaliseAoVendedor(resultadoId: string): Promise<{ mensagem: string }> {
  const resultado = obterResultado<Conversa, Analise, Meta>(resultadoId);
  if (!resultado || resultado.tipo !== "conversa") {
    throw new ErroEnvioAnalise("Não encontrei esta conversa. Analise de novo e tente outra vez.", 400);
  }

  const vendedor = resultado.entrada.vendedorId ? obterVendedor(resultado.entrada.vendedorId) : null;
  if (!vendedor) throw new ErroEnvioAnalise("Escolha o vendedor desta conversa antes de enviar a análise.", 400);
  if (!vendedor.email) {
    throw new ErroEnvioAnalise(`${vendedor.nome} ainda não tem e-mail cadastrado. Cadastre o endereço e tente de novo.`, 400);
  }

  const motivo = motivoCanalIndisponivel("email");
  if (motivo) throw new ErroEnvioAnalise(motivo, 400, ACAO_NOTIFICACOES);

  const base = enderecoPublico();
  const resposta = await enviar({
    canal: "email",
    destino: vendedor.email,
    titulo: `Sua análise: ${resultado.titulo}`,
    texto: anotacaoDaConversa(resultado.titulo, resultado.saida),
    link: base ? `${base}/r/${resultadoId}` : undefined,
  });
  if (!resposta.ok) throw new ErroEnvioAnalise(resposta.mensagem, 502, ACAO_NOTIFICACOES);
  return { mensagem: `Análise enviada para ${vendedor.email}.` };
}
