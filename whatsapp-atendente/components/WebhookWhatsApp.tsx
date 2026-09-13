"use client";
// Cartão adicional do /setup: valores gerados pelo próprio app para o passo de webhooks da Meta.
import { useEffect, useState } from "react";
import { CopyButton } from "./ui";

export function WebhookWhatsApp() {
  const [dados, setDados] = useState<{ url: string; verifyToken: string } | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/webhook-info").then((r) => r.json()).then(setDados).catch(() => {});
  }, []);

  return (
    <section className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Webhook do WhatsApp</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Depois de conectar o número acima, cole estes dois valores na configuração de webhooks do painel da Meta, no campo <strong>messages</strong>.
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-semibold w-[130px] shrink-0">Endereço</span>
          <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{dados?.url ?? "carregando..."}</code>
          <CopyButton texto={() => dados?.url ?? ""} rotulo="Copiar URL" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-semibold w-[130px] shrink-0">Valor de verificação</span>
          <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{dados?.verifyToken ?? "carregando..."}</code>
          <CopyButton texto={() => dados?.verifyToken ?? ""} rotulo="Copiar" />
        </div>
      </div>
    </section>
  );
}
