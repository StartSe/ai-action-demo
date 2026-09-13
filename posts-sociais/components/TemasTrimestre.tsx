"use client";
// Cartão adicional do /setup: os temas do trimestre (lista de tema + tom de voz) que alimentam a rotina
// semanal de rascunhos, um tema por vez, em ordem. Segue o mesmo padrão de lista editável de
// financas-ia/components/OrcamentoCategorias.tsx (não usa components/setup.tsx, que não suporta linhas dinâmicas).
import { useEffect, useState } from "react";

type Tema = { tema: string; tom: string };
type EstadoNotificacoes = { configurada: boolean; canal: "email" | "slack"; destino: string };
type RotinaExistente = { id: string; tipo: string };

export function TemasTrimestre() {
  const [itens, setItens] = useState<Tema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [notificacoes, setNotificacoes] = useState<EstadoNotificacoes | null>(null);
  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    fetch("/api/temas")
      .then((r) => r.json())
      .then((d) => setItens(d.itens || []))
      .finally(() => setCarregando(false));

    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setNotificacoes({ configurada: Boolean(integracao?.configurada), canal, destino });
      })
      .catch(() => setNotificacoes({ configurada: false, canal: "email", destino: "" }));

    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaExistente) => i.tipo === "rascunhos-semanais");
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
  }, []);

  function atualizar(i: number, campo: keyof Tema, valor: string) {
    setSalvo(false);
    setItens((lista) => lista.map((item, idx) => (idx !== i ? item : { ...item, [campo]: valor })));
  }

  function adicionar() {
    setSalvo(false);
    setItens((lista) => [...lista, { tema: "", tom: "executivo" }]);
  }

  function remover(i: number) {
    setSalvo(false);
    setItens((lista) => lista.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    setSalvando(true);
    setSalvo(false);
    try {
      const itensValidos = itens.filter((i) => i.tema.trim());
      const r = await fetch("/api/temas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: itensValidos }),
      });
      const d = await r.json();
      setItens(d.itens || []);
      setSalvo(true);
    } finally {
      setSalvando(false);
    }
  }

  async function criarRotina() {
    if (!notificacoes?.configurada) return;
    setCriando(true);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "rascunhos-semanais",
          frequencia: "semanal",
          diaSemana: 1,
          hora: "08:00",
          canal: notificacoes.canal,
          destino: notificacoes.canal === "email" ? notificacoes.destino || undefined : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível criar a rotina.");
      setRotinaId(d.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível criar a rotina.");
    } finally {
      setCriando(false);
    }
  }

  const temTemaSalvo = itens.some((i) => i.tema.trim());

  return (
    <section id="temas-do-trimestre" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Temas do trimestre</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Cadastre os temas e o tom de voz que a IA deve usar nos rascunhos. A rotina semanal usa um tema por vez, na ordem
        da lista, e volta ao início depois do último.
      </p>

      {carregando ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            {itens.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 max-md:flex-col max-md:items-stretch">
                <input
                  className="input flex-1"
                  placeholder="Tema (ex.: lançamento do rastreamento em tempo real)"
                  value={item.tema}
                  onChange={(e) => atualizar(i, "tema", e.target.value)}
                />
                <select className="input w-44 max-md:w-full" value={item.tom} onChange={(e) => atualizar(i, "tom", e.target.value)}>
                  <option value="executivo">Executivo</option>
                  <option value="próximo">Próximo</option>
                  <option value="provocador">Provocador</option>
                  <option value="didático">Didático</option>
                </select>
                <button type="button" className="btn-ghost !w-auto max-md:w-full" onClick={() => remover(i)}>
                  Remover
                </button>
              </div>
            ))}
            {itens.length === 0 && <p className="text-muted text-sm">Nenhum tema cadastrado ainda.</p>}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-ghost !w-auto" onClick={adicionar}>
              Adicionar tema
            </button>
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando" : "Salvar temas"}
            </button>
            {salvo && <span className="text-ok text-sm font-semibold">Temas salvos.</span>}
          </div>

          {rotinaId !== undefined && notificacoes !== null && (
            <div className="pt-4 border-t border-line">
              {rotinaId ? (
                <p className="text-muted text-sm">Você já recebe rascunhos novos toda segunda às 8h, com link para aprovar pelo celular.</p>
              ) : !temTemaSalvo ? (
                <p className="text-muted text-sm">Cadastre e salve ao menos um tema para poder receber rascunhos toda semana.</p>
              ) : notificacoes.configurada ? (
                <button type="button" className="btn-ghost !w-auto" onClick={criarRotina} disabled={criando}>
                  {criando ? "Criando..." : "Receber rascunhos toda segunda"}
                </button>
              ) : (
                <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber rascunhos toda segunda</a>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
