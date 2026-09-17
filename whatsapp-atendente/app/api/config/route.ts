import { getConfig, setConfig, temConfigSalva } from "@/lib/estado";
import type { Config } from "@/lib/types";

export const dynamic = "force-dynamic";

const OBJETIVOS: Config["objetivo"][] = ["atendimento", "vendas", "agendamentos", "outro"];
const TONS: Config["tom"][] = ["profissional", "amigavel", "personalizado"];
const NAO_SEI: Config["naoSei"][] = ["humano", "contato", "site"];

// `salvo` acompanha a configuração (e não substitui nada dela): as telas que só mostram os dados
// continuam recebendo a empresa de exemplo quando ninguém configurou, e só o Assistente usa o campo
// para abrir com o modelo da base no lugar do exemplo.
export async function GET() {
  return Response.json({ ...getConfig(), salvo: temConfigSalva() });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Config>;
  const { negocio, atendente, objetivo, objetivoTexto, tom, tomTexto, horario, baseConhecimento, naoSei } = body;
  if (!negocio || !String(negocio).trim() || !atendente || !String(atendente).trim() || !baseConhecimento || !String(baseConhecimento).trim()) {
    return Response.json({ error: "Preencha ao menos o nome do negócio, o nome do atendente e a base de conhecimento." }, { status: 400 });
  }
  // Objetivo e tom ausentes valem como o padrão (configuração antiga ou tela que ainda não pergunta);
  // um valor que não está na lista é erro, para nunca salvar em silêncio algo que a IA não entende.
  if (objetivo !== undefined && !OBJETIVOS.includes(objetivo)) {
    return Response.json({ error: "Escolha o que o atendente deve fazer: atendimento, vendas, agendamentos ou outro." }, { status: 400 });
  }
  if (tom !== undefined && !TONS.includes(tom)) {
    return Response.json({ error: "Escolha o tom de resposta: profissional, amigável ou personalizado." }, { status: 400 });
  }
  if (objetivo === "outro" && !String(objetivoTexto || "").trim()) {
    return Response.json({ error: "Escreva em uma linha o que o atendente deve fazer." }, { status: 400 });
  }
  const objetivoEscolhido = objetivo ?? "atendimento";
  const tomEscolhido = tom ?? "profissional";
  const textoTom = String(tomTexto || "").trim();
  const novo: Config = {
    negocio: String(negocio).trim(),
    atendente: String(atendente).trim(),
    objetivo: objetivoEscolhido,
    ...(objetivoEscolhido === "outro" ? { objetivoTexto: String(objetivoTexto).trim() } : {}),
    tom: tomEscolhido,
    ...(tomEscolhido === "personalizado" && textoTom ? { tomTexto: textoTom } : {}),
    horario: String(horario || "").trim(),
    baseConhecimento: String(baseConhecimento).trim(),
    naoSei: NAO_SEI.includes(naoSei as Config["naoSei"]) ? (naoSei as Config["naoSei"]) : "humano",
  };
  return Response.json(setConfig(novo));
}
