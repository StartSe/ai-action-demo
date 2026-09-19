// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho (ver padrão em app/api/f/[token]/route.ts com lib/analise.ts).
import { aiEnabled } from "./ai";
import { numero } from "./formato";
import { gerarPainelEquipe } from "./painel-equipe";
import { gerarPainelSimulacao } from "./painel-simulacao";
import { resumoDeTreinos } from "./resumo-treinos";
import { registrarExecutor, type Rotina } from "./rotinas";
import { listar as listarParticipantes } from "./participantes";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [
  { tipo: "resumo-simulador-vendas", rotulo: "Resumo dos treinos do time" },
  { tipo: "resumo-equipe", rotulo: "Resumo semanal da equipe" },
];

/** Quantos nomes cabem na frase de "quem treinou" antes de ela virar uma lista que ninguém lê. */
const NOMES_NA_FRASE = 5;

/**
 * "Resumo dos treinos do time" (US-029): o que aconteceu nos links do gestor desde a última execução.
 *
 * Antes desta história a rotina resumia as **conversas reais coladas** no painel, que é o caminho
 * antigo do app (e continua existindo, em `/equipe/analisar`). O que o gestor precisa saber sem abrir
 * a tela, porém, é do treino: quem praticou, quanto o time tirou e onde ele travou — o mesmo trio que
 * ele iria procurar no painel. A conversa real colada segue coberta pelo "Resumo semanal da equipe".
 *
 * O painel do treino que mais rodou no período é gravado no histórico e vira o destino da notificação:
 * a mensagem cabe em três linhas, e quem quiser o detalhe clica e encontra os números daquele momento,
 * não os de quando abriu o link.
 */
registrarExecutor("resumo-simulador-vendas", async (rotina: Rotina) => {
  const desde = rotina.ultimaExecucao ?? new Date(0).toISOString();
  const resumo = resumoDeTreinos(desde);
  const titulo = "Resumo dos treinos do time";

  if (resumo.sessoes === 0) {
    return { titulo, texto: "Ninguém treinou desde a última rotina.", enviar: false };
  }

  // O painel é gravado antes do texto porque a notificação precisa de um destino; sem treino no
  // período (impossível aqui, já que houve sessão) ou com o treino apagado no meio, segue sem link.
  const foto = resumo.treinoMaisMovimentado ? gerarPainelSimulacao(resumo.treinoMaisMovimentado.codigo) : null;

  const partes = [
    `${resumo.sessoes} conversa${resumo.sessoes > 1 ? "s" : ""} de ${resumo.participantes} pessoa${resumo.participantes > 1 ? "s" : ""} desde a última rotina.`,
  ];
  partes.push(
    resumo.notaMedia === null
      ? "Nenhuma delas tinha avaliação pronta na hora deste resumo."
      : `Nota média do time: ${numero(resumo.notaMedia, 1)} em ${resumo.avaliadas} conversa${resumo.avaliadas > 1 ? "s" : ""} avaliada${resumo.avaliadas > 1 ? "s" : ""}.`,
  );

  const nomes = resumo.quemTreinou.slice(0, NOMES_NA_FRASE).map((q) => `${q.nome} (${q.sessoes})`);
  const sobrando = resumo.quemTreinou.length - nomes.length;
  partes.push(`Quem treinou: ${nomes.join(", ")}${sobrando > 0 ? ` e mais ${sobrando}` : ""}.`);

  if (resumo.dificuldade) partes.push(`Maior dificuldade do time: ${resumo.dificuldade.nome} (${numero(resumo.dificuldade.nota, 1)}).`);
  if (resumo.treinoMaisMovimentado) partes.push(`Treino mais praticado: ${resumo.treinoMaisMovimentado.nome}.`);

  return { titulo, texto: partes.join(" "), resultadoId: foto?.id };
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
