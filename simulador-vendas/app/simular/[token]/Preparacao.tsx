"use client";
// "Seu cliente" (US-014): o que o vendedor lê antes de falar, como leria o convite de uma reunião de
// verdade — com quem vai falar, por que aquela pessoa aceitou a conversa, quanto tempo tem e o que
// precisa sair dali.
//
// O tipo de cliente (a persona) **não** aparece aqui, e nem na resposta da rota que alimenta esta
// tela: descobrir que o cliente é "o Cético" antes de começar transformaria o treino num exercício
// de decorar comportamento. O vendedor só vê isso no feedback, depois da conversa.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Cliente = { nome: string; cargo: string; empresa: string; contexto: string };
type Preparo = { cliente: Cliente; objetivo: string; duracaoMin: number; porVoz: boolean; roteiro: string[] };

type Props = {
  codigo: string;
  marca: string;
  nome: string;
  /** Nome da simulação e do produto, para o vendedor saber em que treino entrou. */
  titulo: string;
  produto: string;
};

function Moldura({ marca, nome, children }: { marca: string; nome: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[520px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8" style={{ colorScheme: "light" }}>
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
        <div className="font-bold text-[15px]">{nome}</div>
      </div>
      <div className="card p-7 max-md:p-[22px]">{children}</div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 border-t border-line">
      <div className="text-muted text-[12.5px] font-semibold ">{rotulo}</div>
      <div className="text-[14.5px]">{valor}</div>
    </div>
  );
}

export function Preparacao({ codigo, marca, nome, titulo, produto }: Props) {
  const router = useRouter();
  const [preparo, setPreparo] = useState<Preparo | null>(null);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [comecando, setComecando] = useState(false);

  // Busca inicial em corrente: abrir a sessão é um POST porque é ele que grava a conversa que vai
  // começar e guarda a identificação no navegador. Abrir de novo a mesma tela não cria outra conversa
  // — o servidor devolve a que já estava em preparação, com o mesmo cliente.
  useEffect(() => {
    let vivo = true;
    fetch(`/api/salas/${codigo}/sessao`, { method: "POST" })
      .then((r) => r.json().then((corpo: Preparo & { error?: string }) => ({ ok: r.ok, corpo })))
      .then(({ ok, corpo }) => {
        if (!vivo) return;
        if (!ok) throw new Error(corpo.error || "Não foi possível preparar a sua conversa agora.");
        setPreparo(corpo);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        setErro(err instanceof Error ? err.message : "Não foi possível preparar a sua conversa agora.");
      });
    return () => {
      vivo = false;
    };
  }, [codigo, tentativa]);

  async function comecar() {
    setComecando(true);
    setErro("");
    try {
      const r = await fetch(`/api/salas/${codigo}/sessao`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
      const corpo = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(corpo.error || "Não foi possível começar a conversa agora.");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível começar a conversa agora.");
      setComecando(false);
    }
  }

  if (erro && !preparo) {
    return (
      <Moldura marca={marca} nome={nome}>
        <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">Seu cliente</h1>
        <p role="alert" className="px-3.5 py-3 rounded-field bg-[#fde8e6] text-danger text-[13.5px] font-semibold">
          {erro}
        </p>
        <button type="button" className="btn-primary mt-4" onClick={() => { setErro(""); setTentativa((n) => n + 1); }}>Tentar novamente</button>
      </Moldura>
    );
  }

  if (!preparo) {
    return (
      <Moldura marca={marca} nome={nome}>
        <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-2">Seu cliente</h1>
        <p role="status" className="text-muted">Preparando a sua conversa...</p>
      </Moldura>
    );
  }

  const { cliente, objetivo, duracaoMin, porVoz } = preparo;

  return (
    <Moldura marca={marca} nome={nome}>
      <p className="text-muted text-[13px] font-semibold mb-1">{`${titulo} · ${produto}`}</p>
      <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-4">Seu cliente</h1>

      <div className="mb-4">
        <div className="text-[19px] font-extrabold tracking-[-0.01em]">{cliente.nome}</div>
        <div className="text-muted text-[14px]">{`${cliente.cargo} · ${cliente.empresa}`}</div>
      </div>
      <p className="mb-5">{cliente.contexto}</p>

      <Linha rotulo="Tempo da conversa" valor={`Cerca de ${duracaoMin} minutos`} />
      <Linha rotulo="Seu objetivo" valor={objetivo} />

      <section className="mt-5 rounded-xl bg-bg p-4" aria-label="Roteiro da conversa">
        <h2 className="font-bold mb-2">Seu roteiro</h2>
        <p className="text-sm text-muted mb-3">Use como guia e adapte a conversa ao que o cliente disser.</p>
        <ol className="list-decimal pl-5 space-y-2 text-sm">{preparo.roteiro.map(etapa => <li key={etapa}>{etapa}</li>)}</ol>
      </section>

      {erro && (
        <p role="alert" className="mt-4 px-3.5 py-3 rounded-field bg-[#fde8e6] text-danger text-[13.5px] font-semibold">
          {erro}
        </p>
      )}

      <p className="text-muted text-[13px] mt-5 mb-3">
        {porVoz ? "Vamos pedir o microfone para você falar com o cliente." : "Esta conversa é por escrito: você digita e o cliente responde."}
      </p>
      <button type="button" className="btn-primary" disabled={comecando} onClick={comecar}>
        {comecando ? "Abrindo a conversa..." : "Começar conversa"}
      </button>
    </Moldura>
  );
}
