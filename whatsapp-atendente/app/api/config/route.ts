import { getConfig, setConfig } from "@/lib/estado";
import type { Config } from "@/lib/types";

export const dynamic = "force-dynamic";

const TONS: Config["tom"][] = ["cordial", "direto", "descontraido"];
const NAO_SEI: Config["naoSei"][] = ["humano", "contato", "site"];

export async function GET() {
  return Response.json(getConfig());
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Config>;
  const { negocio, atendente, tom, horario, baseConhecimento, naoSei } = body;
  if (!negocio || !String(negocio).trim() || !atendente || !String(atendente).trim() || !baseConhecimento || !String(baseConhecimento).trim()) {
    return Response.json({ error: "Preencha ao menos o nome do negócio, o nome do atendente e a base de conhecimento." }, { status: 400 });
  }
  const novo: Config = {
    negocio: String(negocio).trim(),
    atendente: String(atendente).trim(),
    tom: TONS.includes(tom as Config["tom"]) ? (tom as Config["tom"]) : "cordial",
    horario: String(horario || "").trim(),
    baseConhecimento: String(baseConhecimento).trim(),
    naoSei: NAO_SEI.includes(naoSei as Config["naoSei"]) ? (naoSei as Config["naoSei"]) : "humano",
  };
  return Response.json(setConfig(novo));
}
