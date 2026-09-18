// Respostas de exemplo usadas quando não há chave de IA configurada.
import type { Briefing, Campanha, Troca } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

// Roteiro fixo: uma pergunta de abertura (sobre o objetivo/produto já informados) seguida dos temas
// que todo briefing de campanha precisa cobrir, um por vez, na mesma ordem. No máximo 6 temas: com o
// teto de numeroDePerguntas (7, contando a abertura), o último tema sempre tem que ser alcançável.
const TEMAS: ((campanha: Campanha) => string)[] = [
  () => "Quem é o público-alvo desta campanha? Descreva o perfil com o máximo de detalhe que conseguir (idade, papel, dor ou desejo).",
  () => "Qual é a verba disponível para esta campanha?",
  () => "Quais canais você já imagina usar (redes sociais, e-mail, influenciadores, mídia paga, etc.)?",
  () => "Qual é o prazo? Me diga a data de lançamento e, se houver, outros marcos importantes.",
  (c) => `Existe alguma mensagem ou diferencial de ${c.produto || "o que está sendo divulgado"} que não pode faltar na campanha?`,
  () => "Como é o tom de voz da marca nesta campanha, e existe alguma restrição — algo que não pode aparecer ou um tema sensível?",
];

export function proximaPerguntaDemo({ campanha, perguntasFeitas }: { campanha: Campanha; historico: Troca[]; perguntasFeitas: number }): string {
  if (perguntasFeitas === 0) {
    return `Para começar: em uma frase, o que faria a campanha "${campanha.nome}" ser um sucesso?`;
  }
  const tema = TEMAS[(perguntasFeitas - 1) % TEMAS.length];
  return tema(campanha);
}

export function mensagemEncerramento(): string {
  return "Perfeito, já tenho o que preciso. Montando o briefing agora.";
}

function respostasPorTema(historico: Troca[]): string[] {
  return historico.filter((h) => h.papel === "pessoa").map((h) => h.texto);
}

function trecho(texto: string, max = 100) {
  const limpo = texto.trim();
  return limpo.length > max ? `${limpo.slice(0, max).trim()}...` : limpo;
}

function semPontoFinal(texto: string) {
  return texto.replace(/[.!?]+$/, "");
}

export function briefingDemo({ campanha, historico = [] }: { campanha: Campanha; historico?: Troca[] }): Briefing {
  const respostas = respostasPorTema(historico);
  const publico = respostas[1] ? trecho(respostas[1], 160) : "Público a definir com o time.";
  const verba = respostas[2] ? trecho(respostas[2], 80) : "a combinar";
  const canais = respostas[3] ? trecho(respostas[3], 160) : "redes sociais e e-mail";
  const prazo = respostas[4] ? trecho(respostas[4], 100) : "a combinar";
  const diferencial = respostas[5] ? trecho(respostas[5], 160) : campanha.objetivo || campanha.produto;
  // A 6ª pergunta pede tom de voz E restrições numa tacada só (ver TEMAS): mesma resposta alimenta os dois.
  const tomERestricao = respostas[6] ? trecho(respostas[6], 160) : "";
  const tom = tomERestricao || "direto e confiante";
  const restricao = tomERestricao || "Nenhuma restrição informada.";

  return {
    resumo: `Campanha "${campanha.nome}" para ${campanha.produto || "o produto informado"}, com foco em ${campanha.objetivo || "o objetivo informado"}. Público, verba e canais abaixo vieram diretamente da conversa; o que não foi respondido ficou marcado como "a combinar".`,
    publico_alvo: publico,
    proposta_de_valor: diferencial,
    mensagens_chave: [diferencial, campanha.objetivo || "Gerar resultado mensurável para o negócio."].filter(Boolean),
    canais_sugeridos: canais.split(/,| e /).map((c) => semPontoFinal(c.trim())).filter(Boolean).slice(0, 4).map((c) => ({ canal: c, motivo: "Citado na conversa como canal de preferência." })),
    cronograma: [
      { etapa: "Produção de materiais", prazo: "a definir" },
      { etapa: "Lançamento", prazo },
      { etapa: "Acompanhamento de resultados", prazo: "contínuo após o lançamento" },
    ],
    kpis: ["Alcance/impressões", "Taxa de conversão", "Custo por resultado (lead ou venda)"],
    tom_de_voz: tom,
    riscos_e_restricoes: [restricao, verba !== "a combinar" ? `Verba: ${semPontoFinal(verba)}.` : "Verba ainda não definida."],
  };
}
