"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Aviso,
  Chip,
  DataTable,
  ErrorBox,
  Field,
  Hero,
  Loading,
  Passos,
  Row,
  Stage,
  Topbar,
  data,
  lerErro,
  type PassoIndicador,
} from "@/components/ui";
import EntradaTranscricao, { type EntradaHandle } from "@/components/EntradaTranscricao";
import type { Meta } from "@/lib/ai";
import type { Negocio, Proposta } from "@/lib/types";

type ItemNegocio = { id: string; titulo: string; resumo: string; criadoEm: string };

const PROMESSA = {
  sobretitulo: "Comercial",
  titulo: "O CRM que se atualiza pela reunião",
  apoio: "Cole ou grave a reunião: a IA propõe etapa, valor, concorrente e próximo passo, cada um com a evidência ao lado.",
};

const PASSOS: PassoIndicador[] = [
  { titulo: "Negócio", apoio: "Escolha ou crie" },
  { titulo: "Reunião", apoio: "Cole ou grave" },
  { titulo: "Revisão", apoio: "Confirme e aplique" },
];

const ETAPAS_CARREGANDO = ["Lendo a transcrição...", "Comparando com o negócio atual...", "Montando a proposta..."];

type EstadoAnalise =
  | { fase: "sem_negocio" }
  | { fase: "pronto_para_analisar" }
  | { fase: "analisando" }
  | { fase: "erro"; mensagem: string; acao?: { rotulo: string; url: string } }
  | { fase: "proposta"; proposta: Proposta; meta: Meta };

export default function Page() {
  const [status, setStatus] = useState<{ ai: boolean; demo: boolean; model: string; integrations?: Record<string, boolean> } | null>(null);
  const [negocios, setNegocios] = useState<ItemNegocio[] | null>(null);
  const [negocioAbertoId, setNegocioAbertoId] = useState<string | null>(null);
  const [negocioAberto, setNegocioAberto] = useState<Negocio | null>(null);
  const [estado, setEstado] = useState<EstadoAnalise>({ fase: "sem_negocio" });
  const [aceitos, setAceitos] = useState<Record<string, boolean>>({});
  const [aplicando, setAplicando] = useState(false);
  const [avisoAplicado, setAvisoAplicado] = useState(false);
  const [empresaNova, setEmpresaNova] = useState("");
  const [contatoNovo, setContatoNovo] = useState("");
  const [criando, setCriando] = useState(false);
  const [texto, setTexto] = useState("");
  const entradaRef = useRef<EntradaHandle>(null);

  function carregarNegocios() {
    fetch("/api/negocios").then((r) => r.json()).then((r) => setNegocios(r.itens)).catch(() => setNegocios([]));
  }

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
    carregarNegocios();
  }, []);

  async function criarNegocio(e: FormEvent) {
    e.preventDefault();
    if (!empresaNova.trim() || criando) return;
    setCriando(true);
    try {
      const r = await fetch("/api/negocios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: empresaNova, contato: contatoNovo }) });
      const d = await r.json();
      setEmpresaNova("");
      setContatoNovo("");
      carregarNegocios();
      abrirNegocio(d.id);
    } finally {
      setCriando(false);
    }
  }

  function abrirNegocio(id: string) {
    setNegocioAbertoId(id);
    setEstado({ fase: "pronto_para_analisar" });
    setTexto("");
    setAceitos({});
    setAvisoAplicado(false);
    fetch(`/api/negocios/${id}`).then((r) => r.json()).then((r) => setNegocioAberto(r.negocio)).catch(() => setNegocioAberto(null));
  }

  async function analisar() {
    if (!negocioAbertoId || !entradaRef.current) return;
    let entrada;
    try {
      entrada = await entradaRef.current.obterEntrada();
    } catch (e) {
      setEstado({ fase: "erro", mensagem: (e as Error).message });
      return;
    }

    setEstado({ fase: "analisando" });
    try {
      let transcricaoFinal: string;
      if (entrada.tipo === "texto") {
        transcricaoFinal = entrada.transcricao;
      } else {
        const form = new FormData();
        form.append("audio", entrada.arquivo);
        const rt = await fetch("/api/transcrever", { method: "POST", body: form });
        if (!rt.ok) {
          const info = await lerErro(rt);
          setEstado({ fase: "erro", mensagem: info.mensagem, acao: info.acao });
          return;
        }
        const dt = await rt.json();
        transcricaoFinal = dt.transcricao;
        setTexto(transcricaoFinal);
        entradaRef.current.selecionarAbaTexto();
      }

      const r = await fetch(`/api/negocios/${negocioAbertoId}/analisar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcricao: transcricaoFinal }) });
      if (!r.ok) {
        const info = await lerErro(r);
        setEstado({ fase: "erro", mensagem: info.mensagem, acao: info.acao });
        return;
      }
      const resposta = await r.json();
      setEstado({ fase: "proposta", proposta: resposta.proposta, meta: resposta.meta });
      setAceitos({ etapa: true, valor: true, concorrente: true, proximoPasso: true });
    } catch (e) {
      const info = await lerErro(e);
      setEstado({ fase: "erro", mensagem: info.mensagem });
    }
  }

  async function aplicar() {
    if (estado.fase !== "proposta" || !negocioAbertoId) return;
    const { proposta } = estado;
    const corpo: Record<string, unknown> = {};
    const partesResumo: string[] = [];
    if (aceitos.etapa && proposta.etapa) { corpo.etapa = proposta.etapa.valor; partesResumo.push(`etapa → ${proposta.etapa.valor}`); }
    if (aceitos.valor && proposta.valor) { corpo.valor = proposta.valor.valor; partesResumo.push(`valor → R$ ${proposta.valor.valor.toLocaleString("pt-BR")}`); }
    if (aceitos.concorrente && proposta.concorrente) { corpo.concorrente = proposta.concorrente.valor; partesResumo.push(`concorrente → ${proposta.concorrente.valor}`); }
    if (aceitos.proximoPasso && proposta.proximoPasso) { corpo.proximoPasso = proposta.proximoPasso.valor; partesResumo.push(`próximo passo → ${proposta.proximoPasso.valor}`); }
    corpo.resumoEvento = partesResumo.length ? `Atualizado após reunião: ${partesResumo.join("; ")}.` : "Reunião analisada, sem campo aceito.";

    setAplicando(true);
    try {
      const r = await fetch(`/api/negocios/${negocioAbertoId}/atualizar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      if (!r.ok) {
        const info = await lerErro(r);
        setEstado({ fase: "erro", mensagem: info.mensagem, acao: info.acao });
        return;
      }
      const d = await r.json();
      setNegocioAberto(d.negocio);
      setEstado({ fase: "pronto_para_analisar" });
      setTexto("");
      setAvisoAplicado(true);
      carregarNegocios();
    } finally {
      setAplicando(false);
    }
  }

  return (
    <>
      <Topbar marca="C" nome="CRM que Se Preenche" area="Comercial" status={status} usuario={null} />

      <Hero sobretitulo={PROMESSA.sobretitulo} titulo={PROMESSA.titulo} apoio={PROMESSA.apoio} segmento="Vendas">
        <Passos passos={PASSOS} atual={estado.fase === "proposta" ? 3 : negocioAbertoId ? 2 : 1} />
      </Hero>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-8 pt-5 pb-12 max-md:px-4 max-md:pt-5 max-md:pb-10 max-w-[1400px] mx-auto [&>*]:min-w-0">
        <div>
          <div className="card p-5 mb-3">
            <h2 className="font-bold text-[15px] mb-3">Novo negócio</h2>
            <form onSubmit={criarNegocio}>
              <Row>
                <Field label="Empresa" htmlFor="empresa"><input id="empresa" className="input" required placeholder="Acme Materiais" value={empresaNova} onChange={(e) => setEmpresaNova(e.target.value)} /></Field>
                <Field label="Contato (opcional)" htmlFor="contato"><input id="contato" className="input" placeholder="Nome do contato" value={contatoNovo} onChange={(e) => setContatoNovo(e.target.value)} /></Field>
              </Row>
              <button type="submit" className="btn-primary mt-2" disabled={criando || !empresaNova.trim()}>{criando ? "Criando..." : "Criar negócio"}</button>
            </form>
          </div>

          <div className="card p-5">
            <h2 className="font-bold text-[15px] mb-3">Negócios</h2>
            {negocios === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : negocios.length === 0 ? (
              <p className="text-muted text-sm">Nenhum negócio ainda. Crie o primeiro acima.</p>
            ) : (
              <DataTable<ItemNegocio>
                colunas={[
                  { chave: "titulo", titulo: "Empresa", papel: "titulo", render: (l) => (
                    <button type="button" className="btn-link text-left" onClick={() => abrirNegocio(l.id)}>{l.titulo}</button>
                  ) },
                  { chave: "resumo", titulo: "Etapa", papel: "chip", render: (l) => l.resumo },
                  { chave: "criadoEm", titulo: "Criado", papel: "resumo", render: (l) => data(l.criadoEm) },
                ]}
                linhas={negocios}
              />
            )}
          </div>
        </div>

        <Stage>
          {!negocioAbertoId && (
            <div className="card p-7 max-md:p-5 h-full min-h-[420px] flex items-center justify-center text-center">
              <p className="text-muted text-sm max-w-[32ch]">Escolha um negócio na lista ou crie um novo para começar a analisar uma reunião.</p>
            </div>
          )}

          {negocioAbertoId && negocioAberto && (
            <div className="flex flex-col gap-4">
              <NegocioAtual negocio={negocioAberto} />

              {avisoAplicado && <Aviso tom="ok">Negócio atualizado.</Aviso>}

              {(estado.fase === "pronto_para_analisar" || estado.fase === "analisando" || estado.fase === "erro") && (
                <div className="card p-5">
                  <h2 className="font-bold text-[15px] mb-3">Analisar reunião</h2>
                  <EntradaTranscricao ref={entradaRef} texto={texto} onChangeTexto={setTexto} transcricaoConectada={Boolean(status?.integrations?.transcricao)} />
                  <button type="button" className="btn-primary mt-3" disabled={estado.fase === "analisando"} onClick={analisar}>
                    {estado.fase === "analisando" ? "Analisando..." : "Analisar reunião"}
                  </button>
                  {estado.fase === "analisando" && <div className="mt-4"><Loading etapas={ETAPAS_CARREGANDO} /></div>}
                  {estado.fase === "erro" && <div className="mt-4"><ErrorBox mensagem={estado.mensagem} acao={estado.acao} onTentarNovamente={analisar} /></div>}
                </div>
              )}

              {estado.fase === "proposta" && (
                <PropostaRevisao
                  proposta={estado.proposta}
                  demo={estado.meta.demo}
                  aceitos={aceitos}
                  onAceitos={setAceitos}
                  onAplicar={aplicar}
                  onDescartar={() => setEstado({ fase: "pronto_para_analisar" })}
                  aplicando={aplicando}
                />
              )}

              {negocioAberto.historico.length > 0 && <Historico eventos={negocioAberto.historico} />}
            </div>
          )}
        </Stage>
      </main>
    </>
  );
}

export function NegocioAtual({ negocio }: { negocio: Negocio }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold text-[17px]">{negocio.empresa}</h2>
          {negocio.contato && <p className="text-muted text-sm">{negocio.contato}</p>}
        </div>
        <Chip nivel="neutral">{negocio.etapa}</Chip>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted text-[12.5px]">Valor</dt><dd className="font-semibold">{negocio.valor != null ? `R$ ${negocio.valor.toLocaleString("pt-BR")}` : "—"}</dd></div>
        <div><dt className="text-muted text-[12.5px]">Concorrente</dt><dd className="font-semibold">{negocio.concorrente || "—"}</dd></div>
        <div className="col-span-2"><dt className="text-muted text-[12.5px]">Próximo passo</dt><dd className="font-semibold">{negocio.proximoPasso || "—"}</dd></div>
      </dl>
    </div>
  );
}

const ROTULOS_CAMPO: Record<string, string> = { etapa: "Etapa", valor: "Valor", concorrente: "Concorrente", proximoPasso: "Próximo passo" };

function PropostaRevisao({
  proposta,
  demo,
  aceitos,
  onAceitos,
  onAplicar,
  onDescartar,
  aplicando,
}: {
  proposta: Proposta;
  demo: boolean;
  aceitos: Record<string, boolean>;
  onAceitos: (v: Record<string, boolean>) => void;
  onAplicar: () => void;
  onDescartar: () => void;
  aplicando: boolean;
}) {
  const campos = (["etapa", "valor", "concorrente", "proximoPasso"] as const).map((chave) => ({ chave, campo: proposta[chave] }));
  const algumProposto = campos.some((c) => c.campo);

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[15px] mb-1">Proposta de atualização</h2>
      {demo && <p className="text-[12.5px] text-muted mb-3">Exemplo, sem usar IA.</p>}

      {!algumProposto && <Aviso tom="warn">A reunião não trouxe evidência para nenhum campo. Nada para aplicar.</Aviso>}

      <div className="flex flex-col gap-3 mt-2">
        {campos.map(({ chave, campo }) => (
          <label key={chave} className={`flex items-start gap-2.5 p-3 rounded-[10px] border ${campo ? "border-line" : "border-line opacity-50"}`}>
            <input type="checkbox" className="mt-1" disabled={!campo} checked={Boolean(campo && aceitos[chave])} onChange={(e) => onAceitos({ ...aceitos, [chave]: e.target.checked })} />
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-sm">{ROTULOS_CAMPO[chave]}</span>
                {!campo && <span className="text-[12px] text-muted">sem evidência na reunião</span>}
              </div>
              {campo && (
                <>
                  <p className="text-sm font-semibold text-accent-ink">{chave === "valor" ? `R$ ${(campo as { valor: number }).valor.toLocaleString("pt-BR")}` : (campo as { valor: string }).valor}</p>
                  <p className="text-[12.5px] text-muted mt-0.5">&ldquo;{campo.trecho}&rdquo;</p>
                </>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button type="button" className="btn-primary" disabled={!algumProposto || aplicando} onClick={onAplicar}>{aplicando ? "Aplicando..." : "Aplicar atualização"}</button>
        <button type="button" className="btn-ghost" onClick={onDescartar}>Descartar</button>
      </div>
    </div>
  );
}

export function Historico({ eventos }: { eventos: Negocio["historico"] }) {
  return (
    <div className="card p-5">
      <h2 className="font-bold text-[15px] mb-3">Histórico</h2>
      <ul className="flex flex-col gap-2.5 text-sm">
        {[...eventos].reverse().map((ev, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>{ev.resumo}</span>
            <span className="text-muted text-[12.5px] shrink-0">{data(ev.data)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
