import { api, AppError, formDataLimitado } from "@/lib/api";
import { criarPlanilha, LIMITE_BYTES, salvarPlanilha } from "@/lib/planilhas";
import { garantirExemplo } from "@/lib/exemplo";
import { lerXlsx } from "@/lib/xlsx";
export const dynamic = "force-dynamic";
export async function GET() { return api(async () => ({ planilhas: await garantirExemplo() })); }
export async function POST(req: Request) {
  return api(async () => {
    if (Number(req.headers.get("content-length")) > LIMITE_BYTES + 65536) throw new AppError("O arquivo passa de 20 MB. Envie um recorte menor.", 413);
    const form = await formDataLimitado(req, LIMITE_BYTES + 65536, "O arquivo passa de 20 MB. Envie um recorte menor.");
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) throw new AppError("Envie um arquivo XLSX ou CSV.");
    if (arquivo.size > LIMITE_BYTES) throw new AppError("O arquivo passa de 20 MB. Envie um recorte menor.", 413);
    const nome = arquivo.name || "planilha";
    const ext = nome.toLowerCase().split(".").pop();
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    if (ext === "xlsx") {
      const aba = typeof form?.get("aba") === "string" ? String(form.get("aba")) : undefined;
      const xlsx = await lerXlsx(buffer, aba);
      if (xlsx.texto === undefined) return { abas: xlsx.abas };
      const p = await criarPlanilha({ nome: `${nome.replace(/\.[^.]+$/, "")} · ${aba}`, texto: xlsx.texto, formato: "csv", classificar: false });
      return { planilha: salvarPlanilha({ ...p, arquivoOrigem: nome, abaOrigem: aba, tamanhoBytes: arquivo.size }) };
    }
    const formato = ext === "json" ? "json" : ["csv", "txt", "tsv"].includes(ext || "") ? "csv" : null;
    if (!formato) throw new AppError("Formato não reconhecido. Envie XLSX ou CSV; para XLS, salve como XLSX no Excel.");
    return { planilha: await criarPlanilha({ nome: nome.replace(/\.[^.]+$/, ""), texto: buffer.toString("utf8"), formato, classificar: false }) };
  });
}
