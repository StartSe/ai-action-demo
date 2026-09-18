"use client";
// Cartão "Dados para a equipe técnica" em Configurações: o endereço que a conta da ElevenLabs precisa
// chamar quando uma conversa termina, o que o agente precisa receber (prompt-modelo e variáveis) e o
// que travou na última tentativa recusada.
//
// Sem este cartão, uma entrevista feita pelo agente que nunca volta fica sem explicação nenhuma: a
// pessoa de RH vê o candidato parado em "Link aberto" e não tem como saber que faltou colar o
// endereço ou o segredo de verificação.
import { useEffect, useState } from "react";
import { Aviso, CopyButton } from "./ui";

// O roteiro daquela entrevista (a vaga, o candidato, o que perguntar e em que ordem) é montado pelo
// app a cada conversa e entregue em `roteiro`. Por isso o prompt fixo do agente é curto: qualquer
// coisa escrita aqui brigaria com a entrevista daquela vaga.
const PROMPT_MODELO = `Você é a entrevistadora de {{empresa}} e vai conversar com {{candidato}} sobre a vaga de {{cargo}}.

Siga o roteiro abaixo, uma pergunta de cada vez, e conduza a conversa em cerca de {{duracao_minutos}} minutos. Fale em português do Brasil, com naturalidade, e deixe a pessoa terminar de responder antes de seguir. Nunca comente nota, avaliação nem o que achou das respostas; no fim, agradeça e diga que a equipe de recrutamento vai analisar e entrar em contato.

{{roteiro}}`;

const VARIAVEIS = "entrevista_id, candidato, cargo, empresa, roteiro, duracao_minutos";

function haQuanto(minutos: number): string {
  if (minutos < 1) return "agora mesmo";
  if (minutos === 1) return "há 1 minuto";
  if (minutos < 60) return `há ${minutos} minutos`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

type Dados = { url: string; ultima: string | null; recusa: { quando: string; motivo: string } | null };

type Resposta = { url: string; ultimaConversaEm: string | null; ultimaRecusa: { em: string; motivo: string } | null };

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
        const recusa = d.ultimaRecusa
          ? { quando: haQuanto(Math.round((Date.now() - new Date(d.ultimaRecusa.em).getTime()) / 60000)), motivo: d.ultimaRecusa.motivo }
          : null;
        setDados({ url: d.url, ultima, recusa });
      })
      .catch(() => {});
  }, []);

  return (
    <section id="dados-tecnicos" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Dados para a equipe técnica</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Cole este endereço no aviso de pós-conversa da sua conta na ElevenLabs. É por ele que a entrevista feita pelo agente — no
        navegador ou por telefone — volta sozinha para o app e vira parecer.
      </p>

      <Linha rotulo="Endereço" valor={dados?.url ?? "carregando..."} rotuloCopiar="Copiar endereço" />
      <Linha rotulo="Variáveis" valor={VARIAVEIS} rotuloCopiar="Copiar variáveis" />

      <details className="group mt-4">
        <summary className="text-[13px] font-bold text-accent-ink cursor-pointer marker:content-none flex items-center gap-1.5">
          <span className="transition-transform group-open:rotate-90">›</span>
          Instruções-modelo da entrevistadora
        </summary>
        <p className="text-muted text-[12.5px] mt-2 mb-2">
          Cole no campo de instruções do agente. As variáveis acima são preenchidas pelo app a cada entrevista, com a vaga e o
          candidato daquela conversa.
        </p>
        <pre className="bg-bg border border-line px-3 py-2.5 rounded-md text-[12.5px] whitespace-pre-wrap">{PROMPT_MODELO}</pre>
        <div className="mt-2">
          <CopyButton texto={() => PROMPT_MODELO} rotulo="Copiar instruções" />
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
    </section>
  );
}
