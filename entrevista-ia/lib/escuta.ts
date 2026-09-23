/** Uma sessão de reconhecimento. Os prazos impedem que o microfone deixe a tela presa. */
export type SessaoEscuta = { stop: () => void; abort: () => void };
export type EstadoEscuta = "iniciando" | "ouvindo" | "transcrevendo";

/** Quanto silêncio encerra a resposta no modo mãos livres, numa resposta curta. */
export const SILENCIO_CURTO_MS = 4000;
/** ...e numa resposta que já está longa: quem conta um caso real para para pensar no meio dele. */
export const SILENCIO_LONGO_MS = 6000;
/** Um pouco mais quando a frase visivelmente não acabou ("...e aí eu", "porque"). */
const SILENCIO_EXTRA_FRASE_ABERTA_MS = 1500;
const PALAVRAS_RESPOSTA_LONGA = 40;
const FRASE_ABERTA = /(?:^|\s)(?:e|mas|porque|que|então|entao|aí|ai|depois|também|tambem|quando|com|para|pra|de|do|da|em|no|na|o|a|os|as|um|uma|tipo|assim|ou|se|como|onde|só|so)[,;:]?$/i;
/** Quantas vezes o reconhecimento pode fechar sozinho SEM trazer texto novo antes de a sala desistir.
 * Um fechamento que traz texto novo em seguida zera a conta: é o navegador funcionando, não falhando. */
const MAX_REINICIOS_SEM_TEXTO = 6;
/** Quantas vezes esperamos alguém que ainda não começou a falar. O navegador desiste a cada ~8 s de
 * silêncio ("no-speech"); pensar antes de responder não pode fechar o microfone. */
const MAX_ESPERAS_SEM_FALA = 6;

/**
 * Quanto silêncio o modo mãos livres espera antes de enviar o que já foi dito.
 *
 * O reconhecimento do navegador não sabe se a frase acabou: ele só entrega texto. A regra aqui é a
 * aproximação possível — uma resposta longa ganha mais tempo, e uma frase que termina num conector
 * ("porque", "e aí") também. É o equivalente, no navegador, do detector de fim de turno da sala LiveKit.
 */
export function janelaDeSilencio(texto: string): number {
  const limpo = texto.trim();
  const palavras = limpo ? limpo.split(/\s+/).length : 0;
  const base = palavras >= PALAVRAS_RESPOSTA_LONGA ? SILENCIO_LONGO_MS : SILENCIO_CURTO_MS;
  const aberta = /[,;:]$/.test(limpo) || FRASE_ABERTA.test(limpo);
  return base + (aberta ? SILENCIO_EXTRA_FRASE_ABERTA_MS : 0);
}

export function criarEscuta({ reconhecimento: r, automatico, onEstado, onTexto, onFim, onFalha }: {
  reconhecimento: SpeechRecognition;
  automatico: boolean;
  onEstado: (estado: EstadoEscuta) => void;
  onTexto: (texto: string) => void;
  onFim: (texto: string) => void;
  onFalha: (erro: string, texto: string) => void;
}): SessaoEscuta {
  let encerrada = false;
  let parando = false;
  let texto = "";
  let prefixo = "";
  let reiniciosSemTexto = 0;
  let esperasSemFala = 0;
  let textoNoReinicio = "";
  let semFala = false;
  let prazo: ReturnType<typeof setTimeout> | undefined;
  let silencio: ReturnType<typeof setTimeout> | undefined;

  function limpar() {
    clearTimeout(prazo);
    clearTimeout(silencio);
    r.onstart = null;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
  }

  function terminar(erro?: string) {
    if (encerrada) return;
    encerrada = true;
    limpar();
    try { r.abort(); } catch { /* O navegador pode já ter encerrado. */ }
    if (erro) onFalha(erro, texto);
    else onFim(texto);
  }

  function stop() {
    if (encerrada || parando) return;
    parando = true;
    clearTimeout(prazo);
    clearTimeout(silencio);
    onEstado("transcrevendo");
    // Alguns navegadores não emitem onend depois de stop. Preserva o último texto reconhecido.
    prazo = setTimeout(() => terminar(), 3000);
    try { r.stop(); } catch { terminar(); }
  }

  /** O navegador fechou a sessão sem a pessoa ter terminado: abre outra, preservando o texto. */
  function religar() {
    semFala = false;
    prefixo = texto;
    textoNoReinicio = texto;
    prazo = setTimeout(() => terminar("tempo-esgotado"), 12000);
    try { r.start(); } catch { terminar("inicio-falhou"); }
  }

  r.lang = "pt-BR";
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onstart = () => {
    if (encerrada || parando) return;
    clearTimeout(prazo);
    onEstado("ouvindo");
  };
  r.onresult = (evento) => {
    if (encerrada) return;
    // results contém a sessão inteira, inclusive correções de trechos anteriores.
    // Reconstruir evita repetir uma frase final quando ela reaparece em outro evento.
    const trecho = Array.from({ length: evento.results.length }, (_, i) => evento.results[i][0].transcript.trim()).filter(Boolean).join(" ");
    texto = [prefixo, trecho].filter(Boolean).join(" ");
    // Texto novo depois de um religamento: o navegador está funcionando, a conta de falhas zera.
    if (texto !== textoNoReinicio) reiniciosSemTexto = 0;
    onTexto(texto);
    if (automatico && !parando) {
      clearTimeout(silencio);
      if (texto) silencio = setTimeout(stop, janelaDeSilencio(texto));
    }
  };
  r.onerror = (evento) => {
    if (evento.error === "no-speech" && !parando) {
      // Ainda não começou a falar, ou fez uma pausa longa: o navegador desiste, a sala não. O `onend`
      // que vem em seguida religa a escuta (até um limite) em vez de fechar o microfone.
      semFala = true;
      return;
    }
    if (evento.error === "no-speech" || evento.error === "aborted") terminar();
    else terminar(evento.error);
  };
  r.onend = () => {
    if (encerrada) return;
    if (!parando) {
      // SpeechRecognition pode fechar uma sessão durante uma pausa curta. Esse
      // evento não significa que a pessoa concluiu a resposta.
      if (texto && automatico) {
        if (++reiniciosSemTexto > MAX_REINICIOS_SEM_TEXTO) { terminar("escuta-interrompida"); return; }
        religar();
        return;
      }
      if (!texto && semFala && ++esperasSemFala <= MAX_ESPERAS_SEM_FALA) {
        religar();
        return;
      }
    }
    terminar();
  };

  onEstado("iniciando");
  prazo = setTimeout(() => terminar("tempo-esgotado"), 12000);
  try { r.start(); } catch { terminar("inicio-falhou"); }

  return {
    stop,
    abort: () => {
      if (encerrada) return;
      encerrada = true;
      limpar();
      try { r.abort(); } catch { /* Já encerrada. */ }
    },
  };
}
