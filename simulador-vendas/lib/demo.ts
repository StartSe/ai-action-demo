// Conversa e análise de exemplo usadas quando não há chave de IA configurada.
import type { Analise, CriterioAnalise, LinhaTranscricao } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Transcrição fictícia completa: um vendedor conduzindo uma renovação em risco. */
export function conversaDemo(): LinhaTranscricao[] {
  return [
    { papel: "vendedor", texto: "Boa tarde, Beatriz! Obrigado por topar essa conversa. Antes de falarmos da renovação, queria entender: como o time tem usado a plataforma nos últimos meses?", segundo: 0 },
    { papel: "cliente", texto: "Boa tarde. Olha, para ser sincera, o uso caiu bastante. Ficou complicado no dia a dia e parte do time simplesmente parou de entrar no sistema.", segundo: 12 },
    { papel: "vendedor", texto: "Entendi. Quando você diz 'complicado', é mais sobre não achar o que precisam ou sobre o fluxo de trabalho em si?", segundo: 28 },
    { papel: "cliente", texto: "Mais o fluxo. A gente configurou do jeito que veio, nunca ajustamos para a nossa rotina. E ninguém teve tempo de treinar o time direito.", segundo: 41 },
    { papel: "vendedor", texto: "Faz sentido, e isso é comum quando a implantação inicial não teve um acompanhamento próximo. Posso te mostrar rapidamente como dois clientes parecidos com vocês resolveram isso?", segundo: 58 },
    { papel: "cliente", texto: "Pode, mas já te aviso: preciso justificar esse gasto de novo para a diretoria, e hoje eu não tenho argumento forte para isso.", segundo: 75 },
    { papel: "vendedor", texto: "Justo. Então deixa eu propor o seguinte: incluo, sem custo adicional, quatro sessões de acompanhamento com seu time nas próximas seis semanas, focadas só no fluxo que vocês realmente usam. Se depois disso o uso não voltar, conversamos sobre outras opções. Funciona como primeiro passo?", segundo: 94 },
    { papel: "cliente", texto: "Isso ajuda bastante. Se o time reencontrar valor nisso, fica mais fácil eu defender a renovação lá dentro.", segundo: 121 },
    { papel: "vendedor", texto: "Perfeito. Vou te mandar hoje ainda um plano com as datas propostas e um resumo por escrito que você pode levar para a diretoria. Podemos marcar a primeira sessão para a semana que vem?", segundo: 138 },
    { papel: "cliente", texto: "Pode ser. Me manda as opções de horário que eu confirmo com o time.", segundo: 155 },
  ];
}

const CRITERIOS_DEMO: Record<string, { nota: number; evidencia: string; comoMelhorar: string }> = {
  "abertura e rapport": { nota: 8, evidencia: "Abriu agradecendo o tempo da cliente e perguntando sobre o uso real antes de falar de renovação.", comoMelhorar: "Poderia reconhecer explicitamente a frustração da cliente antes de seguir para as perguntas." },
  "descoberta de necessidades": { nota: 8.5, evidencia: "Investigou se o problema era de conteúdo ou de fluxo de trabalho, chegando à causa real (falta de treinamento e ajuste inicial).", comoMelhorar: "Poderia ter perguntado quantas pessoas do time realmente pararam de usar, para dimensionar o problema." },
  "apresentação de valor": { nota: 7, evidencia: "Ofereceu exemplos de outros clientes parecidos antes de propor a solução.", comoMelhorar: "Faltou citar um número concreto de resultado desses outros clientes, não só a promessa de mostrar." },
  "tratamento de objeções": { nota: 8, evidencia: "Respondeu à objeção sobre justificar o gasto com uma proposta concreta e sem custo adicional, ligada diretamente à causa do problema.", comoMelhorar: "Poderia ter perguntado antes qual argumento a diretoria realmente valoriza, para calibrar a proposta." },
  "geração de urgência": { nota: 6, evidencia: "Propôs um prazo de seis semanas para as sessões de acompanhamento.", comoMelhorar: "Não amarrou esse prazo à data da renovação nem explicou o que acontece se o prazo passar sem decisão." },
  "escuta ativa": { nota: 8.5, evidencia: "Retomou as próprias palavras da cliente ('complicado') para aprofundar a pergunta seguinte.", comoMelhorar: "Já está em bom nível; manter esse padrão de retomar a fala do cliente antes de responder." },
  "fechamento e próximos passos": { nota: 7.5, evidencia: "Definiu um próximo passo claro (plano por escrito e agendamento da primeira sessão).", comoMelhorar: "Poderia ter sugerido uma data e hora específicas em vez de deixar em aberto para a cliente escolher." },
};

function normalizar(s: string) {
  return s.trim().toLowerCase();
}

/** Análise fictícia da conversa acima; usa o mesmo número e nomes de critérios passados pelo painel,
 * reaproveitando um texto pronto para os 7 critérios padrão e um texto genérico para qualquer critério
 * extra ou renomeado, para o exemplo nunca ficar sem conteúdo mesmo se a lista for editada. */
export function analiseDemo(criterios: string[]): Analise {
  const criteriosResp: CriterioAnalise[] = criterios.map((nome, i) => {
    const modelo = CRITERIOS_DEMO[normalizar(nome)];
    if (modelo) return { nome, ...modelo };
    const notas = [7, 8, 6.5, 7.5, 8, 7, 6];
    return {
      nome,
      nota: notas[i % notas.length],
      evidencia: "Há indícios desse critério ao longo da conversa, mas o exemplo não detalha esse ponto específico.",
      comoMelhorar: "Conecte a IA para receber uma avaliação real e específica deste critério.",
    };
  });
  const soma = criteriosResp.reduce((acc, c) => acc + c.nota, 0);
  return {
    nota: Math.round((soma / criteriosResp.length) * 10) / 10,
    criterios: criteriosResp,
    pontosFortes: [
      "Investigou a causa real da queda de uso antes de propor qualquer solução.",
      "Transformou uma objeção orçamentária em uma proposta concreta e de baixo risco para a cliente.",
      "Fechou com um próximo passo claro em vez de deixar a conversa em aberto.",
    ],
    oQueMelhorar: [
      "Faltou amarrar a urgência do plano proposto à data real da renovação.",
      "Poderia ter usado números concretos de outros clientes para reforçar o valor, não só a promessa de mostrar.",
      "Deixou a escolha de horário em aberto quando poderia ter sugerido uma data específica para reduzir fricção.",
    ],
    momentos: [
      "Aos 41s, a cliente revela a causa real do problema ('nunca ajustamos para a nossa rotina') — o vendedor usou essa deixa para propor a solução certa.",
      "Aos 94s, o vendedor converte a objeção de orçamento em uma oferta de acompanhamento sem custo, ligada diretamente à causa do problema, não a um desconto genérico.",
      "Aos 121s, a cliente sinaliza abertura para renovar ('fica mais fácil eu defender'), o momento certo para travar um próximo passo concreto.",
    ],
    resumo: "Conversa de renovação em risco bem conduzida: o vendedor investigou a causa real da queda de uso antes de reagir à objeção de orçamento, e converteu isso em uma proposta concreta de baixo risco. O ponto a melhorar é amarrar mais firmemente o próximo passo a um prazo e a números de resultado.",
  };
}
