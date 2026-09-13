// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { meta } from "./ai";
import { analisarComentarios } from "./analise";
import { salvar } from "./historico";
import { comentariosDaJanela, contarNotasDaJanela, npsDaContagem, percentualDetratoresDaContagem } from "./pesquisas";
import { registrarExecutor, type Rotina } from "./rotinas";
import type { EntradaAnalise, SaidaAnalise } from "./types";

export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [
  { tipo: "analise-semanal", rotulo: "Análise semanal das respostas" },
  { tipo: "alerta-sentimento", rotulo: "Alerta quando o negativo subir" },
];

const LIMITE_PADRAO = 10;

function sinalDiferenca(diferenca: number): string {
  return diferenca >= 0 ? "+" : "";
}

registrarExecutor("analise-semanal", async () => {
  const titulo = "Análise semanal da Voz do Cliente";
  const { comentarios, total } = comentariosDaJanela(7, 0);
  if (!total) {
    return { titulo, texto: "Nenhuma resposta nova na pesquisa pública nos últimos 7 dias.", enviar: false };
  }

  const { demo, analise, totalEnviado, totalAnalisado } = await analisarComentarios({ comentarios, contexto: "" });

  // NPS e percentual de detratores nunca passam pela IA (mesmo princípio do Destaque): dá para comparar
  // as duas semanas com um cálculo determinístico, sem precisar rodar a análise duas vezes.
  const semanaAtual = contarNotasDaJanela(7, 0);
  const semanaAnterior = contarNotasDaJanela(14, 7);
  const npsAtual = npsDaContagem(semanaAtual);
  const npsAnterior = npsDaContagem(semanaAnterior);
  const negAtual = percentualDetratoresDaContagem(semanaAtual);
  const negAnterior = percentualDetratoresDaContagem(semanaAnterior);

  const linhaNps =
    npsAtual === null
      ? "Sem notas suficientes para calcular o NPS desta semana."
      : npsAnterior === null
        ? `NPS da semana: ${npsAtual}.`
        : `NPS da semana: ${npsAtual} (${sinalDiferenca(npsAtual - npsAnterior)}${npsAtual - npsAnterior} em relação à semana anterior).`;

  const linhaDetratores =
    negAtual === null
      ? ""
      : negAnterior === null
        ? `${negAtual}% das respostas foram de detratores.`
        : `${negAtual}% das respostas foram de detratores (${sinalDiferenca(negAtual - negAnterior)}${negAtual - negAnterior} ponto${Math.abs(negAtual - negAnterior) === 1 ? "" : "s"} em relação à semana anterior).`;

  const insumo = `${totalEnviado} resposta${totalEnviado === 1 ? "" : "s"} da pesquisa pública na última semana`;
  const metaGerada = meta({ demo, insumo });
  const resultadoId = salvar({
    tipo: "voz-do-cliente",
    titulo,
    entrada: { contexto: "respostas da pesquisa pública dos últimos 7 dias" } satisfies EntradaAnalise,
    saida: { analise, totalEnviado, totalAnalisado, truncado: false } satisfies SaidaAnalise,
    meta: metaGerada,
  });

  const texto = [analise.resumo_executivo, linhaNps, linhaDetratores].filter(Boolean).join("\n");
  return { titulo, texto, resultadoId };
});

registrarExecutor("alerta-sentimento", async (rotina: Rotina) => {
  const titulo = "Alerta de sentimento — Voz do Cliente";
  const parametros = rotina.parametros as { limite?: number } | undefined;
  const limite = Number(parametros?.limite) || LIMITE_PADRAO;

  const semanaAtual = contarNotasDaJanela(7, 0);
  const semanaAnterior = contarNotasDaJanela(14, 7);
  const negAtual = percentualDetratoresDaContagem(semanaAtual);
  const negAnterior = percentualDetratoresDaContagem(semanaAnterior);

  if (negAtual === null || negAnterior === null) {
    return { titulo, texto: "Ainda não há respostas suficientes nas últimas duas semanas para comparar.", enviar: false };
  }

  const diferenca = negAtual - negAnterior;
  if (diferenca <= limite) {
    return { titulo, texto: `Sem alerta: o percentual de detratores variou ${sinalDiferenca(diferenca)}${diferenca} ponto(s) nos últimos 7 dias.`, enviar: false };
  }

  return {
    titulo,
    texto: `Alerta: o percentual de detratores subiu ${diferenca} pontos nos últimos 7 dias (de ${negAnterior}% para ${negAtual}%). Vale investigar antes que vire churn.`,
  };
});
