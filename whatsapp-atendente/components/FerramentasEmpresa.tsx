"use client";
// Cartão adicional do /setup (US-074): mostra as ferramentas do sistema conectado em "Sistemas da
// empresa (MCP)" e deixa liberar, em Opções avançadas, as que não começam com listar/obter/consultar/
// buscar — por padrão, o atendente só pode chamar essas quatro para se proteger de ações que mudam
// dados (criar, cancelar, excluir...) sem revisão humana.
import { useEffect, useState } from "react";
import { MaisDetalhes } from "./ui";

type FerramentaRemota = { nome: string; descricao?: string; permitidaPorPrefixo: boolean };
type Resposta = { configurado: boolean; ferramentas: FerramentaRemota[]; liberadas: string[]; error?: string };

export function FerramentasEmpresa() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mcp-empresa/ferramentas")
      .then((r) => r.json())
      .then((d: Resposta) => {
        setDados(d);
        setSelecao(new Set(d.liberadas));
      })
      .catch(() => setDados(null));
  }, []);

  if (!dados || !dados.configurado) return null;

  const permitidas = dados.ferramentas.filter((f) => f.permitidaPorPrefixo);
  const outras = dados.ferramentas.filter((f) => !f.permitidaPorPrefixo);

  function alternar(nome: string) {
    setSelecao((s) => {
      const nova = new Set(s);
      if (nova.has(nome)) nova.delete(nome);
      else nova.add(nome);
      return nova;
    });
  }

  async function salvar() {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/mcp-empresa/ferramentas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liberadas: [...selecao] }),
      });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setAviso("Ferramentas liberadas salvas.");
    } catch {
      setAviso("Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section id="mcp-empresa-ferramentas" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Ferramentas que o atendente pode consultar</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Por segurança, o atendente só chama sozinho ferramentas de consulta (nomes que começam com &quot;listar&quot;, &quot;obter&quot;,
        &quot;consultar&quot; ou &quot;buscar&quot;). As demais ficam bloqueadas, a menos que você libere abaixo.
      </p>
      {dados.error && <p className="text-danger text-sm mb-3">{dados.error}</p>}
      {permitidas.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm mb-4">
          {permitidas.map((f) => (
            <li key={f.nome} title={f.descricao} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <strong>{f.nome}</strong>
              {f.descricao && <span className="text-muted truncate">— {f.descricao}</span>}
            </li>
          ))}
        </ul>
      )}
      {outras.length > 0 && (
        <MaisDetalhes titulo="Opções avançadas: liberar outras ferramentas">
          <ul className="flex flex-col gap-2 text-sm mb-4">
            {outras.map((f) => (
              <li key={f.nome} className="flex items-start gap-2">
                <input
                  id={`liberar-${f.nome}`}
                  type="checkbox"
                  className="mt-1"
                  checked={selecao.has(f.nome)}
                  onChange={() => alternar(f.nome)}
                />
                <label htmlFor={`liberar-${f.nome}`}>
                  <strong>{f.nome}</strong>
                  {f.descricao && <span className="text-muted"> — {f.descricao}</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-primary !w-auto" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando" : "Salvar liberações"}
            </button>
            {aviso && <span className="text-sm font-semibold text-muted">{aviso}</span>}
          </div>
        </MaisDetalhes>
      )}
    </section>
  );
}
