// Chaves derivadas de "/api/status" que não são apenas "esta integração está configurada" (ex.: um
// recurso ligado por duas integrações juntas, ou um nome de chave diferente do `id` da integração).
// Próprio de cada app (nunca comparado por scripts/verificar-padrao.sh).
import { descobertaAtiva } from "./descoberta";
import { notificacoesProntas } from "./notificacoes-do-app";

export function statusExtra(): Record<string, boolean> {
  return {
    // O genérico só olha o campo "Canal" (que tem padrão e quase nunca é salvo); aqui "configurado" quer
    // dizer "os leads novos da semana chegam a alguém": canal com credencial e destino definidos.
    notificacoes: notificacoesProntas(),
    // "brightdata" (calculado pelo genérico a partir de INTEGRACOES) já reflete a chave salva; aqui é
    // "chave e ao menos uma zona configuradas" (o que lib/descoberta.ts de fato usa para decidir entre
    // real e demonstração).
    descoberta: descobertaAtiva(),
  };
}
