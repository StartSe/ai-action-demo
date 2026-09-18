// Resposta de exemplo usada quando não há chave de IA configurada.
import type { Proposta } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

export function transcricaoDemo(): string {
  return "Vendedor: Bom dia! Vi que vocês estão avaliando também o Concorrente Alfa, é isso? Cliente: Sim, estamos comparando os dois. O preço de vocês ficou um pouco acima, mas gostamos do suporte. Se conseguirem fechar em torno de 45 mil, avançamos para a próxima etapa. Vendedor: Combinado, te mando a proposta revisada até quinta-feira. Cliente: Perfeito, aí a gente decide na semana seguinte.";
}

/** Proposta fixa e plausível, sempre a mesma no modo demonstração — inclui um campo sem evidência
 * de propósito (parceria não é mencionada na transcrição de exemplo), para a tela mostrar como o
 * "sem evidência, não muda" se comporta mesmo sem IA real. */
export function propostaDemo(): Proposta {
  return {
    etapa: { valor: "Negociação", trecho: "Se conseguirem fechar em torno de 45 mil, avançamos para a próxima etapa." },
    valor: { valor: 45000, trecho: "Se conseguirem fechar em torno de 45 mil" },
    concorrente: { valor: "Concorrente Alfa", trecho: "Vi que vocês estão avaliando também o Concorrente Alfa" },
    proximoPasso: { valor: "Enviar a proposta revisada até quinta-feira", trecho: "te mando a proposta revisada até quinta-feira" },
  };
}
