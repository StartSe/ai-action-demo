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
type Dados = { conectado: boolean; porPersona: boolean; personas: VozDaPersona[] };

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

  const cancelarRef = useRef<(() => void) | null>(null);
  const pedidoRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let ativa = true;
    const carregar = () => fetch("/api/voz").then(r => r.json()).then((d: Dados) => { if (ativa) setDados(d); }).catch(() => { if (ativa) setFalha("Não foi possível ler esta configuração. Atualize a página."); });
    void carregar();
    window.addEventListener("configuracao-atualizada", carregar);
    return () => {
      ativa = false;
      window.removeEventListener("configuracao-atualizada", carregar);
      pedidoRef.current?.abort();
      cancelarRef.current?.();
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

  async function ouvir(voz: VozDaPersona) {
    pedidoRef.current?.abort();
    cancelarRef.current?.();
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    const controller = new AbortController();
    pedidoRef.current = controller;
    setFalha(""); setTocando(voz.persona);
    const pronto = () => { if (!controller.signal.aborted) setTocando(""); };
    try {
      // Consulta o servidor mesmo após uma chave recém-salva: a amostra usa a escolha atual.
      const r = await fetch("/api/voz/amostra", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona: voz.persona }), signal: controller.signal });
      if (r.ok) {
        const blob = await r.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        const limpar = () => { audio.pause(); audio.onended = null; audio.onerror = null; URL.revokeObjectURL(url); };
        cancelarRef.current = limpar;
        audio.onended = () => { limpar(); pronto(); };
        audio.onerror = () => { limpar(); pronto(); setFalha("Não foi possível tocar a amostra. Tente novamente."); };
        try { await audio.play(); } catch { limpar(); throw new Error("Não foi possível tocar a amostra."); }
        return;
      }
      if (controller.signal.aborted) return;
      const sintese = window.speechSynthesis;
      if (!sintese) throw new Error("Este navegador não consegue reproduzir a amostra.");
      const fala = new SpeechSynthesisUtterance(voz.frase);
      fala.lang = "pt-BR"; fala.rate = voz.rate; fala.pitch = voz.pitch;
      const escolhida = vozPortuguesa();
      if (escolhida) fala.voice = escolhida;
      const timer = setTimeout(() => { limpar(); pronto(); }, 30000);
      const limpar = () => { clearTimeout(timer); fala.onend = null; fala.onerror = null; sintese.cancel(); };
      cancelarRef.current = limpar;
      fala.onend = () => { limpar(); pronto(); };
      fala.onerror = () => { limpar(); pronto(); };
      sintese.speak(fala);
    } catch (err) {
      if (controller.signal.aborted) return;
      setFalha(err instanceof Error ? err.message : "Não foi possível tocar a amostra."); pronto();
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
              ? "ElevenLabs conectada: o cliente fala com a voz selecionada acima."
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
        <span>Adaptar o ritmo por tipo de cliente — o apressado fala mais rápido, o cético fala mais sério</span>
      </label>

      {dados && !dados.porPersona && <p className="text-muted text-sm mt-3">Todos os tipos de cliente usam o mesmo ritmo.</p>}

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
