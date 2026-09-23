"use client";
// Painel "Marca": o refinamento que saiu do formulário de criação (nome e cores). Salvar grava a marca no projeto
// (PATCH /api/sites/[id], o agente passa a conhecê-la); "Aplicar ao site" manda ao agente a instrução de trocar o
// nome nos textos e as cores de destaque — a prévia muda ao vivo. O logo e as fotos ficam no painel Imagens.
import { useState, type FormEvent } from "react";
import type { Projeto } from "@/lib/types";
import { Aviso, lerErro } from "./ui";

const COR_HEX = /^#[0-9a-f]{6}$/i;

export function PainelMarca({ projeto, aoAtualizar, aoAplicar }: { projeto: Projeto; aoAtualizar: (p: Projeto) => void; aoAplicar: (instrucao: string) => void }) {
  const [nome, setNome] = useState(projeto.marca?.nome ?? "");
  const [cor, setCor] = useState(projeto.marca?.corPrimaria ?? "");
  const [cor2, setCor2] = useState(projeto.marca?.corSecundaria ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "ok" | "danger"; texto: string } | null>(null);

  async function salvar(e?: FormEvent): Promise<Projeto | null> {
    e?.preventDefault();
    if ([cor, cor2].some((c) => c.trim() && !COR_HEX.test(c.trim()))) { setAviso({ tom: "danger", texto: "Use seis dígitos nas cores, como #792a3f, ou escolha pela paleta." }); return null; }
    setOcupado(true);
    setAviso(null);
    try {
      const marca = nome.trim() || cor.trim() ? { nome: nome.trim(), corPrimaria: cor.trim(), ...(cor2.trim() ? { corSecundaria: cor2.trim() } : {}) } : null;
      const r = await fetch(`/api/sites/${projeto.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marca }) });
      if (!r.ok) { setAviso({ tom: "danger", texto: (await lerErro(r)).mensagem }); return null; }
      const { projeto: novo } = (await r.json()) as { projeto: Projeto };
      aoAtualizar(novo);
      setAviso({ tom: "ok", texto: "Marca salva. O agente já a conhece." });
      return novo;
    } catch (err) {
      setAviso({ tom: "danger", texto: (await lerErro(err)).mensagem });
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function aplicar() {
    const novo = await salvar();
    if (!novo) return;
    const partes = [
      novo.marca?.nome ? `troque o nome da empresa em todos os textos por «${novo.marca.nome}»` : "",
      novo.marca?.corPrimaria ? `use ${novo.marca.corPrimaria} como cor principal nos botões, títulos de destaque e blocos que substituem imagens` : "",
      novo.marca?.corSecundaria ? `use ${novo.marca.corSecundaria} como cor secundária nos detalhes` : "",
    ].filter(Boolean);
    if (!partes.length) { setAviso({ tom: "danger", texto: "Preencha o nome ou a cor antes de aplicar." }); return; }
    aoAplicar(`Aplique a marca no site: ${partes.join("; ")}. Mantenha a estrutura, as imagens e a ordem das seções.`);
  }

  const corValida = COR_HEX.test(cor) ? cor : "#792a3f";
  const cor2Valida = COR_HEX.test(cor2) ? cor2 : "#bc342f";

  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="Marca do site">
      <h3 className="font-bold text-[14px]">Marca</h3>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label className="block">
          <span className="rotulo-campo">Nome da empresa</span>
          <input className="input !py-2.5" placeholder="Como aparece nos textos do site" value={nome} disabled={ocupado} onChange={(e) => setNome(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className="block">
            <span className="rotulo-campo">Cor principal</span>
            <div className="flex gap-2 items-center">
              <input className="input !py-2.5" placeholder="#0f766e" value={cor} disabled={ocupado} onChange={(e) => setCor(e.target.value)} />
              <input type="color" aria-label="Escolher a cor principal" className="w-10 h-10 shrink-0 rounded-[10px] border border-line bg-white cursor-pointer" value={corValida} disabled={ocupado} onChange={(e) => setCor(e.target.value)} />
            </div>
          </label>
          <label className="block">
            <span className="rotulo-campo">Cor secundária</span>
            <div className="flex gap-2 items-center">
              <input className="input !py-2.5" placeholder="#f59e0b" value={cor2} disabled={ocupado} onChange={(e) => setCor2(e.target.value)} />
              <input type="color" aria-label="Escolher a cor secundária" className="w-10 h-10 shrink-0 rounded-[10px] border border-line bg-white cursor-pointer" value={cor2Valida} disabled={ocupado} onChange={(e) => setCor2(e.target.value)} />
            </div>
          </label>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button type="button" className="btn-compacto-primario" disabled={ocupado || projeto.estado !== "pronto"} onClick={aplicar}>Aplicar ao site com o agente</button>
          <button type="submit" className="btn-compacto" disabled={ocupado}>{ocupado ? "Salvando..." : "Só salvar"}</button>
        </div>
        {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
        <p className="text-muted text-[12.5px]">O agente troca o nome nos textos e as cores de destaque numa versão nova, em rascunho. Logo e fotos entram pelo painel Imagens.</p>
      </form>
    </section>
  );
}
