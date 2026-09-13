// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { aiEnabled, meta } from "./ai";
import { perguntasPendentes, sugerirResposta } from "./atendente";
import { listarBase } from "./base";
import { salvar } from "./historico";
import { registrarExecutor } from "./rotinas";
import type { ItemRelatorioAtendimento } from "./types";

export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "relatorio-atendimento", rotulo: "Relatório diário do atendimento" }];

const MAX_ITENS = 8;

function normalizar(texto: string): string {
  return texto.trim().toLowerCase();
}

registrarExecutor("relatorio-atendimento", async () => {
  // Perguntas já aprovadas na base (lib/base.ts) não precisam entrar no relatório de novo.
  const aprovadas = new Set(listarBase().map((p) => normalizar(p.pergunta)));
  const pendentes = perguntasPendentes()
    .filter((p) => !aprovadas.has(normalizar(p.pergunta)))
    .slice(0, MAX_ITENS);

  const itens: ItemRelatorioAtendimento[] = [];
  for (const p of pendentes) {
    itens.push({ ...p, respostaSugerida: await sugerirResposta(p.pergunta) });
  }

  const titulo = "Relatório diário do atendimento";
  const texto =
    itens.length === 0
      ? "Nenhuma pergunta frequente, sem resposta ou transferida para um humano. Base de conhecimento em dia."
      : `${itens.length} ${itens.length > 1 ? "perguntas merecem" : "pergunta merece"} atenção: ${itens.map((i) => i.pergunta).join("; ")}.`;

  const metaGerada = meta({ demo: !aiEnabled(), insumo: "as conversas recebidas pelo simulador e pelo WhatsApp" });
  const resultadoId = salvar({ tipo: "relatorio-atendimento", titulo, entrada: {}, saida: { itens }, meta: metaGerada });

  return { titulo, texto, resultadoId };
});
