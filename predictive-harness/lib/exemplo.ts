// Garante a planilha de exemplo na primeira visita (modo demonstração), sem chamar IA.
import { criarPlanilha, listarPlanilhas } from "./planilhas";
import { gerarCSVExemplo, NOME_EXEMPLO } from "./demo";
export async function garantirExemplo() {
  const lista = listarPlanilhas();
  if (lista.some((p) => p.demo)) return lista;
  await criarPlanilha({ nome: NOME_EXEMPLO, texto: gerarCSVExemplo(), formato: "csv", demo: true, classificar: false });
  return listarPlanilhas();
}
