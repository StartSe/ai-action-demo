"use client";
import { useRef, useState, type FormEvent } from "react";
import type { CampoFormulario } from "@/lib/formularios";
import { Icone } from "@/components/observatorio/Icone";
type Props = {
  token: string;
  marca: string;
  nome: string;
  titulo: string;
  descricao?: string;
  agradecimento?: string;
  campos: CampoFormulario[];
};
export function FormularioPublico({
  token,
  nome,
  titulo,
  descricao,
  agradecimento,
  campos,
}: Props) {
  const [dados, setDados] = useState<Record<string, string>>({});
  const [etapa, setEtapa] = useState(0);
  const [fase, setFase] = useState<"respondendo" | "enviando" | "enviado">(
    "respondendo",
  );
  const [erro, setErro] = useState("");
  const [armadilha, setArmadilha] = useState("");
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const enviando = useRef(false);
  const secoes = [...new Set(campos.map((c) => c.secao || "Sua percepção"))];
  const secao = secoes[etapa];
  const visiveis = campos.filter((c) => (c.secao || "Sua percepção") === secao);
  const respondidas = campos.filter((c) => dados[c.chave]?.trim()).length;
  function set(chave: string, valor: string) {
    setDados((d) => ({ ...d, [chave]: valor }));
    setErro("");
  }
  function ir(i: number) {
    setEtapa(i);
    setErro("");
    requestAnimationFrame(() => {
      tituloRef.current?.focus();
      tituloRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }
  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (etapa < secoes.length - 1) {
      ir(etapa + 1);
      return;
    }
    if (enviando.current) return;
    const faltando = campos.find(
      (c) => c.obrigatorio && !dados[c.chave]?.trim(),
    );
    if (faltando) {
      ir(secoes.indexOf(faltando.secao || "Sua percepção"));
      setErro(`Responda “${faltando.rotulo}” para continuar.`);
      return;
    }
    enviando.current = true;
    setFase("enviando");
    setErro("");
    try {
      const r = await fetch(`/api/f/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados, armadilha }),
      });
      const d = await r.json();
      if (!r.ok)
        throw new Error(d.error || "Não foi possível enviar. Tente novamente.");
      setFase("enviado");
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Falha de conexão. Suas respostas continuam aqui.",
      );
      setFase("respondendo");
    } finally {
      enviando.current = false;
    }
  }
  return (
    <div className="observatorio public-assessment">
      <header className="public-header">
        <div className="public-brand">
          <Icone nome="compass" size={27} />
          <strong>bússola</strong>
        </div>
        <span>UM NOVO OLHAR COMEÇA COM VOCÊ</span>
      </header>
      <main className="public-main">
        {fase === "enviado" ? (
          <section className="public-success obs-panel" role="status">
            <div className="success-orbit">
              <Icone nome="check" size={36} />
            </div>
            <p className="eyebrow">SUA VOZ AGORA FAZ PARTE DO MAPA</p>
            <h1>
              Obrigado por abrir
              <br />
              <em>novos caminhos.</em>
            </h1>
            <p>{agradecimento || "Sua resposta foi registrada."}</p>
            <p className="small-note">
              O gestor reunirá as percepções do grupo para construir o
              diagnóstico. Você já pode fechar esta página.
            </p>
          </section>
        ) : (
          <>
            <div className="public-intro">
              <p className="eyebrow">ASSESSMENT DE INOVAÇÃO / {nome}</p>
              <h1>{titulo}</h1>
              <p>{descricao}</p>
            </div>
            <div className="public-progress">
              <div>
                <span>
                  ETAPA {etapa + 1} DE {secoes.length}
                </span>
                <span>
                  {respondidas} de {campos.length} campos respondidos
                </span>
              </div>
              <div className="progress-track">
                <i
                  style={{ width: `${((etapa + 1) / secoes.length) * 100}%` }}
                />
              </div>
            </div>
            <div className="public-layout">
              <form className="obs-panel respondent-form" onSubmit={enviar}>
                <div className="respondent-section">
                  <span className="group-avatar">
                    <Icone
                      nome={etapa === secoes.length - 1 ? "people" : "compass"}
                    />
                  </span>
                  <div>
                    <p className="eyebrow">
                      {String(etapa + 1).padStart(2, "0")} / SUA PERSPECTIVA
                    </p>
                    <h2 ref={tituloRef} tabIndex={-1}>
                      {secao}
                    </h2>
                  </div>
                </div>
                <p className="respondent-help">
                  Não há resposta certa. Pense no que acontece hoje, no dia a
                  dia do seu grupo.
                </p>
                <label
                  className="absolute -left-[9999px] w-px h-px overflow-hidden"
                  aria-hidden="true"
                >
                  Deixe em branco
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={armadilha}
                    onChange={(e) => setArmadilha(e.target.value)}
                  />
                </label>
                <fieldset
                  disabled={fase === "enviando"}
                  className="respondent-fields"
                >
                  {visiveis.map((c, i) => (
                    <div className="respondent-question" key={c.chave}>
                      {c.tipo === "escala" || c.tipo === "nota" ? (
                        <fieldset>
                          <legend>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            {c.rotulo}
                            {!c.obrigatorio && <small>Opcional</small>}
                          </legend>
                          <div className="respondent-scale">
                            {Array.from(
                              {
                                length:
                                  (c.max ?? (c.tipo === "nota" ? 10 : 5)) -
                                  (c.min ?? (c.tipo === "nota" ? 0 : 1)) +
                                  1,
                              },
                              (_, n) =>
                                (c.min ?? (c.tipo === "nota" ? 0 : 1)) + n,
                            ).map((n) => (
                              <label
                                key={n}
                                className={
                                  dados[c.chave] === String(n) ? "selected" : ""
                                }
                              >
                                <input
                                  type="radio"
                                  name={c.chave}
                                  value={n}
                                  required={c.obrigatorio}
                                  checked={dados[c.chave] === String(n)}
                                  onChange={() => set(c.chave, String(n))}
                                />
                                <span>{n}</span>
                              </label>
                            ))}
                          </div>
                          <div className="scale-anchors">
                            <span>{c.rotuloMin || "Não existe"}</span>
                            <span>{c.rotuloMax || "Consolidado"}</span>
                          </div>
                        </fieldset>
                      ) : c.tipo === "escolha" ? (
                        <fieldset>
                          <legend>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            {c.rotulo}
                          </legend>
                          <div className="public-options">
                            {c.opcoes?.map((o) => (
                              <label key={o.valor}>
                                <input
                                  type="radio"
                                  name={c.chave}
                                  required={c.obrigatorio}
                                  checked={dados[c.chave] === o.valor}
                                  onChange={() => set(c.chave, o.valor)}
                                />
                                {o.rotulo}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : (
                        <label className="respondent-text">
                          <span>
                            <b>{String(i + 1).padStart(2, "0")}</b>
                            {c.rotulo}
                            {!c.obrigatorio && <small>Opcional</small>}
                          </span>
                          {c.tipo === "textarea" ? (
                            <textarea
                              required={c.obrigatorio}
                              maxLength={4000}
                              rows={4}
                              placeholder="Sua experiência traz contexto para os números…"
                              value={dados[c.chave] ?? ""}
                              onChange={(e) => set(c.chave, e.target.value)}
                            />
                          ) : (
                            <input
                              required={c.obrigatorio}
                              maxLength={150}
                              value={dados[c.chave] ?? ""}
                              onChange={(e) => set(c.chave, e.target.value)}
                            />
                          )}
                        </label>
                      )}
                    </div>
                  ))}
                </fieldset>
                {erro && (
                  <div className="obs-alert error" role="alert">
                    {erro}
                  </div>
                )}
                <div className="respondent-actions">
                  {etapa > 0 ? (
                    <button
                      type="button"
                      className="text-link"
                      disabled={fase === "enviando"}
                      onClick={() => ir(etapa - 1)}
                    >
                      ← Voltar
                    </button>
                  ) : (
                    <span>Um passo de cada vez.</span>
                  )}
                  <button
                    type="submit"
                    className="obs-btn primary"
                    disabled={fase === "enviando"}
                  >
                    {fase === "enviando"
                      ? "Enviando sua perspectiva…"
                      : etapa < secoes.length - 1
                        ? "Próxima dimensão"
                        : "Enviar minha perspectiva"}
                    <Icone nome="arrow" size={16} />
                  </button>
                </div>
              </form>
              <aside className="respondent-guide">
                <span className="agent-avatar mint">
                  <Icone nome="compass" />
                </span>
                <h3>
                  Sua experiência
                  <br />
                  <em>é o ponto de partida.</em>
                </h3>
                <p>
                  Responda com base na sua percepção. Diferenças entre as
                  pessoas ajudam a encontrar oportunidades.
                </p>
                <div className="guide-scale">
                  <strong>COMO LER A ESCALA</strong>
                  <span>
                    <b>1</b> Não existe
                  </span>
                  <span>
                    <b>2</b> Iniciativas isoladas
                  </span>
                  <span>
                    <b>3</b> Em estruturação
                  </span>
                  <span>
                    <b>4</b> Prática consistente
                  </span>
                  <span>
                    <b>5</b> Consolidado
                  </span>
                </div>
                <p className="small-note">
                  Não pedimos nome ou e-mail. Área e cargo são opcionais. Suas
                  respostas ficam disponíveis ao gestor.
                </p>
              </aside>
            </div>
          </>
        )}
        <footer className="public-footer">
          <Icone nome="compass" size={14} /> Bússola · clareza para transformar.
        </footer>
      </main>
    </div>
  );
}
