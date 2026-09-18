"use client";
// Formulário compartilhado por /produtos/[produtoId]/icps/novo e /produtos/[produtoId]/icps/[icpId] (US-006):
// sem icpId, cria; com icpId, busca o ICP em GET /api/icps/[id] e edita. Critérios mudam conforme a
// jornada (B2B: setor/porte/localização/outros; B2C: localização/faixa etária/ocupação/interesses/contexto);
// personas, dores e sinais são chips adicionados e removidos um a um, nunca textarea livre.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Chip, Field } from "@/components/ui";
import { ROTULO_JORNADA } from "@/lib/rotulos";
import type { CriteriosICP, Jornada } from "@/lib/types";

const CRITERIOS_VAZIOS: CriteriosICP = {};

/** Campo de chips: digitar e apertar Enter (ou "Adicionar") acrescenta um item; cada chip tem um botão próprio de remover. */
function CampoLista({ id, label, hint, placeholder, valores, onChange }: { id: string; label: string; hint?: string; placeholder: string; valores: string[]; onChange: (v: string[]) => void }) {
  const [texto, setTexto] = useState("");

  function adicionar() {
    const v = texto.trim();
    if (!v || valores.includes(v)) {
      setTexto("");
      return;
    }
    onChange([...valores, v]);
    setTexto("");
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    adicionar();
  }

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex gap-2">
        <input id={id} className="input" placeholder={placeholder} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={aoTeclar} />
        <button type="button" className="btn-secundario !w-auto shrink-0" onClick={adicionar}>Adicionar</button>
      </div>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {valores.map((v) => (
            <Chip key={v} nivel="neutral">
              <span className="inline-flex items-center gap-1.5">
                {v}
                <button type="button" aria-label={`Remover ${v}`} className="leading-none cursor-pointer" onClick={() => onChange(valores.filter((x) => x !== v))}>×</button>
              </span>
            </Chip>
          ))}
        </div>
      )}
    </Field>
  );
}

export function ICPForm({ produtoId, icpId }: { produtoId: string; icpId?: string }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [jornada, setJornada] = useState<Jornada>("b2b");
  const [criterios, setCriterios] = useState<CriteriosICP>(CRITERIOS_VAZIOS);
  const [personas, setPersonas] = useState<string[]>([]);
  const [dores, setDores] = useState<string[]>([]);
  const [sinais, setSinais] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(Boolean(icpId));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const carregouRef = useRef(false);

  useEffect(() => {
    if (!icpId || carregouRef.current) return;
    carregouRef.current = true;
    fetch(`/api/icps/${icpId}`)
      .then((r) => r.json())
      .then((i) => {
        setNome(i.nome ?? "");
        setJornada(i.jornada === "b2c" ? "b2c" : "b2b");
        setCriterios(i.criterios ?? {});
        setPersonas(i.personas ?? []);
        setDores(i.dores ?? []);
        setSinais(i.sinais ?? []);
      })
      .finally(() => setCarregando(false));
  }, [icpId]);

  function campo(chave: keyof CriteriosICP, valor: string) {
    setCriterios((c) => ({ ...c, [chave]: valor }));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(icpId ? `/api/icps/${icpId}` : "/api/icps", {
        method: icpId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId, nome, jornada, criterios, personas, dores, sinais }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível salvar o perfil agora. Tente de novo.");
        setSalvando(false);
        return;
      }
      router.push(`/produtos/${produtoId}`);
    } catch {
      setErro("Não foi possível salvar o perfil agora. Tente de novo.");
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="card p-6 flex flex-col gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton block w-full h-11" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={salvar} className="card p-6">
      {erro && (
        <div className="mb-4">
          <Aviso tom="danger">{erro}</Aviso>
        </div>
      )}

      <Field label="Nome do perfil" htmlFor="nome" hint="Como este perfil aparece ao escolher uma prospecção.">
        <input id="nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </Field>

      <div className="flex flex-col gap-1.5 mb-4">
        <span className="text-[13px] font-semibold">Jornada</span>
        <div className="flex gap-2 max-md:flex-col" role="radiogroup" aria-label="Jornada">
          {(["b2b", "b2c"] as const).map((j) => (
            <button
              key={j}
              type="button"
              role="radio"
              aria-checked={jornada === j}
              className={`flex-1 h-11 px-3 rounded-field border text-sm font-semibold transition-colors ${jornada === j ? "bg-accent border-accent text-white" : "border-line bg-white text-ink hover:bg-bg"}`}
              onClick={() => setJornada(j)}
            >
              {ROTULO_JORNADA[j]}
            </button>
          ))}
        </div>
      </div>

      {jornada === "b2c" && (
        <div className="mb-4">
          <Aviso tom="warn">Em perfis de pessoas físicas, só entram dados que a própria pessoa publicou — nada de categoria sensível.</Aviso>
        </div>
      )}

      {jornada === "b2b" ? (
        <>
          <Field label="Setor" htmlFor="setor" hint="Segmento das empresas que combinam com este perfil.">
            <input id="setor" className="input" value={criterios.setor ?? ""} onChange={(e) => campo("setor", e.target.value)} />
          </Field>
          <Field label="Porte" htmlFor="porte" hint="Faixa de número de funcionários.">
            <input id="porte" className="input" placeholder="Ex.: 50 a 200 funcionários" value={criterios.porte ?? ""} onChange={(e) => campo("porte", e.target.value)} />
          </Field>
          <Field label="Localização" htmlFor="localizacao" hint="Cidade, estado ou região.">
            <input id="localizacao" className="input" value={criterios.localizacao ?? ""} onChange={(e) => campo("localizacao", e.target.value)} />
          </Field>
          <Field label="Outros critérios" htmlFor="outros" hint="Opcional. Qualquer outro filtro relevante, em texto livre.">
            <textarea id="outros" className="input min-h-[80px] resize-y" value={criterios.outros ?? ""} onChange={(e) => campo("outros", e.target.value)} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Localização" htmlFor="localizacao" hint="Cidade, estado ou região.">
            <input id="localizacao" className="input" value={criterios.localizacao ?? ""} onChange={(e) => campo("localizacao", e.target.value)} />
          </Field>
          <Field label="Faixa etária" htmlFor="faixaEtaria" hint="Opcional.">
            <input id="faixaEtaria" className="input" placeholder="Ex.: 25 a 40 anos" value={criterios.faixaEtaria ?? ""} onChange={(e) => campo("faixaEtaria", e.target.value)} />
          </Field>
          <Field label="Profissão ou ocupação" htmlFor="ocupacao" hint="O que essa pessoa faz.">
            <input id="ocupacao" className="input" value={criterios.ocupacao ?? ""} onChange={(e) => campo("ocupacao", e.target.value)} />
          </Field>
          <CampoLista
            id="interesses"
            label="Interesses"
            hint="Temas que essa pessoa costuma acompanhar."
            placeholder="Ex.: finanças pessoais"
            valores={criterios.interesses ?? []}
            onChange={(v) => setCriterios((c) => ({ ...c, interesses: v }))}
          />
          <Field label="Contexto relevante" htmlFor="contexto" hint="Opcional. Situação ou momento de vida que importa para a abordagem.">
            <textarea id="contexto" className="input min-h-[80px] resize-y" value={criterios.contexto ?? ""} onChange={(e) => campo("contexto", e.target.value)} />
          </Field>
        </>
      )}

      <CampoLista id="personas" label="Personas" hint="Cargos ou perfis de quem você fala com." placeholder="Ex.: gerente de manutenção" valores={personas} onChange={setPersonas} />
      <CampoLista id="dores" label="Problemas que resolvemos" hint="As dores que este produto ataca." placeholder="Ex.: manutenção reativa" valores={dores} onChange={setDores} />
      <CampoLista id="sinais" label="Sinais de intenção" hint="O que indica que é hora de abordar." placeholder="Ex.: abertura de nova unidade" valores={sinais} onChange={setSinais} />

      <div className="flex items-center gap-4 mt-2">
        <button type="submit" className="btn-primary !w-auto max-md:!w-full" disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</button>
        <Link href={`/produtos/${produtoId}`} className="btn-link text-[13px]">Cancelar</Link>
      </div>
    </form>
  );
}
