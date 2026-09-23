import { CONVERSAS_EXEMPLO } from "./demo";
import { carregarBase } from "./base";
import { listarMensagens } from "./conversa";
/** Only aggregates and the current conversation are supplied to the conversational agent. */
export function contextoVoz() {
  const base = carregarBase();
  return JSON.stringify({
    fontes: [base.matriculas, base.custos, base.marketing].filter(p => p !== null).map(p => p.nome),
    produtos: base.produtos.map(p => p.nome),
    demonstracao: base.demo,
    perguntasDeExemplo: base.demo ? CONVERSAS_EXEMPLO.map(c => c.pergunta) : undefined,
    avisos: base.avisos,
    historico: listarMensagens().slice(-6).map(m => ({ mensagemId: m.id, papel: m.papel, texto: m.texto.slice(0, 1200), cartoes: m.cartoes, recalculada: !!m.fpa?.recalculadoEm })),
  });
}
