// Garante as três planilhas de exemplo na primeira visita (modo demonstração), sem chamar IA.
// Planilhas de exemplo de versões anteriores (nomes diferentes) são trocadas pelas atuais.
import { criarPlanilha, listarPlanilhas, removerPlanilha } from "./planilhas";
import { gerarCSVsExemplo, NOMES_EXEMPLO } from "./demo";
export async function garantirExemplo() {
  const lista = listarPlanilhas();
  const nomes = Object.values(NOMES_EXEMPLO);
  const demos = lista.filter((p) => p.demo);
  if (demos.length === nomes.length && nomes.every((n) => demos.some((p) => p.nome === n))) return lista;
  for (const p of demos) removerPlanilha(p.id);
  const csvs = gerarCSVsExemplo();
  // Ordem de criação inversa à de exibição (a lista vem da mais recente para a mais antiga).
  await criarPlanilha({ nome: NOMES_EXEMPLO.marketing, texto: csvs.marketing, formato: "csv", demo: true, classificar: false });
  await criarPlanilha({ nome: NOMES_EXEMPLO.custos, texto: csvs.custos, formato: "csv", demo: true, classificar: false });
  await criarPlanilha({ nome: NOMES_EXEMPLO.matriculas, texto: csvs.matriculas, formato: "csv", demo: true, classificar: false });
  return listarPlanilhas();
}
