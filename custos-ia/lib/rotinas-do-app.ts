// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho (ver padrão em app/api/f/[token]/route.ts com lib/leitura.ts).
import { aiEnabled } from "./ai";
import { gmailConectado } from "./email";
import { numero } from "./formato";
import { ErroImportacao, importarNotas } from "./importacao";
import { gerarLeitura } from "./leitura";
import { registrarExecutor } from "./rotinas";

/** Tipos de rotina disponíveis neste app, para o cartão de /setup listar num seletor. */
export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [
  { tipo: "resumo-custos-ia", rotulo: "Resumo do gasto com IA do mês" },
  { tipo: "fechamento-mensal", rotulo: "Fechamento mensal de custos de IA" },
];

/** Agendamento padrão do fechamento (botão "Receber o fechamento todo mês" no resultado). */
export const FECHAMENTO_MENSAL = { tipo: "fechamento-mensal", frequencia: "mensal", diaMes: 1, hora: "08:00" } as const;

function reais(v: number): string {
  return `R$ ${numero(v, 2)}`;
}

registrarExecutor("resumo-custos-ia", async () => {
  const { leitura, id } = await gerarLeitura("mes");
  const titulo = "Resumo do gasto com IA";
  const diferenca = leitura.totalBRL - leitura.planejadoBRL;
  const texto =
    diferenca > 0
      ? `Gasto de ${leitura.mesAtual}: ${reais(leitura.totalBRL)}, ${reais(diferenca)} acima do planejado (${reais(leitura.planejadoBRL)}).`
      : `Gasto de ${leitura.mesAtual}: ${reais(leitura.totalBRL)}, dentro do planejado (${reais(leitura.planejadoBRL)}).`;
  return { titulo, texto, resultadoId: id };
});

/** Fechamento do mês anterior, todo dia 1 às 8h: quando o Gmail está conectado (e a IA ligada), importa
 * antes as notas dos últimos 90 dias (a dedup por referência ignora o que já entrou); depois gera a leitura
 * do mês que acabou de fechar e entrega cinco linhas — total, contra o planejado, maior variação, novas
 * assinaturas e alertas — com o link /r/<id> do resultado completo. Nada aqui usa IA além do leitor de notas. */
registrarExecutor("fechamento-mensal", async () => {
  const hoje = new Date();
  const ultimoDiaMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

  let notaImportacao = "";
  if (gmailConectado() && aiEnabled()) {
    try {
      const importacao = await importarNotas(90);
      notaImportacao = ` Notas lidas do e-mail antes de fechar: ${importacao.reconhecidas} nova${importacao.reconhecidas === 1 ? "" : "s"} de ${importacao.lidas} mensagem${importacao.lidas === 1 ? "" : "ns"}.`;
    } catch (err) {
      // A importação é um extra do fechamento: se o Gmail falhar, o fechamento sai mesmo assim, avisando.
      console.error("Fechamento mensal: falha ao importar as notas do Gmail", err);
      notaImportacao = err instanceof ErroImportacao ? ` ${err.message}` : " Não foi possível ler as notas do e-mail desta vez; o fechamento usa só as faturas já lançadas.";
    }
  }

  const { leitura, id } = await gerarLeitura("mes", ultimoDiaMesAnterior);
  const titulo = `Fechamento de custos de IA — ${leitura.mesAtual}`;

  const diferenca = leitura.totalBRL - leitura.planejadoBRL;
  const contraPlanejado =
    diferenca > 0
      ? `${reais(diferenca)} acima do planejado (${reais(leitura.planejadoBRL)}).`
      : diferenca < 0
        ? `${reais(Math.abs(diferenca))} abaixo do planejado (${reais(leitura.planejadoBRL)}).`
        : `Exatamente dentro do planejado (${reais(leitura.planejadoBRL)}).`;

  const maiorVariacao = [...leitura.porFerramenta]
    .map((f) => ({ ...f, delta: f.mesAtualBRL - f.mesAnteriorBRL }))
    .filter((f) => f.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const linhaVariacao = maiorVariacao
    ? `${maiorVariacao.ferramenta} ${maiorVariacao.delta > 0 ? "subiu" : "caiu"} ${reais(Math.abs(maiorVariacao.delta))} em relação ao mês anterior (${reais(maiorVariacao.mesAnteriorBRL)} → ${reais(maiorVariacao.mesAtualBRL)}).`
    : "Nenhuma ferramenta mudou de valor em relação ao mês anterior.";

  const novas = leitura.alertas.filter((a) => a.tipo === "assinatura-nova").map((a) => a.alvo);
  const linhaNovas = novas.length > 0 ? `${novas.join(", ")}.` : "Nenhuma.";

  const estouros = leitura.alertas.filter((a) => a.tipo === "acima-do-planejado");
  const linhaAlertas =
    leitura.alertas.length === 0
      ? "Nenhum alerta neste mês."
      : `${leitura.alertas.length} no total` + (estouros.length > 0 ? ` — acima do planejado: ${estouros.map((a) => a.alvo).join(", ")}.` : ".");

  const texto = [
    `Total de ${leitura.mesAtual}: ${reais(leitura.totalBRL)}.`,
    `Contra o planejado: ${contraPlanejado}`,
    `Maior variação: ${linhaVariacao}`,
    `Novas assinaturas: ${linhaNovas}`,
    `Alertas: ${linhaAlertas}${notaImportacao}`,
  ].join("\n");

  return { titulo, texto, resultadoId: id };
});
