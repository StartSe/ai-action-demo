"use client";
// Cartão adicional do /setup: endereço gerado pelo próprio app para o passo a passo da ElevenLabs.
import { useEffect, useState } from "react";
import { CopyButton } from "./ui";

function haQuanto(minutos: number): string {
  if (minutos < 1) return "agora mesmo";
  if (minutos === 1) return "há 1 minuto";
  if (minutos < 60) return `há ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

export function WebhookElevenLabs() {
  const [dados, setDados] = useState<{ url: string; ultima: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/webhook-info")
      .then((r) => r.json())
      .then((d: { url: string; ultimaConversaEm: string | null }) => {
        const ultima = d.ultimaConversaEm ? haQuanto(Math.round((Date.now() - new Date(d.ultimaConversaEm).getTime()) / 60000)) : null;
        setDados({ url: d.url, ultima });
      })
      .catch(() => {});
  }, []);

  return (
    <section className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Dados para a equipe técnica</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Depois de conectar o agente conversacional acima, cole este endereço na configuração de aviso automático de pós-conversa (post_call_transcription) da sua conta ElevenLabs.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[13px] font-semibold w-[130px] shrink-0">Endereço</span>
        <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{dados?.url ?? "carregando..."}</code>
        <CopyButton texto={() => dados?.url ?? ""} rotulo="Copiar endereço" />
      </div>
      <p className="text-muted text-sm mt-4">{dados?.ultima ? `Última conversa recebida ${dados.ultima}.` : "Nenhuma conversa recebida ainda."}</p>
    </section>
  );
}
