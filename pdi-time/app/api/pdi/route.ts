import { aiEnabled, askJSON, meta } from "@/lib/ai";
import { esperar, pdiDemo } from "@/lib/demo";
import { apagarTodos, listar, salvar, SENSIVEL } from "@/lib/historico";
import type { DadosPDI, PDI } from "@/lib/types";

const SYSTEM = `Você é um especialista em desenvolvimento de pessoas que apoia líderes de empresas brasileiras.
Sua tarefa é montar um PDI (Plano de Desenvolvimento Individual) prático e honesto para um profissional, a partir das entregas recentes dele e dos objetivos da empresa.
Regras:
- Escreva em português do Brasil, direto, sem jargão de RH.
- Conecte cada objetivo do PDI a um objetivo da empresa.
- Ações devem ser concretas e verificáveis, distribuídas em 30, 60 e 90 dias.
- Máximo de 3 pontos fortes, 3 lacunas, 3 objetivos e 3 recursos.
- O resumo tem no máximo 45 palavras.
Formato de saída (JSON):
{
  "resumo": "2 a 3 frases sobre o momento do profissional e o salto esperado, em no máximo 45 palavras",
  "pontos_fortes": [{"titulo": "", "evidencia": ""}],
  "lacunas": [{"competencia": "", "impacto": "", "prioridade": "alta|média|baixa"}],
  "objetivos": [{"titulo": "", "resultado_esperado": "", "indicador": "", "acoes": [{"prazo": "30 dias", "acao": ""}, {"prazo": "60 dias", "acao": ""}, {"prazo": "90 dias", "acao": ""}]}],
  "recursos": [{"tipo": "Mentoria|Curso|Leitura|Projeto|Outro", "nome": "", "motivo": ""}],
  "conversa_sugerida": ["pergunta para a conversa de feedback"]
}`;

/** Quando o app é sensível, só salva com opt-in explícito e por 30 dias; pdi-time não é sensível, então sempre salva sem prazo. */
function idSalvo({ nome, dados, saida, metaGerada, guardar }: { nome: string; dados: DadosPDI; saida: PDI; metaGerada: ReturnType<typeof meta>; guardar?: boolean }) {
  if (SENSIVEL && !guardar) return undefined;
  return salvar({ tipo: "pdi", titulo: `PDI de ${nome}`, entrada: dados, saida, meta: metaGerada, expiraEmDias: SENSIVEL ? 30 : undefined });
}

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as Partial<DadosPDI> & { guardar?: boolean };
  const { nome, cargo, tempo, entregas, objetivos, aspiracoes, guardar } = corpo;
  if (!nome || !cargo || !entregas || !objetivos) {
    return Response.json({ error: "Preencha nome, cargo, entregas recentes e objetivos da empresa." }, { status: 400 });
  }
  const dados: DadosPDI = { nome, cargo, tempo: tempo || "", entregas, objetivos, aspiracoes };
  try {
    const insumo = "entregas recentes e objetivos da empresa";
    if (!aiEnabled()) {
      await esperar(1200);
      const pdiGerado = pdiDemo({ nome, cargo });
      const metaGerada = meta({ demo: true, insumo });
      const id = idSalvo({ nome, dados, saida: pdiGerado, metaGerada, guardar });
      return Response.json({ demo: true, pdi: pdiGerado, meta: metaGerada, id });
    }
    const prompt = `Profissional: ${nome}\nCargo: ${cargo}\nTempo na função: ${tempo || "não informado"}\n\nEntregas e atividades recentes:\n${entregas}\n\nObjetivos da empresa para o período:\n${objetivos}\n\nAspirações declaradas pelo profissional:\n${aspiracoes || "não informadas"}`;
    const pdi = await askJSON<PDI>({ system: SYSTEM, prompt });
    const metaGerada = meta({ demo: false, insumo });
    const id = idSalvo({ nome, dados, saida: pdi, metaGerada, guardar });
    return Response.json({ demo: false, pdi, meta: metaGerada, id });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar o PDI agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

/** Últimos resultados salvos, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
