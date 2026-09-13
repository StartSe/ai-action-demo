"use client";
// Entrada da transcrição: colar texto, enviar áudio (arrastar e soltar) ou gravar direto no navegador.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";

export type Aba = "texto" | "audio" | "gravar";

export type EntradaResultado = { tipo: "texto"; transcricao: string } | { tipo: "arquivo"; arquivo: File };

export interface EntradaHandle {
  obterEntrada(): Promise<EntradaResultado>;
  selecionarAbaTexto(): void;
}

interface Props {
  texto: string;
  onChangeTexto: (v: string) => void;
  /** Quando false, a aba "Gravar agora" avisa que a gravação vai gerar uma transcrição de exemplo (nenhuma chave de transcrição configurada). */
  transcricaoConectada?: boolean;
}

const EXTENSOES_VALIDAS = [".mp3", ".m4a", ".wav", ".webm", ".ogg"];
const TAMANHO_MAX = 25 * 1024 * 1024;

function formatarTamanho(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validarArquivo(file: File): string | null {
  const nome = (file.name || "").toLowerCase();
  const extensaoValida = EXTENSOES_VALIDAS.some((ext) => nome.endsWith(ext));
  if (!extensaoValida) return "Formato não suportado. Use mp3, m4a, wav, webm ou ogg.";
  if (file.size > TAMANHO_MAX) return "O arquivo passa de 25 MB. Envie um áudio menor.";
  return null;
}

function formatarTempo(segundos: number) {
  const m = String(Math.floor(segundos / 60)).padStart(2, "0");
  const s = String(segundos % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function TabButton({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={`bg-transparent border-0 border-b-2 cursor-pointer pt-2 pb-2.5 px-1 mr-3.5 font-semibold text-[13.5px] ${ativo ? "text-accent-ink border-accent" : "text-muted border-transparent"}`}
    >
      {children}
    </button>
  );
}

const EntradaTranscricao = forwardRef<EntradaHandle, Props>(function EntradaTranscricao({ texto, onChangeTexto, transcricaoConectada = true }, ref) {
  const [aba, setAba] = useState<Aba>("texto");
  const [gravarSuportado, setGravarSuportado] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [recorderHint, setRecorderHint] = useState('Clique em "Gravar" e fale normalmente. Clique em "Parar" quando a reunião terminar.');
  const [recordedInfo, setRecordedInfo] = useState<{ blob: Blob; segundos: number } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const suportado = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    const t = setTimeout(() => setGravarSuportado(suportado), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function escolherArquivo(file: File) {
    const erro = validarArquivo(file);
    if (erro) {
      setAudioFile(null);
      setErroArquivo(erro);
      return;
    }
    setErroArquivo(null);
    setAudioFile(file);
  }

  function removerArquivo() {
    setAudioFile(null);
    setErroArquivo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function alternarGravacao() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunksRef.current = [];
        setRecordedInfo(null);
        const mr = new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        let totalSegundos = 0;
        mr.addEventListener("dataavailable", (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        });
        mr.addEventListener("stop", () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          setRecordedInfo({ blob, segundos: totalSegundos });
          stream.getTracks().forEach((t) => t.stop());
          setRecorderHint(`Gravação concluída (${formatarTempo(totalSegundos)}). Clique em "Gerar ata" ou grave novamente.`);
        });
        mr.start();
        setSegundos(0);
        timerRef.current = setInterval(() => {
          totalSegundos += 1;
          setSegundos(totalSegundos);
        }, 1000);
        setGravando(true);
        setRecorderHint('Gravando... clique em "Parar" quando a reunião terminar.');
      } catch {
        setRecorderHint("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
      }
    } else {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      setGravando(false);
    }
  }

  useImperativeHandle(ref, () => ({
    async obterEntrada() {
      if (aba === "texto") {
        if (!texto.trim()) throw new Error("Cole a transcrição da reunião antes de gerar a ata.");
        return { tipo: "texto", transcricao: texto.trim() };
      }
      if (aba === "audio") {
        if (!audioFile) throw new Error("Envie um arquivo de áudio antes de gerar a ata.");
        return { tipo: "arquivo", arquivo: audioFile };
      }
      if (mediaRecorderRef.current?.state === "recording") {
        throw new Error('Clique em "Parar" para finalizar a gravação antes de gerar a ata.');
      }
      if (!recordedInfo) throw new Error("Grave a reunião antes de gerar a ata.");
      return { tipo: "arquivo", arquivo: new File([recordedInfo.blob], "gravacao.webm", { type: recordedInfo.blob.type || "audio/webm" }) };
    },
    selecionarAbaTexto() {
      setAba("texto");
    },
  }));

  return (
    <div>
      <div className="flex gap-1.5 mb-[18px] border-b border-line" role="tablist">
        <TabButton ativo={aba === "texto"} onClick={() => setAba("texto")}>Colar transcrição</TabButton>
        <TabButton ativo={aba === "audio"} onClick={() => setAba("audio")}>Enviar áudio</TabButton>
        {gravarSuportado && (
          <TabButton ativo={aba === "gravar"} onClick={() => setAba("gravar")}>Gravar agora</TabButton>
        )}
      </div>

      {aba === "texto" && (
        <div className="flex flex-col gap-1.5 mb-4">
          <label htmlFor="transcricaoTexto" className="text-[13px] font-semibold">Transcrição da reunião</label>
          <textarea
            id="transcricaoTexto"
            className="input min-h-40 resize-y"
            placeholder="Cole aqui a transcrição, as anotações ou a ata rascunho da reunião..."
            value={texto}
            onChange={(e) => onChangeTexto(e.target.value)}
          />
        </div>
      )}

      {aba === "audio" && (
        <div className="flex flex-col gap-1.5 mb-4">
          <span className="text-[13px] font-semibold">Arquivo de áudio</span>
          <div
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) escolherArquivo(file);
            }}
            className={`border-[1.5px] border-dashed rounded-[10px] px-4 py-[22px] text-center cursor-pointer transition-colors ${dragOver ? "border-accent bg-accent-soft" : "border-line bg-[#fafbfc] hover:border-accent hover:bg-accent-soft"}`}
          >
            <p className="text-sm mb-1"><strong>Arraste o áudio aqui</strong> ou clique para escolher</p>
            <span className="text-[12.5px] text-muted">mp3, m4a, wav, webm ou ogg — até 25 MB</span>
            {audioFile && (
              <div className="mt-3 flex items-center justify-center gap-2.5 text-[13.5px] bg-white border border-line rounded-[8px] px-3 py-2">
                <span>{audioFile.name} · {formatarTamanho(audioFile.size)}</span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    removerArquivo();
                  }}
                >
                  remover
                </button>
              </div>
            )}
            {erroArquivo && (
              <div className="mt-3 text-[13.5px] font-semibold text-danger">{erroArquivo}</div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.m4a,.wav,.webm,.ogg,audio/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) escolherArquivo(file);
            }}
          />
        </div>
      )}

      {aba === "gravar" && gravarSuportado && (
        <div className="flex flex-col gap-1.5 mb-4">
          <span className="text-[13px] font-semibold">Gravação</span>
          {!transcricaoConectada && (
            <p className="text-[12.5px] font-semibold text-warn">A transcrição não está conectada; a gravação vai gerar um exemplo.</p>
          )}
          <div className="flex items-center gap-3.5">
            <button type="button" className="btn-ghost" onClick={alternarGravacao}>{gravando ? "Parar" : "Gravar"}</button>
            <span className="tabular-nums font-bold text-accent-ink text-[15px]">{formatarTempo(segundos)}</span>
          </div>
          <span className="text-[12.5px] text-muted">{recorderHint}</span>
        </div>
      )}
    </div>
  );
});

export default EntradaTranscricao;
