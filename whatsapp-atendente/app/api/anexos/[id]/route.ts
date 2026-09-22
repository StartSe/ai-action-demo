// O arquivo que o cliente mandou no WhatsApp (áudio, foto, vídeo, documento, figurinha), servido pelo
// próprio app a partir da cópia guardada no disco (lib/anexos.ts).
//
// Privada como todas as rotas do painel: o áudio e a foto de um cliente não podem ser alcançáveis por
// quem tenha só o endereço. `Content-Disposition: inline` abre no navegador em vez de baixar — quem
// quiser o arquivo continua podendo salvar de lá.
//
// Sem cópia local (o download falhou, ou é uma conversa de exemplo, que aponta para public/exemplos),
// a resposta leva o navegador ao endereço original: é melhor mostrar o anexo enquanto o link do
// provedor durar do que mostrar uma bolha quebrada.
import fs from "node:fs";
import { obter } from "@/lib/anexos";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const anexo = obter(id);
  if (!anexo) return Response.json({ error: "Esse anexo não está mais aqui." }, { status: 404 });

  if (!anexo.caminhoLocal || !fs.existsSync(anexo.caminhoLocal)) {
    if (!anexo.urlOriginal) return Response.json({ error: "Esse anexo não tem arquivo para abrir." }, { status: 404 });
    return new Response(null, { status: 302, headers: { Location: anexo.urlOriginal, "Cache-Control": "private, no-store" } });
  }

  const dados = fs.readFileSync(anexo.caminhoLocal);
  const cabecalhos: Record<string, string> = {
    "Content-Type": anexo.mime || "application/octet-stream",
    // O nome entre aspas, com as aspas internas trocadas: um arquivo chamado `nota "2".pdf` não pode
    // quebrar o cabeçalho.
    "Content-Disposition": `inline; filename="${(anexo.nomeArquivo || id).replace(/"/g, "'")}"`,
    // O conteúdo de um anexo nunca muda, e a rota é privada: guardar por um dia no navegador evita
    // baixar a mesma foto a cada vez que a conversa é aberta.
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };

  // Alguns navegadores só tocam áudio quando o servidor sabe entregar um pedaço do arquivo.
  const pedaco = lerPedaco(req.headers.get("range"), dados.length);
  if (pedaco) {
    const { inicio, fim } = pedaco;
    return new Response(new Uint8Array(dados.subarray(inicio, fim + 1)), {
      status: 206,
      headers: { ...cabecalhos, "Content-Range": `bytes ${inicio}-${fim}/${dados.length}` },
    });
  }
  return new Response(new Uint8Array(dados), { headers: cabecalhos });
}

/** O pedaço pedido pelo navegador ("bytes=0-1023"); null quando ele quer o arquivo inteiro. */
function lerPedaco(range: string | null, tamanho: number): { inicio: number; fim: number } | null {
  const casou = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (!casou) return null;
  const inicio = casou[1] ? Number(casou[1]) : 0;
  const fim = casou[2] ? Math.min(Number(casou[2]), tamanho - 1) : tamanho - 1;
  if (Number.isNaN(inicio) || Number.isNaN(fim) || inicio > fim || inicio >= tamanho) return null;
  return { inicio, fim };
}
