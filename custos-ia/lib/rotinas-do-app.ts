// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho (ver padrão em app/api/f/[token]/route.ts com lib/leitura.ts).
import { gerarLeitura } from "./leitura";
import { registrarExecutor } from "./rotinas";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "resumo-custos-ia", rotulo: "Resumo do gasto com IA do mês" }];

registrarExecutor("resumo-custos-ia", async () => {
  const { leitura, id } = await gerarLeitura("mes");
  const titulo = "Resumo do gasto com IA";
  const diferenca = leitura.totalBRL - leitura.planejadoBRL;
  const texto =
    diferenca > 0
      ? `Gasto de ${leitura.mesAtual}: R$ ${leitura.totalBRL.toFixed(2)}, R$ ${diferenca.toFixed(2)} acima do planejado (R$ ${leitura.planejadoBRL.toFixed(2)}).`
      : `Gasto de ${leitura.mesAtual}: R$ ${leitura.totalBRL.toFixed(2)}, dentro do planejado (R$ ${leitura.planejadoBRL.toFixed(2)}).`;
  return { titulo, texto, resultadoId: id };
});
