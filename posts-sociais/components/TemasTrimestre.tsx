"use client";
// Cartão adicional do /setup: a empresa e os temas do trimestre (tema + tom de voz) que alimentam a rotina
// semanal de rascunhos, um tema por vez, em ordem. Segue o mesmo padrão de lista editável de
// financas-ia/components/OrcamentoCategorias.tsx (não usa components/setup.tsx, que não suporta linhas dinâmicas).
import { useEffect, useState } from "react";
import { Aviso, lerErro, useStatus } from "@/components/ui";

type Tema = { tema: string; tom: string };
type RotinaExistente = { id: string; tipo: string };
type CanalNotificacoes = { canal: "email" | "slack"; destino: string };

export function TemasTrimestre() {
  const { status } = useStatus();
  const [empresa, setEmpresa] = useState("");
  const [itens, setItens] = useState<Tema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [avisoSalvar, setAvisoSalvar] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);

  const [rotinaId, setRotinaId] = useState<string | null | undefined>(undefined);
  const [canalNotificacoes, setCanalNotificacoes] = useState<CanalNotificacoes>({ canal: "email", destino: "" });
  const [criando, setCriando] = useState(false);
  const [erroRotina, setErroRotina] = useState<{ mensagem: string; motivo?: string } | null>(null);

  useEffect(() => {
    fetch("/api/temas")
      .then((r) => r.json())
      .then((d) => {
        setItens(d.itens || []);
        setEmpresa(d.empresa || "");
      })
      .catch(() => setAvisoSalvar({ tom: "danger", texto: "Não foi possível carregar os temas salvos. Recarregue a página." }))
      .finally(() => setCarregando(false));

    // Canal e destino escolhidos em Notificações: a rotina é criada com eles (sem isso, a rota assume e-mail sem destino).
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        const integracao = (d.integracoes || []).find((i: { id: string }) => i.id === "notificacoes");
        const campos: { chave: string; valorVisivel?: string }[] = integracao?.campos || [];
        const canal = campos.find((c) => c.chave === "NOTIFICACOES_CANAL")?.valorVisivel === "slack" ? "slack" : "email";
        const destino = campos.find((c) => c.chave === "NOTIFICACOES_DESTINO")?.valorVisivel || "";
        setCanalNotificacoes({ canal, destino });
      })
      .catch(() => undefined);

    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((d) => {
        const existente = (d.itens || []).find((i: RotinaExistente) => i.tipo === "rascunhos-semanais");
        setRotinaId(existente?.id ?? null);
      })
      .catch(() => setRotinaId(null));
  }, []);

  function atualizar(i: number, campo: keyof Tema, valor: string) {
    setAvisoSalvar(null);
    setItens((lista) => lista.map((item, idx) => (idx !== i ? item : { ...item, [campo]: valor })));
  }

  function adicionar() {
    setAvisoSalvar(null);
    setItens((lista) => [...lista, { tema: "", tom: "executivo" }]);
  }

  function remover(i: number) {
    setAvisoSalvar(null);
    setItens((lista) => lista.filter((_, idx) => idx !== i));
  }

  /** Salva empresa e temas. Em caso de falha, a lista digitada fica como está e o motivo aparece aqui. */
  async function salvar() {
    setSalvando(true);
    setAvisoSalvar(null);
    try {
      const itensValidos = itens.filter((i) => i.tema.trim());
      const r = await fetch("/api/temas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: itensValidos, empresa }),
      });
      if (!r.ok) {
        setAvisoSalvar({ tom: "danger", texto: `${(await lerErro(r)).mensagem} A lista digitada foi mantida.` });
        return;
      }
      const d = await r.json();
      setItens(d.itens || []);
      setEmpresa(d.empresa || "");
      setAvisoSalvar({ tom: "ok", texto: "Empresa e temas salvos." });
    } catch (e) {
      setAvisoSalvar({ tom: "danger", texto: `${(await lerErro(e)).mensagem} A lista digitada foi mantida.` });
    } finally {
      setSalvando(false);
    }
  }

  async function criarRotina() {
    setCriando(true);
    setErroRotina(null);
    try {
      const r = await fetch("/api/rotinas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "rascunhos-semanais",
          frequencia: "semanal",
          diaSemana: 1,
          hora: "08:00",
          canal: canalNotificacoes.canal,
          destino: canalNotificacoes.canal === "email" ? canalNotificacoes.destino || undefined : undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErroRotina({ mensagem: typeof d.error === "string" ? d.error : "Não foi possível criar a rotina. Tente de novo.", motivo: d.motivo });
        return;
      }
      setRotinaId(d.id);
    } catch (e) {
      setErroRotina({ mensagem: (await lerErro(e)).mensagem });
    } finally {
      setCriando(false);
    }
  }

  const temTema = itens.some((i) => i.tema.trim());
  const notificacoesProntas = status ? Boolean(status.integrations?.notificacoes) : undefined;

  return (
    <section id="temas-do-trimestre" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Temas do trimestre</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Cadastre a empresa, os temas e o tom de voz dos rascunhos semanais. A rotina usa um tema por vez, na ordem da lista, e volta ao início depois do último.
      </p>

      {carregando ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 max-w-[420px]">
            <label htmlFor="temas-empresa" className="text-[13px] font-semibold">Empresa ou marca</label>
            <input
              id="temas-empresa"
              className="input"
              placeholder="Nome que aparece nos posts"
              value={empresa}
              onChange={(e) => {
                setAvisoSalvar(null);
                setEmpresa(e.target.value);
              }}
            />
            <span className="text-[12.5px] text-muted">Sem este nome, a rotina usa a última empresa para a qual você gerou posts.</span>
          </div>

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
              {salvando ? "Salvando" : "Salvar empresa e temas"}
            </button>
          </div>
          {avisoSalvar && <Aviso tom={avisoSalvar.tom}>{avisoSalvar.texto}</Aviso>}

          {rotinaId !== undefined && notificacoesProntas !== undefined && (
            <div className="pt-4 border-t border-line flex flex-col gap-3">
              {rotinaId ? (
                <p className="text-muted text-sm">Você já recebe rascunhos novos toda segunda às 8h, com link para aprovar pelo celular.</p>
              ) : !temTema ? (
                <p className="text-muted text-sm">Cadastre e salve ao menos um tema para poder receber rascunhos toda semana.</p>
              ) : notificacoesProntas ? (
                <button type="button" className="btn-ghost !w-auto" onClick={criarRotina} disabled={criando}>
                  {criando ? "Criando..." : "Receber rascunhos toda segunda"}
                </button>
              ) : (
                <a href="/setup#notificacoes" className="btn-ghost !w-auto">Receber rascunhos toda segunda</a>
              )}
              {erroRotina && (
                <Aviso tom="danger">
                  {erroRotina.mensagem}
                  {erroRotina.motivo === "notificacoes" && (
                    <>
                      {" "}
                      <a className="btn-link text-[13px]" href="/setup#notificacoes">Configurar notificações</a>
                    </>
                  )}
                </Aviso>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
