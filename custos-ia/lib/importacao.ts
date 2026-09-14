// Importação das notas do Gmail: percorre as mensagens do período com jeito de cobrança (lib/email.ts),
// passa anexos PDF e corpo por lib/leitor.ts e grava as faturas reconhecidas direto em lib/faturas.ts
// com origem "email" e referencia = id da mensagem. O corpo do e-mail nunca é gravado: só a Fatura
// (fornecedor, ferramenta, valor, data...) entra no banco. Uma lógica só, reaproveitada pelo clique
// "Ler as notas do e-mail" (app/api/faturas/importar), pela rotina de fechamento mensal
// (lib/rotinas-do-app.ts) e pela ferramenta MCP importar_notas (lib/ferramentas.ts).
import { aiEnabled } from "./ai";
import { ErroGmail, gmailConectado, listarMensagens, obterMensagem, type Mensagem } from "./email";
import { existeReferencia, salvar } from "./faturas";
import { lerDocumento, MINIMO_TEXTO, pareceCobranca, textoDoPdf } from "./leitor";
import type { Fatura, ResultadoImportacao } from "./types";

export const DIAS_PERMITIDOS = [30, 90, 365] as const;
export type DiasImportacao = (typeof DIAS_PERMITIDOS)[number];

/** Cada mensagem custa ao menos uma chamada ao modelo: acima disso a importação vira uma rotina, não um clique. */
const MAXIMO_MENSAGENS = 200;

/** Pré-condição não atendida (Gmail desconectado, IA desligada, período inválido): quem chama decide
 * como avisar (400 na rota, texto na notificação da rotina, erro na resposta MCP). */
export class ErroImportacao extends Error {}

type Motivo = "Já importada antes" | "Sem sinal de cobrança" | "Não é cobrança de ferramenta de IA" | "Não foi possível ler a mensagem";

export function diasValidos(dias: unknown): dias is DiasImportacao {
  return DIAS_PERMITIDOS.includes(Number(dias) as DiasImportacao);
}

/** Texto do e-mail para o leitor: assunto e remetente na frente ajudam o modelo a identificar o fornecedor. */
function textoDoCorpo(m: Mensagem): string {
  return [m.assunto ? `Assunto: ${m.assunto}` : "", m.remetente ? `De: ${m.remetente}` : "", m.data ? `Data: ${m.data}` : "", "", m.corpo || m.resumo].filter((l, i) => l || i === 3).join("\n").trim();
}

/** Tenta os anexos PDF primeiro (a nota costuma estar lá); só cai para o corpo quando nenhum PDF rende fatura. */
async function reconhecer(m: Mensagem): Promise<Fatura | null> {
  const base = { assunto: m.assunto, remetente: m.remetente, origem: "email" as const };
  for (const anexo of m.anexos) {
    let texto = "";
    try {
      texto = await textoDoPdf(anexo.bytes);
    } catch (err) {
      console.error(`Não foi possível abrir o PDF ${anexo.nome} da mensagem ${m.id}`, err);
      continue;
    }
    if (texto.length < MINIMO_TEXTO || !pareceCobranca(texto)) continue;
    const fatura = await lerDocumento({ ...base, texto, nomeArquivo: anexo.nome });
    if (fatura) return fatura;
  }
  const corpo = textoDoCorpo(m);
  if (corpo.length < MINIMO_TEXTO || !pareceCobranca(corpo)) return null;
  return lerDocumento({ ...base, texto: corpo });
}

/** Confere as pré-condições sem importar nada; lança ErroImportacao com a frase para a pessoa. */
export function conferirPreCondicoes(dias: unknown): DiasImportacao {
  if (!diasValidos(dias)) throw new ErroImportacao("Informe o período em dias: 30, 90 ou 365.");
  if (!gmailConectado()) throw new ErroImportacao("Conecte o Gmail na configuração inicial antes de ler as notas do e-mail.");
  if (!aiEnabled()) {
    // Sem IA, lib/leitor.ts devolve faturas de exemplo — que aqui iriam direto para o banco como se fossem
    // reais. Melhor recusar do que gravar dado fictício em cima de e-mails de verdade.
    throw new ErroImportacao("Para ler as notas do e-mail, conecte a inteligência artificial na configuração inicial: é ela que reconhece fornecedor, valor e data.");
  }
  return Number(dias) as DiasImportacao;
}

/** Lê as notas dos últimos `dias` no Gmail conectado e grava as reconhecidas. Lança ErroImportacao
 * (pré-condição) ou ErroGmail (falha na conversa com o Google); outros erros por mensagem só contam
 * como "Não foi possível ler a mensagem". */
export async function importarNotas(diasPedidos: unknown): Promise<ResultadoImportacao> {
  const dias = conferirPreCondicoes(diasPedidos);
  const { mensagens, truncado } = await listarMensagens({ dias, limite: MAXIMO_MENSAGENS });
  const faturas: Fatura[] = [];
  const contagem = new Map<Motivo, number>();
  const ignorar = (motivo: Motivo) => contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);

  // Sequencial de propósito: cada mensagem é uma chamada ao modelo (e os gratuitos limitam simultâneas).
  for (const { id } of mensagens) {
    if (existeReferencia("email", id)) {
      ignorar("Já importada antes");
      continue;
    }
    let mensagem: Mensagem;
    try {
      mensagem = await obterMensagem(id);
    } catch (err) {
      if (err instanceof ErroGmail) throw err;
      console.error(`Falha ao ler a mensagem ${id}`, err);
      ignorar("Não foi possível ler a mensagem");
      continue;
    }
    const temSinal = mensagem.anexos.length > 0 || pareceCobranca(`${mensagem.assunto}\n${mensagem.corpo || mensagem.resumo}`);
    if (!temSinal) {
      ignorar("Sem sinal de cobrança");
      continue;
    }
    let fatura: Fatura | null;
    try {
      fatura = await reconhecer(mensagem);
    } catch (err) {
      console.error(`Falha ao reconhecer a mensagem ${id}`, err);
      ignorar("Não foi possível ler a mensagem");
      continue;
    }
    if (!fatura) {
      ignorar("Não é cobrança de ferramenta de IA");
      continue;
    }
    const { id: _id, criadoEm: _criadoEm, ...dados } = fatura;
    void _id; void _criadoEm;
    // referencia = id da mensagem (nunca o assunto/corpo): permite pular este e-mail na próxima importação.
    faturas.push(salvar({ ...dados, origem: "email", referencia: id }));
  }

  const motivos = [...contagem.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
  return {
    dias,
    lidas: mensagens.length,
    reconhecidas: faturas.length,
    ignoradas: mensagens.length - faturas.length,
    faturas,
    motivos,
    truncado,
  };
}
