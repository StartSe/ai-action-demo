// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho (ver padrão em app/api/f/[token]/route.ts com lib/analise.ts).
import { aiEnabled } from "./ai";
import { numero } from "./formato";
import { listar as listarHistorico } from "./historico";
import { gerarPainelEquipe } from "./painel-equipe";
import { registrarExecutor, type Rotina } from "./rotinas";
import { listar as listarParticipantes } from "./participantes";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [
  { tipo: "resumo-simulador-vendas", rotulo: "Resumo das conversas analisadas" },
  { tipo: "resumo-equipe", rotulo: "Resumo semanal da equipe" },
];

registrarExecutor("resumo-simulador-vendas", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ? new Date(rotina.ultimaExecucao) : new Date(0);
  const recentes = listarHistorico(50).filter((r) => r.tipo === "conversa" && new Date(r.criadoEm) > desde);
  const titulo = "Resumo do Simulador de Vendas";
  if (recentes.length === 0) return { titulo, texto: "Nenhuma conversa nova foi analisada desde a última rotina.", enviar: false };
  const texto = `${recentes.length} conversa${recentes.length > 1 ? "s" : ""} analisada${recentes.length > 1 ? "s" : ""} desde a última rotina: ${recentes.map((r) => r.titulo).join(", ")}.`;
  return { titulo, texto, resultadoId: recentes[0].id };
});

/** Números fixos usados só em modo demonstração (sem OpenRouter configurado), para o resumo semanal nunca
 * chegar vazio numa instalação nova sem histórico de verdade acumulado — mesmo espírito de "em demo entrega
 * X rotulado" já usado em radar-semanal (radar-sinais) e leads-semanais (prospeccao-ia). */
const RESUMO_EQUIPE_DEMO =
  "Exemplo (conecte o OpenRouter para números reais): 8 conversas analisadas na semana, nota média da equipe 7,2 (subiu 0,6 sobre a semana anterior). " +
  "Quem mais evoluiu: Ana Beatriz (+1,4). Quem não treinou esta semana: Carlos Souza. Critério mais fraco da equipe: Tratamento de objeções (5,8).";

registrarExecutor("resumo-equipe", async () => {
  const titulo = "Resumo semanal da equipe de vendas";
  const { painel, id } = gerarPainelEquipe(7);

  if (!aiEnabled()) return { titulo, texto: RESUMO_EQUIPE_DEMO, resultadoId: id };

  const conversasSemana = painel.vendedores.reduce((soma, v) => soma + v.conversas, 0);
  if (conversasSemana === 0) return { titulo, texto: "Nenhuma conversa foi analisada esta semana.", resultadoId: id, enviar: false };

  const maisEvoluiu = [...painel.vendedores].filter((v) => v.variacao !== null && v.variacao > 0).sort((a, b) => (b.variacao as number) - (a.variacao as number))[0];
  const idsComConversa = new Set(painel.vendedores.map((v) => v.vendedorId));
  const naoTreinaram = listarParticipantes(500).filter((v) => !idsComConversa.has(v.id));
  const criterioMaisFraco = painel.criteriosFracos[0];

  const partes = [
    `${conversasSemana} conversa${conversasSemana > 1 ? "s" : ""} analisada${conversasSemana > 1 ? "s" : ""} esta semana, nota média da equipe ${numero(painel.notaMedia, 1)}.`,
  ];
  partes.push(maisEvoluiu ? `Quem mais evoluiu: ${maisEvoluiu.nome} (+${numero(maisEvoluiu.variacao as number, 1)}).` : "Ninguém evoluiu de forma clara esta semana.");
  partes.push(naoTreinaram.length > 0 ? `Quem não treinou esta semana: ${naoTreinaram.map((v) => v.nome).join(", ")}.` : "Toda a equipe treinou esta semana.");
  if (criterioMaisFraco) partes.push(`Critério mais fraco da equipe: ${criterioMaisFraco.nome} (${numero(criterioMaisFraco.notaMedia, 1)}).`);

  return { titulo, texto: partes.join(" "), resultadoId: id };
});
