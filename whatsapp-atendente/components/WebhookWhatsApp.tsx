"use client";
// Cartão adicional do /setup: os valores gerados pelo próprio app que a equipe técnica precisa colar
// no painel da Meta, mais o diagnóstico da conexão (a última mensagem que chegou do número real e a
// última falha de envio). Sem esse diagnóstico, "conectei e não sei se está funcionando" não tem
// resposta dentro do app.
import { useEffect, useState } from "react";
import { Aviso, CopyButton, data } from "./ui";

type Dados = {
  url: string;
  verifyToken: string;
  ultimaRecebida: { em: string; de: string } | null;
  ultimaFalha: { em: string; mensagem: string } | null;
};

function Linha({ rotulo, valor, rotuloCopiar }: { rotulo: string; valor: string | undefined; rotuloCopiar: string }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-[13px] font-semibold w-[190px] shrink-0">{rotulo}</span>
      <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{valor ?? "carregando..."}</code>
      <CopyButton texto={() => valor ?? ""} rotulo={rotuloCopiar} />
    </div>
  );
}

export function WebhookWhatsApp() {
  const [dados, setDados] = useState<Dados | null>(null);

  useEffect(() => {
    fetch("/api/whatsapp/webhook-info").then((r) => r.json()).then(setDados).catch(() => {});
  }, []);

  return (
    <section className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Ligar o número na Meta</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        A equipe técnica cola estes dois valores na configuração de mensagens do número, no painel da Meta. Depois disso, cada mensagem que chegar aparece aqui embaixo.
      </p>
      <div className="flex flex-col gap-3">
        <Linha rotulo="Endereço para receber mensagens" valor={dados?.url} rotuloCopiar="Copiar endereço" />
        <Linha rotulo="Valor de verificação" valor={dados?.verifyToken} rotuloCopiar="Copiar" />
      </div>

      <div className="mt-5 pt-5 border-t border-line">
        <p className="text-[13px] font-semibold mb-2">As mensagens estão chegando?</p>
        {dados === null ? (
          <p className="text-muted text-sm">Carregando...</p>
        ) : dados.ultimaRecebida ? (
          <p className="text-sm">
            Última mensagem recebida do número real em <strong>{data(dados.ultimaRecebida.em, { comHora: true, comAno: true })}</strong>, de {dados.ultimaRecebida.de}.
          </p>
        ) : (
          <p className="text-muted text-sm">
            Nenhuma mensagem do número real chegou até agora. Mande uma mensagem para o número da empresa pelo seu próprio celular: ela deve aparecer aqui em segundos.
          </p>
        )}
        {dados?.ultimaFalha && (
          <div className="mt-3">
            <Aviso tom="danger">
              Uma resposta não saiu em {data(dados.ultimaFalha.em, { comHora: true, comAno: true })}: {dados.ultimaFalha.mensagem}
            </Aviso>
          </div>
        )}
      </div>
    </section>
  );
}
