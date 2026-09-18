// CRUD dos negócios — sobre a MESMA infraestrutura compartilhada de lib/historico.ts
// (tipo "negocio"), sem tabela própria. `saida` é o negócio inteiro e pode ser
// sobrescrita depois de salva (atualizarSaida), o que é exatamente o que uma
// atualização confirmada precisa fazer.
import { salvar, obter, atualizarSaida, listarPorTipo, apagar } from "./historico";
import type { EntradaNegocio, Negocio, Etapa } from "./types";

const TIPO = "negocio";

export function criarNegocio(empresa: string, contato: string): string {
  const negocio: Negocio = {
    empresa: empresa.trim(),
    contato: contato.trim(),
    etapa: "Prospecção",
    valor: null,
    concorrente: null,
    proximoPasso: null,
    historico: [],
  };
  return salvar({
    tipo: TIPO,
    titulo: negocio.empresa,
    resumo: negocio.etapa,
    entrada: { empresa: negocio.empresa, contato: negocio.contato } as EntradaNegocio,
    saida: negocio,
    // Criar um negócio não é uma geração de IA (é um cadastro simples) — este campo só existe
    // porque lib/historico.ts exige `meta`. Nenhuma tela lê `meta.demo` de um negócio; quem
    // precisa saber se a IA está conectada consulta /api/status, sempre em tempo real.
    meta: { demo: false },
  });
}

export function listarNegocios() {
  return listarPorTipo<EntradaNegocio, Negocio, { demo: boolean }>(TIPO, 200);
}

export function obterNegocio(id: string) {
  const registro = obter<EntradaNegocio, Negocio, { demo: boolean }>(id);
  if (!registro || registro.tipo !== TIPO) return null;
  return registro;
}

/**
 * Aplica os campos que a pessoa confirmou (nunca a proposta inteira sem revisão) e
 * registra o evento no histórico do próprio negócio.
 * @param campos só os campos que a pessoa aceitou da proposta
 */
export function aplicarAtualizacao(
  id: string,
  negocioAtual: Negocio,
  campos: Partial<Pick<Negocio, "etapa" | "valor" | "concorrente" | "proximoPasso">>,
  resumoEvento: string,
): boolean {
  const camposAlterados = Object.keys(campos);
  if (camposAlterados.length === 0) return true; // nada para aplicar, não é erro
  const novo: Negocio = {
    ...negocioAtual,
    ...campos,
    historico: [
      ...negocioAtual.historico,
      { data: new Date().toISOString(), resumo: resumoEvento, camposAlterados },
    ],
  };
  return atualizarSaida(id, novo);
}

export function apagarNegocio(id: string): void {
  apagar(id);
}

export function etapaValida(valor: unknown): valor is Etapa {
  return typeof valor === "string" && (["Prospecção", "Qualificação", "Proposta", "Negociação", "Fechado ganho", "Fechado perdido"] as string[]).includes(valor);
}
