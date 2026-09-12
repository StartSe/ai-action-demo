import { aiEnabled, askJSON } from "@/lib/ai";
import { esperar, pdiDemo } from "@/lib/demo";
import type { DadosPDI, PDI } from "@/lib/types";

const SYSTEM = `Você é um especialista em desenvolvimento de pessoas que apoia líderes de empresas brasileiras.
Sua tarefa é montar um PDI (Plano de Desenvolvimento Individual) prático e honesto para um profissional, a partir das entregas recentes dele e dos objetivos da empresa.
Regras:
- Escreva em português do Brasil, direto, sem jargão de RH.
- Conecte cada objetivo do PDI a um objetivo da empresa.
- Ações devem ser concretas e verificáveis, distribuídas em 30, 60 e 90 dias.
- Máximo de 3 pontos fortes, 3 lacunas, 3 objetivos e 3 recursos.
Formato de saída (JSON):
{
  "resumo": "2 a 3 frases sobre o momento do profissional e o salto esperado",
  "pontos_fortes": [{"titulo": "", "evidencia": ""}],
  "lacunas": [{"competencia": "", "impacto": "", "prioridade": "alta|média|baixa"}],
  "objetivos": [{"titulo": "", "resultado_esperado": "", "indicador": "", "acoes": [{"prazo": "30 dias", "acao": ""}, {"prazo": "60 dias", "acao": ""}, {"prazo": "90 dias", "acao": ""}]}],
  "recursos": [{"tipo": "Mentoria|Curso|Leitura|Projeto|Outro", "nome": "", "motivo": ""}],
  "conversa_sugerida": ["pergunta para a conversa de feedback"]
}`;

export async function POST(req: Request) {
  const dados = (await req.json().catch(() => ({}))) as Partial<DadosPDI>;
  const { nome, cargo, tempo, entregas, objetivos, aspiracoes } = dados;
  if (!nome || !cargo || !entregas || !objetivos) {
    return Response.json({ error: "Preencha nome, cargo, entregas recentes e objetivos da empresa." }, { status: 400 });
  }
  try {
    if (!aiEnabled()) {
      await esperar(1200);
      return Response.json({ demo: true, pdi: pdiDemo({ nome, cargo }) });
    }
    const prompt = `Profissional: ${nome}\nCargo: ${cargo}\nTempo na função: ${tempo || "não informado"}\n\nEntregas e atividades recentes:\n${entregas}\n\nObjetivos da empresa para o período:\n${objetivos}\n\nAspirações declaradas pelo profissional:\n${aspiracoes || "não informadas"}`;
    const pdi = await askJSON<PDI>({ system: SYSTEM, prompt });
    return Response.json({ demo: false, pdi });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar o PDI agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
