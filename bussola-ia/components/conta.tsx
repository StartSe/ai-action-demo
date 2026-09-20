"use client";
// Acesso ao espaço do gestor, com a mesma identidade do observatório.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Field } from "./ui";
import { MarcaBussola } from "./observatorio/EstruturaObservatorio";
import { Icone } from "./observatorio/Icone";
import { REGRA_SENHA, emailInvalido, forcaSenha, senhaFraca } from "@/lib/conta-comum";

function proximoDestino() {
  const next = new URLSearchParams(location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

function EstruturaAcesso({ children }: { children: ReactNode }) {
  return <main className="observatorio access-page">
    <section className="access-story" aria-label="Conheça a Bússola">
      <MarcaBussola />
      <div className="access-story-content"><p className="eyebrow">SEU OBSERVATÓRIO DE INOVAÇÃO</p><h2>Um novo olhar.<br /><em>Novos movimentos.</em></h2><p>Conheça o horizonte do seu time. Transforme as respostas de cada grupo em clareza para decidir o próximo passo.</p>
        <div className="access-orbit" aria-hidden="true"><span /><span /><span /><Icone nome="compass" size={105} /><i className="orbit-point first" /><i className="orbit-point second" /><i className="orbit-point third" /></div>
        <div className="access-pillars"><span><Icone nome="people" size={16} /> Pessoas</span><span><Icone nome="spark" size={16} /> Inteligência</span><span><Icone nome="target" size={16} /> Ação</span></div>
      </div>
      <p className="access-signature">BÚSSOLA <span>/</span> clareza para transformar.</p>
    </section>
    <section className="access-form-area" aria-label="Acesso ao painel"><div className="access-form"><p className="eyebrow">ESPAÇO DO GESTOR</p>{children}<p className="access-footnote"><Icone nome="shield" size={15} /> Um espaço para acompanhar a evolução do seu time.</p></div></section>
  </main>;
}

function CaixaDeErro({ mensagem }: { mensagem: string }) {
  return <div role="alert" className="mb-4 px-4 py-3 rounded-[10px] text-sm border bg-[#fde8e6] border-[#f5c2bd] text-danger">{mensagem}</div>;
}

type ErrosCriacao = Partial<Record<"nome" | "email" | "senha" | "confirmarSenha", string>>;

export function TelaCriarConta() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erros, setErros] = useState<ErrosCriacao>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avisoDisco, setAvisoDisco] = useState(false);

  useEffect(() => {
    fetch("/api/conta").then((r) => r.json()).then((r) => {
      setAvisoDisco(Boolean(r.discoEfemero));
      if (r.existe) router.replace(`/entrar?next=${encodeURIComponent(proximoDestino())}`);
    }).catch(() => {});
  }, [router]);

  function validar(): ErrosCriacao {
    const novosErros: ErrosCriacao = {};
    if (!nome.trim()) novosErros.nome = "Escreva o seu nome.";
    const erroEmail = emailInvalido(email);
    if (erroEmail) novosErros.email = erroEmail;
    const erroSenha = senhaFraca(senha);
    if (erroSenha) novosErros.senha = erroSenha;
    else if (confirmarSenha !== senha) novosErros.confirmarSenha = "As senhas não são iguais.";
    return novosErros;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const novosErros = validar();
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;
    setEnviando(true);
    setErroGeral(null);
    try {
      const r = await fetch("/api/conta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, email, senha, confirmarSenha }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível criar a conta.");
      location.href = proximoDestino();
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : "Não foi possível criar a conta.");
      setEnviando(false);
    }
  }

  const forca = forcaSenha(senha);

  return (
    <EstruturaAcesso>
          <h1 className="access-title">Criar sua conta</h1>
          <p className="text-muted text-[13.5px] mb-5">Comece seu espaço de gestão. As conexões com IA e outros serviços são configuradas por você.</p>

          {erroGeral && <CaixaDeErro mensagem={erroGeral} />}

          <form onSubmit={onSubmit} noValidate>
            <Field label="Seu nome" htmlFor="nome" hint="Aparece só na tela.">
              <input id="nome" aria-invalid={Boolean(erros.nome)} aria-describedby={erros.nome ? "erro-nome" : undefined} className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
              {erros.nome && <p role="alert" id="erro-nome" className="text-[12.5px] text-danger mt-1">{erros.nome}</p>}
            </Field>
            <Field label="E-mail" htmlFor="email" hint="Vai ser usado para entrar no app.">
              <input id="email" aria-invalid={Boolean(erros.email)} aria-describedby={erros.email ? "erro-email" : undefined} type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              {erros.email && <p role="alert" id="erro-email" className="text-[12.5px] text-danger mt-1">{erros.email}</p>}
            </Field>
            <Field label="Senha" htmlFor="senha" hint={REGRA_SENHA}>
              <input id="senha" aria-invalid={Boolean(erros.senha)} aria-describedby={erros.senha ? "erro-senha" : undefined} type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
              {senha && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex gap-1.5 flex-1" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full ${i < forca.nivel ? (forca.nivel <= 2 ? "bg-warn" : "bg-ok") : "bg-line"}`} />
                    ))}
                  </div>
                  <span className="text-[12px] text-muted shrink-0">{forca.rotulo}</span>
                </div>
              )}
              {erros.senha && <p role="alert" id="erro-senha" className="text-[12.5px] text-danger mt-1">{erros.senha}</p>}
            </Field>
            <Field label="Confirmar senha" htmlFor="confirmarSenha">
              <input id="confirmarSenha" aria-invalid={Boolean(erros.confirmarSenha)} aria-describedby={erros.confirmarSenha ? "erro-confirmarSenha" : undefined} type="password" className="input" value={confirmarSenha} onChange={(e) => setConfirmarSenha(e.target.value)} autoComplete="new-password" />
              {erros.confirmarSenha && <p role="alert" id="erro-confirmarSenha" className="text-[12.5px] text-danger mt-1">{erros.confirmarSenha}</p>}
            </Field>
            <button type="submit" className="btn-primary mt-1" disabled={enviando}>{enviando ? "Criando conta" : "Criar conta e começar"}</button>
          </form>

          {avisoDisco && (
            <p className="text-muted text-[12px] mt-4">Neste plano a conta e as configurações se perdem a cada nova publicação. Para manter, a equipe técnica adiciona um disco em Opções avançadas do Blueprint.</p>
          )}
    </EstruturaAcesso>
  );
}

export function TelaEntrar() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErroGeral(null);
    try {
      const r = await fetch("/api/conta/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) });
      const resposta = await r.json();
      if (!r.ok) throw new Error(resposta.error || "Não foi possível entrar.");
      location.href = proximoDestino();
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  }

  return (
    <EstruturaAcesso>
          <h1 className="access-title">Entrar</h1><p className="access-intro">Bom ter você de volta. Seu próximo movimento começa aqui.</p>

          {erroGeral && <CaixaDeErro mensagem={erroGeral} />}

          <form onSubmit={onSubmit}>
            <Field label="E-mail" htmlFor="email">
              <input id="email" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <Field label="Senha" htmlFor="senha">
              <input id="senha" type="password" className="input" required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
            </Field>
            <button type="submit" className="btn-primary mt-1" disabled={enviando}>{enviando ? "Entrando" : "Entrar"}</button>
          </form>
    </EstruturaAcesso>
  );
}
