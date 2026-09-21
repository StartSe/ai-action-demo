// Planilhas: lista (garantindo as de exemplo) e envio por multipart (CSV ou JSON, até 20 MB).
import { api, AppError } from "@/lib/api";
import { criarPlanilha, LIMITE_BYTES } from "@/lib/planilhas";
import { garantirExemplo } from "@/lib/exemplo";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => ({ planilhas: await garantirExemplo() }));
}
export async function POST(req: Request) {
  return api(async () => {
    const form = await req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) throw new AppError("Envie um arquivo CSV ou JSON.");
    if (arquivo.size > LIMITE_BYTES) throw new AppError("O arquivo passa de 20 MB. Envie um recorte menor.", 413);
    const nome = arquivo.name || "planilha";
    const ext = nome.toLowerCase().split(".").pop();
    const formato = ext === "json" ? "json" : ext === "csv" || ext === "txt" || ext === "tsv" ? "csv" : null;
    if (!formato) throw new AppError(ext === "xlsx" || ext === "xls" ? "Planilhas do Excel chegam na próxima versão. Exporte como CSV (Arquivo › Salvar como › CSV UTF-8)." : "Formato não reconhecido. Envie CSV ou JSON.");
    const texto = Buffer.from(await arquivo.arrayBuffer()).toString("utf8");
    return { planilha: await criarPlanilha({ nome: nome.replace(/\.[^.]+$/, ""), texto, formato }) };
  });
}
