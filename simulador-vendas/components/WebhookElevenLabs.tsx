"use client";
// Cartão adicional do /setup: endereço gerado pelo próprio app para o passo a passo da ElevenLabs,
// o que o agente precisa receber (prompt-modelo e variáveis dinâmicas) e o que travou na última
// tentativa recusada — sem isso, uma ligação por voz que nunca volta fica sem explicação nenhuma.
import { useEffect, useState } from "react";
import { Aviso, CopyButton } from "./ui";

// O personagem inteiro (quem é o cliente, como se comporta, o que sabe do produto e quais objeções
// tem) é montado pelo app a cada conversa e entregue em `persona_instrucoes`. Por isso o prompt fixo
// do agente é uma linha: qualquer coisa escrita aqui brigaria com o cliente daquele treino.
const PROMPT_MODELO = `Siga {{persona_instrucoes}}`;

function haQuanto(minutos: number): string {
  if (minutos < 1) return "agora mesmo";
  if (minutos === 1) return "há 1 minuto";
  if (minutos < 60) return `há ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

type Dados = {
  url: string;
  ultima: string | null;
  recusa: { quando: string; motivo: string } | null;
  semAvaliacao: number;
};

type Resposta = {
  url: string;
  ultimaConversaEm: string | null;
  ultimaRecusa: { em: string; motivo: string } | null;
  conversasSemAvaliacao: number;
};

function Linha({ rotulo, valor, rotuloCopiar }: { rotulo: string; valor: string; rotuloCopiar: string }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-2.5">
      <span className="text-[13px] font-semibold w-[130px] shrink-0">{rotulo}</span>
      <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{valor}</code>
      <CopyButton texto={() => valor} rotulo={rotuloCopiar} />
    </div>
  );
}

export function WebhookElevenLabs() {
  const [dados, setDados] = useState<Dados | null>(null);

  useEffect(() => {
    fetch("/api/webhook-info")
      .then((r) => r.json())
      .then((d: Resposta) => {
        const ultima = d.ultimaConversaEm ? haQuanto(Math.round((Date.now() - new Date(d.ultimaConversaEm).getTime()) / 60000)) : null;
        const recusa = d.ultimaRecusa ? { quando: haQuanto(Math.round((Date.now() - new Date(d.ultimaRecusa.em).getTime()) / 60000)), motivo: d.ultimaRecusa.motivo } : null;
        setDados({ url: d.url, ultima, recusa, semAvaliacao: d.conversasSemAvaliacao ?? 0 });
      })
      .catch(() => {});
  }, []);

  return (
    <section className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Dados para a equipe técnica</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Cole este endereço no evento de pós-conversa da sua conta ElevenLabs para a conversa voltar sozinha para a análise.
      </p>

      <Linha rotulo="Endereço" valor={dados?.url ?? "carregando..."} rotuloCopiar="Copiar endereço" />
      <Linha rotulo="Variáveis" valor="sessao_id, simulacao, produto, persona_instrucoes, participante, duracao_minutos" rotuloCopiar="Copiar variáveis" />

      <details className="group mt-4">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">›</span>
          Prompt-modelo do cliente simulado
        </summary>
        <p className="text-muted text-[12.5px] mt-2 mb-2">Cole no campo de instruções do agente. As variáveis acima são preenchidas pelo app a cada conversa, com o cliente e o vendedor daquele treino.</p>
        <pre className="bg-bg border border-line px-3 py-2.5 rounded-md text-[12.5px] whitespace-pre-wrap">{PROMPT_MODELO}</pre>
        <div className="mt-2">
          <CopyButton texto={() => PROMPT_MODELO} rotulo="Copiar prompt-modelo" />
        </div>
      </details>

      <p className="text-muted text-sm mt-4">{dados?.ultima ? `Última conversa recebida ${dados.ultima}.` : "Nenhuma conversa recebida ainda."}</p>

      {dados?.recusa && (
        <div className="mt-3">
          <Aviso tom="danger">
            Última tentativa recusada {dados.recusa.quando}: {dados.recusa.motivo}
          </Aviso>
        </div>
      )}
      {dados && dados.semAvaliacao > 0 && (
        <div className="mt-3">
          <Aviso tom="warn">
            {dados.semAvaliacao === 1 ? "1 conversa por voz ficou" : `${dados.semAvaliacao} conversas por voz ficaram`} sem avaliação. Confira o endereço e o segredo de verificação acima.
          </Aviso>
        </div>
      )}
    </section>
  );
}
