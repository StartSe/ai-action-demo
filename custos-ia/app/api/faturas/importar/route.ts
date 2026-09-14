// Importação das notas do Gmail (US-021): percorre as mensagens do período com jeito de cobrança
// (lib/email.ts), passa anexos PDF e corpo por lib/leitor.ts e grava as faturas reconhecidas direto em
// lib/faturas.ts com origem "email" e referencia = id da mensagem. O corpo do e-mail nunca é gravado:
// só a Fatura (fornecedor, ferramenta, valor, data...) entra no banco. Devolve quantas mensagens foram
// lidas, quantas viraram fatura e quantas foram ignoradas, com os motivos agrupados.
import { aiEnabled } from "@/lib/ai";
import { ErroGmail, gmailConectado, listarMensagens, obterMensagem, type Mensagem } from "@/lib/email";
import { existeReferencia, salvar } from "@/lib/faturas";
import { lerDocumento, MINIMO_TEXTO, pareceCobranca, textoDoPdf } from "@/lib/leitor";
import type { Fatura, ResultadoImportacao } from "@/lib/types";

export const dynamic = "force-dynamic";

const DIAS_PERMITIDOS = [30, 90, 365];
/** Cada mensagem custa ao menos uma chamada ao modelo: acima disso a importação vira uma rotina, não um clique. */
const MAXIMO_MENSAGENS = 200;

type Motivo = "Já importada antes" | "Sem sinal de cobrança" | "Não é cobrança de ferramenta de IA" | "Não foi possível ler a mensagem";

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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { dias?: unknown };
  const dias = Number(body.dias);
  if (!DIAS_PERMITIDOS.includes(dias)) return Response.json({ error: "Informe o período em dias: 30, 90 ou 365." }, { status: 400 });
  if (!gmailConectado()) return Response.json({ error: "Conecte o Gmail na configuração inicial antes de ler as notas do e-mail." }, { status: 400 });
  if (!aiEnabled()) {
    // Sem IA, lib/leitor.ts devolve faturas de exemplo — que aqui iriam direto para o banco como se fossem
    // reais. Melhor recusar do que gravar dado fictício em cima de e-mails de verdade.
    return Response.json({ error: "Para ler as notas do e-mail, conecte a inteligência artificial na configuração inicial: é ela que reconhece fornecedor, valor e data." }, { status: 400 });
  }

  try {
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
    const resultado: ResultadoImportacao = {
      dias,
      lidas: mensagens.length,
      reconhecidas: faturas.length,
      ignoradas: mensagens.length - faturas.length,
      faturas,
      motivos,
      truncado,
    };
    return Response.json(resultado);
  } catch (err) {
    console.error("Falha na importação do Gmail", err);
    if (err instanceof ErroGmail) return Response.json({ error: err.message }, { status: 502 });
    return Response.json({ error: err instanceof Error ? err.message : "Falha inesperada ao ler o e-mail." }, { status: 500 });
  }
}
