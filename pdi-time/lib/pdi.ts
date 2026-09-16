// Lógica de geração do PDI, compartilhada entre a rota HTTP (app/api/pdi/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { erroDeGeracao, registrarFalha, registrarResultado } from "./autoavaliacoes";
import { esperar, pdiDemo } from "./demo";
import { criar, registrarCallback, type CampoFormulario, type ParametrosPublicos } from "./formularios";
import { salvar, SENSIVEL } from "./historico";
import { avisarLider } from "./notificacoes-do-app";
import { enderecoPublico } from "./setup-comum";
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
  "conversa_sugerida": ["pergunta para a conversa de feedback"],
  "mensagem_pessoa": "2 a 3 frases dirigidas diretamente ao profissional (você/seu), em tom de apoio, resumindo o momento dele e o salto esperado, em no máximo 50 palavras"
}`;

/** Quando o app é sensível, só salva com opt-in explícito e por 30 dias; pdi-time não é sensível, então sempre salva sem prazo. */
function idSalvo({ nome, dados, saida, metaGerada, guardar }: { nome: string; dados: DadosPDI; saida: PDI; metaGerada: Meta; guardar?: boolean }) {
  if (SENSIVEL && !guardar) return undefined;
  return salvar({ tipo: "pdi", titulo: `PDI de ${nome}`, resumo: saida.resumo, entrada: dados, saida, meta: metaGerada, expiraEmDias: SENSIVEL ? 30 : undefined });
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

const CAMPOS_AUTOAVALIACAO: CampoFormulario[] = [
  { chave: "nome", rotulo: "Seu nome", tipo: "texto", obrigatorio: true },
  { chave: "cargo", rotulo: "Seu cargo", tipo: "texto", obrigatorio: true },
  { chave: "tempo", rotulo: "Há quanto tempo você está nessa função", tipo: "texto", obrigatorio: true },
  { chave: "entregas", rotulo: "Suas entregas e atividades recentes", tipo: "textarea", obrigatorio: true },
  { chave: "aspiracoes", rotulo: "Suas aspirações de carreira", tipo: "textarea" },
];

/** Parâmetros próprios do link de autoavaliação: os objetivos da empresa, informados pelo líder ao criar o link. */
export type ParametrosAutoavaliacao = ParametrosPublicos & { objetivosEmpresa: string };

/** Cria o link público (/f/<código>) que o colaborador preenche para gerar o próprio PDI. */
export function criarLinkAutoavaliacao(objetivosEmpresa: string, expiraEmDias: number): string {
  const parametros: ParametrosAutoavaliacao = {
    marca: "P",
    nome: "PDI do Time",
    titulo: "Sua autoavaliação para o PDI",
    descricao: "Suas respostas viram a base do seu Plano de Desenvolvimento Individual (PDI). Leva menos de 5 minutos.",
    objetivosEmpresa,
  };
  return criar({ tipo: "autoavaliacao", campos: CAMPOS_AUTOAVALIACAO, parametros, expiraEmDias, limite: 1 });
}

/** Monta a entrada do PDI a partir das respostas do formulário (os objetivos vêm do líder, não da pessoa). Usada no
 * callback do link e em "Gerar PDI agora" (app/api/pdi/autoavaliacao/[id]/gerar), para as duas gerarem o mesmo PDI. */
export function dadosDaAutoavaliacao(dados: Record<string, string>, objetivosEmpresa: string): DadosPDI {
  return { nome: dados.nome, cargo: dados.cargo, tempo: dados.tempo, entregas: dados.entregas, objetivos: objetivosEmpresa, aspiracoes: dados.aspiracoes };
}

// A pessoa que respondeu não pode ficar esperando o aviso ao líder: o envio roda em segundo plano e qualquer
// falha dele fica só no console (avisarLider já traduz o motivo; aqui é só a rede de segurança).
function avisarEmSegundoPlano(aviso: { titulo: string; texto: string; link?: string }) {
  avisarLider(aviso).catch((err) => console.error("Aviso ao líder falhou:", err));
}

registrarCallback("autoavaliacao", async ({ token, dados, parametros }) => {
  const { objetivosEmpresa } = parametros as ParametrosAutoavaliacao;
  const base = enderecoPublico();
  try {
    const resultado = await gerarPDI(dadosDaAutoavaliacao(dados, objetivosEmpresa), { guardar: true });
    if (resultado.id) registrarResultado(token, resultado.id);
    avisarEmSegundoPlano({
      titulo: `Autoavaliação de ${dados.nome} recebida`,
      texto: `Recebemos a autoavaliação de ${dados.nome} e o PDI já está pronto para a conversa de feedback.`,
      link: base && resultado.id ? `${base}/r/${resultado.id}` : undefined,
    });
    return { resultadoId: resultado.id };
  } catch (err) {
    // A resposta da pessoa é gravada mesmo assim (app/api/f/[token]/route.ts); o motivo fica visível no painel,
    // com o botão "Gerar PDI agora", e o líder é avisado para não descobrir só quando abrir o app.
    const erro = erroDeGeracao(err);
    registrarFalha(token, erro);
    avisarEmSegundoPlano({
      titulo: `Autoavaliação de ${dados.nome} recebida, mas o PDI não foi gerado`,
      texto: `Recebemos a autoavaliação de ${dados.nome}, mas a IA falhou: ${erro.mensagem} Abra o app e use "Gerar PDI agora" em "Autoavaliações recebidas".`,
      link: base,
    });
    return {};
  }
});
