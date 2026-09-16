"use client";
// Cartão adicional do /setup: a política de contratos da empresa, cadastrada uma vez e usada por
// lib/contratos.ts para apontar, em cada análise, o que foge do que a empresa aceita.
import { useEffect, useState } from "react";
import { Aviso, lerErro } from "@/components/ui";
import type { PoliticaContratos as Politica } from "@/lib/politica";

const PADRAO: Politica = {
  multaMaximaPct: null,
  prazoMaximoMeses: null,
  avisoPrevioMinimoDias: null,
  foroPreferido: "",
  exigencias: { sla: false, protecaoDados: false, propriedadeProgressiva: false },
  textoLivre: "",
};

export function PoliticaContratos() {
  const [politica, setPolitica] = useState<Politica>(PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");
  // Falha ao carregar esconde o formulário (não há o que editar); falha ao salvar mantém o que a pessoa digitou.
  const [erroCarregar, setErroCarregar] = useState("");

  const carregar = () =>
    fetch("/api/politica")
      .then(async (r) => {
        if (!r.ok) throw r;
        setPolitica(await r.json());
        setErroCarregar("");
      })
      .catch(async (e) => setErroCarregar((await lerErro(e)).mensagem))
      .finally(() => setCarregando(false));

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    setSalvando(true);
    setSalvo(false);
    setErro("");
    try {
      const r = await fetch("/api/politica", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(politica) });
      // Sem conferir r.ok, uma sessão expirada devolvia a tela de erro em JSON e o cartão dizia "Política salva".
      if (!r.ok) {
        setErro((await lerErro(r)).mensagem);
        return;
      }
      setPolitica(await r.json());
      setSalvo(true);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  function numero(v: string): number | null {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <section id="politica-de-contratos" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Política de contratos</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Cadastre uma vez o que a empresa aceita. A análise passa a mostrar, em uma seção própria, cada cláusula que foge desta política.
      </p>

      {carregando ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : erroCarregar ? (
        <div className="flex flex-col gap-4">
          <Aviso tom="danger">{erroCarregar}</Aviso>
          <button type="button" className="btn-ghost" onClick={() => { setCarregando(true); carregar(); }}>Tentar de novo</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 max-md:grid-cols-1 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="politica-multa" className="text-[13px] font-semibold">Multa máxima aceitável (%)</label>
              <input
                id="politica-multa"
                className="input"
                type="number"
                min={0}
                max={100}
                placeholder="Ex.: 15"
                value={politica.multaMaximaPct ?? ""}
                onChange={(e) => setPolitica((p) => ({ ...p, multaMaximaPct: numero(e.target.value) }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="politica-prazo" className="text-[13px] font-semibold">Prazo máximo (meses)</label>
              <input
                id="politica-prazo"
                className="input"
                type="number"
                min={0}
                placeholder="Ex.: 12"
                value={politica.prazoMaximoMeses ?? ""}
                onChange={(e) => setPolitica((p) => ({ ...p, prazoMaximoMeses: numero(e.target.value) }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="politica-aviso" className="text-[13px] font-semibold">Aviso prévio mínimo (dias)</label>
              <input
                id="politica-aviso"
                className="input"
                type="number"
                min={0}
                placeholder="Ex.: 60"
                value={politica.avisoPrevioMinimoDias ?? ""}
                onChange={(e) => setPolitica((p) => ({ ...p, avisoPrevioMinimoDias: numero(e.target.value) }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="politica-foro" className="text-[13px] font-semibold">Foro preferido</label>
            <input
              id="politica-foro"
              className="input"
              placeholder="Ex.: São Paulo"
              value={politica.foroPreferido}
              onChange={(e) => setPolitica((p) => ({ ...p, foroPreferido: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Exigências obrigatórias</span>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={politica.exigencias.sla}
                  onChange={(e) => setPolitica((p) => ({ ...p, exigencias: { ...p.exigencias, sla: e.target.checked } }))}
                />
                SLA com penalidade
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={politica.exigencias.protecaoDados}
                  onChange={(e) => setPolitica((p) => ({ ...p, exigencias: { ...p.exigencias, protecaoDados: e.target.checked } }))}
                />
                Proteção de dados
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={politica.exigencias.propriedadeProgressiva}
                  onChange={(e) => setPolitica((p) => ({ ...p, exigencias: { ...p.exigencias, propriedadeProgressiva: e.target.checked } }))}
                />
                Propriedade progressiva do código
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="politica-texto" className="text-[13px] font-semibold">Outras exigências (opcional)</label>
            <textarea
              id="politica-texto"
              className="input min-h-24 resize-y"
              placeholder="Qualquer outra exigência que a empresa sempre cobra em contratos"
              value={politica.textoLivre}
              onChange={(e) => setPolitica((p) => ({ ...p, textoLivre: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>{salvando ? "Salvando" : "Salvar política"}</button>
            {salvo && <span className="text-ok text-sm font-semibold">Política salva.</span>}
            {erro && <span className="text-danger text-sm">{erro}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
