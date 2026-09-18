"use client";
// Cartão adicional das Configurações: a voz do cliente simulado (US-028).
//
// A primeira linha é a mais importante do cartão: **sem conectar nada, o treino já é por voz**. Quem
// abre esta tela procurando "como faço o cliente falar" precisa descobrir ali que não precisa fazer
// nada — e que conectar a ElevenLabs serve para a voz soar como gente, não para a voz existir.
//
// O botão de amostra toca pelo mesmo caminho que o vendedor vai ouvir: pede o áudio ao servidor
// quando há voz da nuvem e, quando não há, fala pelo próprio navegador com o ritmo e a altura daquele
// tipo de cliente. Ouvir a diferença é o que explica o interruptor melhor que qualquer frase.
import { useEffect, useRef, useState } from "react";
import { Aviso } from "./ui";

type VozDaPersona = { persona: string; rotulo: string; frase: string; rate: number; pitch: number };
type Dados = { conectado: boolean; agente: boolean; porPersona: boolean; personas: VozDaPersona[] };

/** Uma voz em português do navegador, quando houver; sem ela o cliente fala com a voz padrão. */
function vozPortuguesa(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis?.getVoices?.() ?? [];
  return vozes.find((v) => v.lang?.toLowerCase().startsWith("pt-br")) ?? vozes.find((v) => v.lang?.toLowerCase().startsWith("pt")) ?? null;
}

export function VozPorPersona() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tocando, setTocando] = useState("");
  const [falha, setFalha] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Busca inicial em forma de corrente: a regra react-hooks/set-state-in-effect acusa a chamada
  // direta de uma função que mexe em estado no corpo do efeito, mesmo sendo assíncrona.
  useEffect(() => {
    fetch("/api/voz")
      .then((r) => r.json())
      .then((d: Dados) => setDados(d))
      .catch(() => setFalha("Não foi possível ler esta configuração agora. Atualize a página."));
  }, []);

  // Sair da tela no meio de uma amostra não pode deixar uma voz falando sozinha.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  async function trocar(ligado: boolean) {
    setSalvando(true);
    setFalha("");
    // O estado muda na tela antes da resposta: uma caixa de seleção que demora a marcar parece travada.
    setDados((atual) => (atual ? { ...atual, porPersona: ligado } : atual));
    try {
      const r = await fetch("/api/voz", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ligado }) });
      if (!r.ok) throw new Error(String(r.status));
      // A resposta traz os números de cada tipo de cliente já recalculados: com o interruptor
      // desligado, as amostras passam a soar todas iguais, que é o que o vendedor vai ouvir.
      setDados((await r.json()) as Dados);
    } catch {
      setDados((atual) => (atual ? { ...atual, porPersona: !ligado } : atual));
      setFalha("Não foi possível salvar esta escolha agora. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function falarNoNavegador(voz: VozDaPersona) {
    const sintese = window.speechSynthesis;
    if (!sintese) return;
    const fala = new SpeechSynthesisUtterance(voz.frase);
    fala.lang = "pt-BR";
    fala.rate = voz.rate;
    fala.pitch = voz.pitch;
    const escolhida = vozPortuguesa();
    if (escolhida) fala.voice = escolhida;
    sintese.cancel();
    sintese.speak(fala);
  }

  async function ouvir(voz: VozDaPersona) {
    setFalha("");
    setTocando(voz.persona);
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    try {
      // Sem ElevenLabs conectada a amostra sai daqui mesmo, sem passar pelo servidor: é o caminho que
      // o vendedor vai ouvir, e pedir um áudio que já se sabe que não existe só encheria o registro do
      // navegador de recusas. Mesma decisão do `vozDoServidor` da sala de treino.
      if (dados?.conectado) {
        const r = await fetch("/api/voz/amostra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona: voz.persona }) });
        if (r.ok) {
          const audio = new Audio(URL.createObjectURL(await r.blob()));
          audioRef.current = audio;
          audio.onended = () => setTocando("");
          await audio.play();
          return;
        }
        // 409 aqui é a ElevenLabs ter recusado, e isso não é falha: a amostra sai pelo navegador.
      }
      falarNoNavegador(voz);
    } catch (err) {
      console.error("Não foi possível tocar a amostra", err);
      falarNoNavegador(voz);
    } finally {
      // A voz do navegador não avisa quando termina de um jeito confiável; o rótulo volta ao normal
      // logo, e o áudio da nuvem desmarca sozinho no `onended`.
      setTimeout(() => setTocando((atual) => (atual === voz.persona ? "" : atual)), 1200);
    }
  }

  return (
    <section className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Voz do cliente</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Sem conectar nada, o treino já acontece por voz: o cliente fala pelo navegador de quem está treinando. Conectar a ElevenLabs no cartão
        acima deixa essa voz parecida com a de uma pessoa de verdade.
      </p>

      {dados && (
        <div className="mb-4">
          <Aviso tom={dados.conectado ? "ok" : "warn"}>
            {dados.conectado
              ? "ElevenLabs conectada: o cliente fala com a voz da sua conta."
              : "ElevenLabs não conectada: o cliente fala com a voz do navegador de quem treina, e o treino funciona normalmente."}
          </Aviso>
        </div>
      )}

      <label className="flex items-start gap-2.5 text-[14px] cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 mt-0.5"
          checked={dados?.porPersona ?? true}
          disabled={!dados || salvando}
          onChange={(e) => void trocar(e.target.checked)}
        />
        <span>Voz automática por tipo de cliente — o apressado fala mais rápido, o cético fala mais sério</span>
      </label>

      {dados && !dados.porPersona && <p className="text-muted text-sm mt-3">Todos os tipos de cliente falam com a mesma voz.</p>}

      {dados && (
        <ul className="mt-4 flex flex-col divide-y divide-line border-t border-line">
          {dados.personas.map((voz) => (
            <li key={voz.persona} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[14px]">{voz.rotulo}</span>
              <button type="button" className="btn-link text-[13.5px] shrink-0" disabled={tocando === voz.persona} onClick={() => void ouvir(voz)}>
                {tocando === voz.persona ? "Tocando..." : "Ouvir uma amostra"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {falha && (
        <div className="mt-3">
          <Aviso tom="danger">{falha}</Aviso>
        </div>
      )}
    </section>
  );
}
