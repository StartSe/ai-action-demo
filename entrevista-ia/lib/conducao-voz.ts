/**
 * Como a sala LiveKit decide que a pessoa terminou de falar e quando a entrevistadora pode ser
 * interrompida.
 *
 * O fim da fala NÃO é só silêncio. Uma pessoa contando um exemplo real para dentro de um microfone
 * para para pensar — e uma pausa de dois segundos no meio de "e aí eu... [pausa] ...montei o
 * onboarding" não é o fim da resposta. Por isso o agente usa o detector de fim de turno do SDK
 * (`inference.TurnDetector`, que ouve o áudio e estima se a frase acabou; criado em
 * agents/entrevistadora.ts) e estes prazos: quando o detector diz que a fala terminou, a
 * entrevistadora responde em `minDelay`; quando ele acha que a pessoa vai continuar, espera até
 * `maxDelay` antes de tomar a palavra. Sem o detector (credenciais faltando), vale o silêncio puro
 * com os mesmos prazos.
 *
 * O adaptador grava cada turno no banco: geração especulativa consumiria perguntas que o candidato
 * ainda não ouviu. Só gerar quando a fala estiver confirmada.
 */
export const CONDUCAO_VOZ = {
  preemptiveGeneration: { enabled: false },
  endpointing: { minDelay: 700, maxDelay: 6000 },
  interruption: { minDuration: 900, minWords: 3, resumeFalseInterruption: true },
};
