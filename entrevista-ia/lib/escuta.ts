/** Uma sessão de reconhecimento. Os prazos impedem que o microfone deixe a tela presa. */
export type SessaoEscuta = { stop: () => void; abort: () => void };
export type EstadoEscuta = "iniciando" | "ouvindo" | "transcrevendo";

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
    texto = Array.from({ length: evento.results.length }, (_, i) => evento.results[i][0].transcript.trim())
      .filter(Boolean).join(" ");
    onTexto(texto);
    if (automatico && !parando) {
      clearTimeout(silencio);
      if (texto) silencio = setTimeout(stop, 2000);
    }
  };
  r.onerror = (evento) => {
    if (evento.error === "no-speech" || evento.error === "aborted") terminar();
    else terminar(evento.error);
  };
  r.onend = () => terminar();

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
