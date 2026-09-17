"use client";
// Tela de identificação do vendedor (US-013), a primeira coisa que ele vê ao abrir o link do treino.
//
// Não há menu do app, cabeçalho de gestor nem link para as configurações: quem está aqui é o vendedor,
// que não administra nada e não deve nem descobrir que existe uma área de administração.
//
// Google e Microsoft aparecem só quando a instância tem as credenciais, e "ou informe seu nome e
// e-mail" fica **sempre** logo abaixo (D5): o caminho manual nunca pode ficar escondido, porque é o
// único que funciona em toda instalação.
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export type ProvedorBotao = { id: string; rotulo: string };

/** O balanço de quem volta ao link com conversas já feitas e nenhuma em aberto (US-017). */
export type JaTreinou = {
  tentativas: number;
  /** `null` é "sem limite": a frase perde o "de N" e o treino continua aberto. */
  maxTentativas: number | null;
  podeTreinar: boolean;
  /** Quantas conversas existem no histórico — abaixo de duas não vale oferecer a lista. */
  conversas: number;
  /** Endereço do feedback mais recente, ou `null` quando ainda não há avaliação para reler. */
  ultimoFeedback: string | null;
};

type Props = {
  codigo: string;
  marca: string;
  nome: string;
  titulo: string;
  produto: string;
  contexto: string;
  provedores: ProvedorBotao[];
  /** Quem já treinou neste navegador: a tela oferece "Continuar como <nome>". */
  conhecido: string | null;
  jaTreinou?: JaTreinou | null;
  erroInicial?: string;
};

export function Identificacao({ codigo, marca, nome, titulo, produto, contexto, provedores, conhecido, jaTreinou = null, erroInicial }: Props) {
  const router = useRouter();
  const [meuNome, setMeuNome] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(erroInicial || "");
  // "Não sou eu" troca a tela sem recarregar: o cookie já foi apagado no servidor.
  const [trocando, setTrocando] = useState(false);

  async function identificar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch(`/api/salas/${codigo}/identificar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: meuNome, email }),
      });
      const resposta = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(resposta.error || "Não foi possível continuar agora.");
      router.push(`/simular/${codigo}?pronto=1`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível continuar agora.");
      setEnviando(false);
    }
  }

  async function naoSouEu() {
    setEnviando(true);
    await fetch(`/api/salas/${codigo}/identificar`, { method: "DELETE" });
    setTrocando(true);
    setEnviando(false);
  }

  const mostrarConhecido = conhecido && !trocando;

  return (
    <div className="max-w-[520px] mx-auto px-8 py-12 max-md:px-4 max-md:py-8" style={{ colorScheme: "light" }}>
      <div className="flex items-center gap-3 mb-7">
        <div className="shrink-0 w-[34px] h-[34px] rounded-[9px] bg-accent text-white grid place-items-center font-extrabold text-[15px] tracking-tight">{marca}</div>
        <div className="font-bold text-[15px]">{nome}</div>
      </div>

      <div className="card p-7 max-md:p-[22px]">
        <h1 className="text-[22px] leading-[1.2] font-extrabold tracking-[-0.02em] mb-1">{titulo}</h1>
        <p className="text-muted text-[13px] font-semibold mb-3">{produto}</p>
        <p className="text-muted mb-6">{contexto}</p>

        {erro && (
          <p role="alert" className="mb-4 px-3.5 py-3 rounded-field bg-[#fde8e6] text-danger text-[13.5px] font-semibold">
            {erro}
          </p>
        )}

        {mostrarConhecido ? (
          <>
            {/* Quem já treinou vê primeiro onde está: "Você já treinou 2 de 3 vezes". É a resposta da
                pergunta que faz alguém voltar ao link — e ela vem antes de qualquer botão. */}
            {jaTreinou && (
              <p className="mb-5 text-[15px]">
                {jaTreinou.maxTentativas === null
                  ? `${conhecido}, você já treinou ${jaTreinou.tentativas} ${jaTreinou.tentativas === 1 ? "vez" : "vezes"} neste treino.`
                  : `${conhecido}, você já treinou ${jaTreinou.tentativas} de ${jaTreinou.maxTentativas} ${jaTreinou.maxTentativas === 1 ? "vez" : "vezes"}.`}
              </p>
            )}

            {/* `?pronto=1` é a confirmação desta visita: sem ele, quem volta ao link cai de novo em
                "Continuar como <nome>" em vez de entrar direto numa conversa que não pediu. */}
            {(!jaTreinou || jaTreinou.podeTreinar) && (
              <a className="btn-primary" href={`/simular/${codigo}?pronto=1`}>
                {jaTreinou ? "Treinar novamente" : `Continuar como ${conhecido}`}
              </a>
            )}

            {jaTreinou?.ultimoFeedback && (
              <a className={jaTreinou.podeTreinar ? "btn-secundario mt-2.5" : "btn-primary"} href={jaTreinou.ultimoFeedback}>
                Ver meu último resultado
              </a>
            )}

            {jaTreinou && !jaTreinou.podeTreinar && !jaTreinou.ultimoFeedback && (
              <p className="text-muted">Você já usou todas as suas conversas neste treino. Fale com quem enviou o link se precisar de mais uma chance.</p>
            )}

            {jaTreinou && jaTreinou.conversas > 1 && (
              <p className="text-center mt-3">
                <a className="btn-link text-[13.5px]" href={`/simular/${codigo}/meus-resultados`}>
                  Ver minhas conversas
                </a>
              </p>
            )}

            <p className="text-center mt-3">
              <button type="button" className="btn-link text-[13.5px]" disabled={enviando} onClick={naoSouEu}>
                Não sou eu
              </button>
            </p>
          </>
        ) : (
          <>
            {provedores.length > 0 && (
              <div className="flex flex-col gap-2.5 mb-5">
                {provedores.map((p) => (
                  <a key={p.id} className="btn-secundario" href={`/api/salas/${codigo}/entrar/${p.id}`}>
                    {p.rotulo}
                  </a>
                ))}
              </div>
            )}

            <p className="text-muted text-[13px] font-semibold mb-4">{provedores.length > 0 ? "ou informe seu nome e e-mail" : "Informe seu nome e e-mail para começar"}</p>

            <form onSubmit={identificar}>
              <div className="flex flex-col gap-1.5 mb-4">
                <label htmlFor="vendedor-nome" className="text-[13px] font-semibold">
                  Seu nome
                </label>
                <input id="vendedor-nome" className="input" required maxLength={120} autoComplete="name" value={meuNome} onChange={(e) => setMeuNome(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 mb-5">
                <label htmlFor="vendedor-email" className="text-[13px] font-semibold">
                  Seu e-mail
                </label>
                <input id="vendedor-email" className="input" type="email" required maxLength={180} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary" disabled={enviando}>
                {enviando ? "Entrando..." : "Começar o treino"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
