"use client";
// O que o candidato lê antes de começar (US-016 da PRD): quem convidou, para qual vaga, quanto tempo
// leva, como a conversa funciona e o que é feito com ela.
//
// Duas coisas acontecem no toque em "Começar a entrevista", e é por isso que ele existe como um passo
// separado da sala:
//   1. **o gesto do usuário**, que é o que os navegadores exigem para tocar áudio — sem ele a primeira
//      pergunta sairia muda e o candidato ficaria olhando para uma tela em silêncio;
//   2. **a permissão do microfone**, pedida aqui, com uma frase de teste, e não no meio da primeira
//      pergunta de verdade.
//
// Todo texto desta tela fala com o CANDIDATO: nada aqui manda configurar coisa alguma, nada menciona
// gestor, nota ou avaliação. Quem não tem microfone (ou não quer usá-lo) entra na conversa digitando —
// o caminho por escrito nunca some.
import { useEffect, useRef, useState } from "react";

/** O que o teste de microfone descobriu sobre este navegador. */
type Fase = "convite" | "pedindo" | "ouvindo" | "ouviu" | "sem-escuta" | "sem-permissao";

const FRASE_TESTE = "Diga “olá” para testarmos o seu microfone.";

export function BoasVindas({
  codigo,
  marca,
  nome,
  primeiroNome,
  cargo,
  duracaoMin,
  onPronto,
}: {
  codigo: string;
  marca: string;
  nome: string;
  primeiroNome: string;
  cargo: string;
  duracaoMin: number;
  /** A conversa pode começar. `porVoz` é falso quando o navegador não escuta ou o microfone foi negado. */
  onPronto: (opcoes: { porVoz: boolean }) => void;
}) {
  const [fase, setFase] = useState<Fase>("convite");
  const [ouviu, setOuviu] = useState("");
  const [erro, setErro] = useState("");
  const escutaRef = useRef<SpeechRecognition | null>(null);
  const abrindoRef = useRef(false);
  const prazoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // O que já foi transcrito, para o `onend` decidir sem depender do estado congelado no momento em que
  // os manipuladores da escuta foram criados.
  const ouviuRef = useRef("");

  // A escuta continua rodando depois que a tela sai: sem isto, o microfone fica aberto durante a
  // conversa inteira e o navegador mostra o ponto vermelho o tempo todo.
  function pararTeste() {
    if (prazoRef.current) clearTimeout(prazoRef.current);
    const escuta = escutaRef.current;
    escutaRef.current = null;
    if (!escuta) return;
    escuta.onstart = null;
    escuta.onresult = null;
    escuta.onerror = null;
    escuta.onend = null;
    try { escuta.abort(); } catch { /* O teste já terminou. */ }
  }

  useEffect(() => pararTeste, []);

  function entrar(porVoz: boolean) {
    pararTeste();
    liberarAudio();
    onPronto({ porVoz });
  }

  /** Libera o áudio deste navegador dentro do gesto do usuário, para a primeira pergunta ser falada. */
  function liberarAudio() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const silencio = new SpeechSynthesisUtterance(" ");
    silencio.volume = 0;
    silencio.lang = "pt-BR";
    window.speechSynthesis.speak(silencio);
  }

  function testarMicrofone() {
    pararTeste();
    setFase("pedindo");
    ouviuRef.current = "";
    setOuviu("");
    const Escuta = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Escuta) {
      setFase("sem-escuta");
      return;
    }
    const escuta = new Escuta();
    escuta.lang = "pt-BR";
    escuta.continuous = false;
    escuta.interimResults = true;
    escuta.maxAlternatives = 1;
    escutaRef.current = escuta;
    prazoRef.current = setTimeout(() => {
      pararTeste();
      setFase("sem-escuta");
    }, 12000);
    escuta.onstart = () => setFase("ouvindo");
    escuta.onresult = (evento) => {
      let texto = "";
      for (let i = 0; i < evento.results.length; i += 1) texto += evento.results[i][0].transcript;
      const limpo = texto.trim();
      if (!limpo) return;
      ouviuRef.current = limpo;
      setOuviu(limpo);
      if (evento.results[evento.results.length - 1].isFinal) {
        pararTeste();
        setFase("ouviu");
      }
    };
    escuta.onerror = (evento) => {
      // "no-speech" é ficar em silêncio, e silêncio não é defeito: a tela continua oferecendo o teste.
      if (evento.error === "no-speech" || evento.error === "aborted") return;
      pararTeste();
      setFase(evento.error === "not-allowed" || evento.error === "service-not-allowed" ? "sem-permissao" : "sem-escuta");
    };
    // A escuta se encerra sozinha depois de alguns segundos de silêncio: quem falou vê o resultado,
    // quem não falou volta ao botão em vez de ficar num "estamos ouvindo..." que já acabou.
    escuta.onend = () => {
      pararTeste();
      setFase((atual) => (atual === "ouvindo" || atual === "pedindo" ? (ouviuRef.current ? "ouviu" : "convite") : atual));
    };
    try {
      escuta.start();
    } catch {
      pararTeste();
      setFase("sem-escuta");
    }
  }

  async function comecar(porVoz: boolean) {
    if (abrindoRef.current) return;
    abrindoRef.current = true;
    setErro("");
    setFase("pedindo");
    liberarAudio();
    try {
      const r = await fetch(`/api/entrevista/candidato/${codigo}/abrir`, { method: "POST" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
        setErro(corpo?.error || "Não foi possível começar a entrevista agora. Tente de novo em alguns segundos.");
        setFase("convite");
        return;
      }
    } catch {
      setErro("Não foi possível começar a entrevista agora. Confira a sua conexão e tente de novo.");
      setFase("convite");
      return;
    } finally {
      abrindoRef.current = false;
    }
    if (porVoz) testarMicrofone();
    else entrar(false);
  }

  const cabecalho = (
    <div className="flex items-center gap-3 mb-7">
      <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
      <div className="font-bold text-[15px]">{nome}</div>
    </div>
  );

  return (
    <div className="max-w-[560px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8">
      {cabecalho}
      <div className="card p-7 max-md:p-[22px]">
        <p className="text-muted text-[13px] font-semibold mb-1">{cargo}</p>
        <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">{`Olá, ${primeiroNome}`}</h1>
        <p className="text-muted mb-5">
          {`Esta é a sua conversa sobre a vaga de ${cargo}. Leva cerca de ${duracaoMin} minutos e você pode fazer agora, do celular ou do computador.`}
        </p>

        <ul className="flex flex-col gap-2 mb-5 text-[14.5px]">
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="w-4 shrink-0">1.</span>
            <span>Toque para gravar sua resposta e toque novamente para parar. Não precisa segurar.</span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="w-4 shrink-0">2.</span>
            <span>Revise o texto e envie quando estiver pronto. A entrevistadora segue com a próxima pergunta.</span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden="true" className="w-4 shrink-0">3.</span>
            <span>Se preferir, voc&ecirc; pode digitar as respostas a qualquer momento.</span>
          </li>
        </ul>

        <p className="text-muted text-[13px] mb-5 pt-4 border-t border-line">
          A conversa &eacute; gravada e analisada por intelig&ecirc;ncia artificial para apoiar a decis&atilde;o da equipe de recrutamento, e tamb&eacute;m consultamos
          informa&ccedil;&otilde;es p&uacute;blicas sobre voc&ecirc; na internet.
        </p>

        {erro && (
          <p role="alert" className="mb-4 px-3.5 py-3 rounded-field bg-[#fde8e6] text-danger text-[13.5px] font-semibold">
            {erro}
          </p>
        )}

        {(fase === "convite" || fase === "pedindo") && (
          <div className="flex flex-col gap-3">
            <button type="button" className="btn-primary" disabled={fase === "pedindo"} onClick={() => void comecar(true)}>
              {fase === "pedindo" ? "Preparando..." : "Testar microfone e começar"}
            </button>
            <button type="button" className="btn-link text-sm" disabled={fase === "pedindo"} onClick={() => void comecar(false)}>
              Começar por escrito
            </button>
          </div>
        )}

        {(fase === "ouvindo" || fase === "ouviu") && (
          <div>
            <p className="font-semibold mb-1">{FRASE_TESTE}</p>
            <p className="text-muted text-[13px] mb-3">
              {fase === "ouvindo" ? "Estamos ouvindo..." : "Microfone funcionando. Pode começar."}
            </p>
            <p className="px-3.5 py-3 mb-4 rounded-field bg-bg text-[14.5px] min-h-[46px]" aria-live="polite">
              {ouviu || <span className="text-muted">Falta voc&ecirc; falar...</span>}
            </p>
            <button type="button" className="btn-primary" onClick={() => entrar(true)}>
              Entrar na conversa
            </button>
            <p className="text-center mt-3">
              <button type="button" className="btn-link text-[13.5px]" onClick={() => entrar(false)}>
                Prefiro digitar
              </button>
            </p>
          </div>
        )}

        {fase === "sem-escuta" && (
          <div>
            <p className="font-semibold mb-1">A sua entrevista vai ser por escrito.</p>
            <p className="text-muted text-[13px] mb-4">
              Este navegador n&atilde;o consegue escutar a sua voz. Voc&ecirc; pode responder digitando, do mesmo jeito, ou abrir este mesmo endere&ccedil;o no Chrome
              para conversar falando.
            </p>
            <button type="button" className="btn-primary" onClick={() => entrar(false)}>
              Come&ccedil;ar por escrito
            </button>
          </div>
        )}

        {fase === "sem-permissao" && (
          <div>
            <p className="font-semibold mb-1">N&atilde;o conseguimos usar o seu microfone.</p>
            <p className="text-muted text-[13px] mb-4">
              Libere o microfone para este endere&ccedil;o nas permiss&otilde;es do navegador e teste de novo, ou siga com a entrevista por escrito.
            </p>
            <button type="button" className="btn-primary" onClick={testarMicrofone}>
              Testar o microfone de novo
            </button>
            <p className="text-center mt-3">
              <button type="button" className="btn-link text-[13.5px]" onClick={() => entrar(false)}>
                Prefiro digitar
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
