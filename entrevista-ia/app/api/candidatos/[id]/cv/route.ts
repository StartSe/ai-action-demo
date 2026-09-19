// O arquivo original do currículo, para o gestor abrir (US-008).
//
// Privada, como toda rota do painel: o currículo é o documento de uma pessoa, e não pode ser
// alcançável por quem tenha só o endereço. `Content-Disposition: inline` abre no navegador em vez de
// baixar — quem quer o arquivo continua podendo salvar de lá.
import { obter, obterCvArquivo } from "@/lib/candidatos";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  const arquivo = obterCvArquivo(id);
  if (!arquivo) return Response.json({ error: "Este candidato não tem currículo enviado." }, { status: 404 });

  return new Response(new Uint8Array(arquivo.dados), {
    headers: {
      "Content-Type": arquivo.tipo,
      // O nome entre aspas, com as aspas internas escapadas: um currículo chamado `João "Jô".pdf`
      // não pode quebrar o cabeçalho.
      "Content-Disposition": `inline; filename="${arquivo.nome.replace(/"/g, "'")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
