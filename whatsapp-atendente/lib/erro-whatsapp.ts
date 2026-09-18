// Erro de negócio da conexão com o número da empresa, compartilhado pelos dois provedores (z-api e
// Meta). Mora num arquivo só dele porque lib/whatsapp.ts (o despachante) importa lib/zapi.ts, e
// lib/zapi.ts precisa da mesma classe — um import de volta fecharia um ciclo entre os dois módulos.
//
// Regra da suíte (ver ../progress.txt): nenhuma mensagem exibida pode conter código de resposta cru
// nem o corpo devolvido pelo provedor — o detalhe técnico vai só para console.error, e a frase que
// chega à tela sempre diz o que fazer e para onde ir.

export const ACAO_NUMERO = { rotulo: "Revisar a conexão do número", url: "/setup#whatsapp" };

export type CodigoErroWhatsApp =
  | "sem_numero"
  | "autorizacao"
  | "numero_nao_verificado"
  | "destino_nao_liberado"
  | "janela_24h"
  | "limite"
  | "servico"
  | "rede"
  // Códigos próprios da z-api: as três credenciais da instância não foram aceitas, e a instância
  // existe mas ainda não tem um número conectado (QR Code não lido, ou sessão caída).
  | "credenciais"
  | "sem_sessao";

/** Mesmo formato de ErroIA (lib/ai.ts): mensagem curada, código e ação para o cartão certo de Configurações. */
export class ErroWhatsApp extends Error {
  codigo: CodigoErroWhatsApp;
  status: number;
  acao: { rotulo: string; url: string };

  constructor(codigo: CodigoErroWhatsApp, mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroWhatsApp";
    this.codigo = codigo;
    this.status = status;
    this.acao = ACAO_NUMERO;
  }
}
