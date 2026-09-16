"use client";
// Cartão adicional da configuração: o modelo que lê a captura é o que decide se a página sai parecida com
// a referência, então ele fica aqui, visível, com um teste que manda uma imagem de verdade — e não escondido
// entre as opções avançadas da inteligência artificial.
import { useEffect, useState } from "react";
import { Aviso, lerErro } from "@/components/ui";
import type { Opcao } from "@/lib/modelos";

type Estado = { iaConectada: boolean; modelo: string; escolhido: boolean; opcoes: Opcao[] };

export function QualidadePagina() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erroCarregar, setErroCarregar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; mensagem: string } | null>(null);

  const carregar = () =>
    fetch("/api/visao")
      .then(async (r) => {
        if (!r.ok) throw r;
        setEstado(await r.json());
        setErroCarregar("");
      })
      .catch(async (e) => setErroCarregar((await lerErro(e)).mensagem));

  useEffect(() => { carregar(); }, []);

  async function escolher(modelo: string) {
    setSalvando(true);
    setSalvo(false);
    setErro("");
    setTeste(null);
    try {
      const r = await fetch("/api/visao", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelo }) });
      if (!r.ok) {
        setErro((await lerErro(r)).mensagem);
        return;
      }
      setEstado(await r.json());
      setSalvo(true);
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setTeste(null);
    setErro("");
    try {
      const r = await fetch("/api/visao", { method: "POST" });
      if (!r.ok) {
        setErro((await lerErro(r)).mensagem);
        return;
      }
      setTeste(await r.json());
    } catch (e) {
      setErro((await lerErro(e)).mensagem);
    } finally {
      setTestando(false);
    }
  }

  return (
    <section id="qualidade-da-pagina" className="card p-6 max-md:p-5">
      <h2 className="text-lg font-bold mb-1">Qualidade da página gerada</h2>
      <p className="text-muted text-sm mb-4 max-w-[640px]">
        Este app só funciona com um modelo que enxerga imagens. Os gratuitos dão conta de páginas simples; os pagos chegam mais perto do original.
      </p>

      {erroCarregar ? (
        <div className="flex flex-col gap-4">
          <Aviso tom="danger">{erroCarregar}</Aviso>
          <button type="button" className="btn-ghost" onClick={carregar}>Tentar de novo</button>
        </div>
      ) : !estado ? (
        <p className="text-muted text-sm">Carregando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 max-w-[520px]">
            <label htmlFor="modelo-da-captura" className="text-[13px] font-semibold">Modelo que lê a captura</label>
            <select
              id="modelo-da-captura"
              className="input"
              value={estado.modelo}
              disabled={salvando}
              onChange={(e) => escolher(e.target.value)}
            >
              {estado.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
            <p className="text-muted text-[12.5px]">Sem escolha própria, o app usa o primeiro da lista.</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-ghost" onClick={testar} disabled={testando || salvando}>
              {testando ? "Testando..." : "Testar leitura de imagem"}
            </button>
            {salvo && <span className="text-ok text-[13px] font-semibold">Modelo salvo.</span>}
          </div>

          {!estado.iaConectada && (
            <Aviso>Conecte a inteligência artificial acima para o teste funcionar.</Aviso>
          )}
          {teste && <Aviso tom={teste.ok ? "ok" : "danger"}>{teste.mensagem}</Aviso>}
          {erro && <Aviso tom="danger">{erro}</Aviso>}
        </div>
      )}
    </section>
  );
}
