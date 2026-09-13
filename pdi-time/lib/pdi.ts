// Lógica de geração do PDI, compartilhada entre a rota HTTP (app/api/pdi/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar, pdiDemo } from "./demo";
import { salvar, SENSIVEL } from "./historico";
import type { DadosPDI, PDI } from "./types";

export const SYSTEM_PDI = `Você é um especialista em desenvolvimento de pessoas que apoia líderes de empresas brasileiras.
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
function idSalvo({ nome, dados, saida, metaGerada, guardar }: { nome: string; dados: DadosPDI; saida: PDI; metaGerada: Meta; guardar?: boolean }) {
  if (SENSIVEL && !guardar) return undefined;
  return salvar({ tipo: "pdi", titulo: `PDI de ${nome}`, entrada: dados, saida, meta: metaGerada, expiraEmDias: SENSIVEL ? 30 : undefined });
}

export async function gerarPDI(dados: DadosPDI, opts: { guardar?: boolean } = {}): Promise<{ demo: boolean; pdi: PDI; meta: Meta; id?: string }> {
  const insumo = "entregas recentes e objetivos da empresa";
  if (!aiEnabled()) {
    await esperar(1200);
    const pdiGerado = pdiDemo({ nome: dados.nome, cargo: dados.cargo });
    const metaGerada = meta({ demo: true, insumo });
    const id = idSalvo({ nome: dados.nome, dados, saida: pdiGerado, metaGerada, guardar: opts.guardar });
    return { demo: true, pdi: pdiGerado, meta: metaGerada, id };
  }
  const prompt = `Profissional: ${dados.nome}\nCargo: ${dados.cargo}\nTempo na função: ${dados.tempo || "não informado"}\n\nEntregas e atividades recentes:\n${dados.entregas}\n\nObjetivos da empresa para o período:\n${dados.objetivos}\n\nAspirações declaradas pelo profissional:\n${dados.aspiracoes || "não informadas"}`;
  const pdi = await askJSON<PDI>({ system: SYSTEM_PDI, prompt });
  const metaGerada = meta({ demo: false, insumo });
  const id = idSalvo({ nome: dados.nome, dados, saida: pdi, metaGerada, guardar: opts.guardar });
  return { demo: false, pdi, meta: metaGerada, id };
}
