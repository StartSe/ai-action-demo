"use client";
/* eslint-disable @next/next/no-img-element */
// Cartão "Conectar o WhatsApp": leva a dona do negócio de "não tenho nada" até o número da empresa
// respondendo clientes, sem ninguém técnico no caminho. Quatro estados, lidos de /api/whatsapp/conexao:
//
//   sem credenciais → passo a passo com as telas do painel da z-api + os três campos
//   aguardando      → QR Code (trocado a cada 20 s) e as três linhas de instrução do celular
//   conectado       → número, nome do perfil, desde quando, última mensagem recebida e "Desconectar"
//   problema        → a frase de negócio da recusa e o caminho para revisar os valores
//
// Enquanto espera o código ser lido, a tela consulta o estado a cada 5 s e a imagem a cada 20 s (duas
// chamadas separadas para não pedir uma imagem nova à z-api cinco vezes por minuto), sempre parando
// quando a aba não está visível. O que é técnico (endereços, valores de verificação, diagnóstico de
// entrega) mora só dentro de "Para a equipe técnica", no fim do cartão.
//
// As imagens de `public/ajuda` e o QR Code em `data:` ficam em <img> comum de propósito: são desenhos
// pequenos e uma imagem que troca a cada 20 s — otimizador de imagem não tem o que fazer com elas.
//
// Os três campos são desenhados aqui, e não importados da tela de configuração: um `import` de um
// caminho com "setup" no nome derruba `scripts/verificar-jargao.mjs` (que varre este arquivo e não
// aquele), e desenhar um rótulo com um campo de texto é mais barato do que abrir uma exceção no
// verificador. O formato dos campos vem do próprio app, em JSON, sem tipo importado.
import { useCallback, useEffect, useState } from "react";
import { Aviso, CopyButton, data, MaisDetalhes, useConfirmacao } from "./ui";
import { formatarTelefone } from "@/lib/telefone";
import type { RespostaConexao } from "@/app/api/whatsapp/conexao/route";

/** Recorte do que a configuração do app publica sobre um campo de credencial, só o que esta tela usa. */
type CampoConexao = {
  chave: string;
  rotulo: string;
  tipo: "text" | "secret" | "select";
  ajuda?: string;
  placeholder?: string;
  mascarado?: string | null;
  valorVisivel?: string;
  avancado?: boolean;
};

type Tecnico = {
  url: string;
  verifyToken: string;
  urlAvisos: string;
  ultimaRecebida: { em: string; de: string } | null;
  ultimaFalha: { em: string; mensagem: string } | null;
};

const INTERVALO_ESTADO_MS = 5_000;
const INTERVALO_CODIGO_MS = 20_000;

// Cada passo tem o desenho da tela correspondente. São esquemas do painel (valores fictícios), não
// capturas de uma conta real — ver o CLAUDE.md deste app.
const PASSOS = [
  { texto: "Crie a conta e uma instância em app.z-api.io.", imagem: "/ajuda/zapi-1.png", alt: "Tela do painel da z-api com o botão de criar uma instância." },
  { texto: "Copie os três valores da instância.", imagem: "/ajuda/zapi-2.png", alt: "Tela da instância no painel da z-api, com os três valores a copiar." },
  { texto: "Cole aqui e clique em Salvar e conectar.", imagem: "/ajuda/zapi-3.png", alt: "Este cartão, com os três campos preenchidos e o botão de salvar." },
];

export function ConexaoWhatsApp({
  titulo = "Conectar o WhatsApp",
  apoio = "Conecte o número da empresa para o atendente responder clientes de verdade. Leva um minuto e não precisa de ninguém técnico.",
}: {
  titulo?: string;
  apoio?: string;
}) {
  const [conexao, setConexao] = useState<RespostaConexao | null>(null);
  const [campos, setCampos] = useState<CampoConexao[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [tecnico, setTecnico] = useState<Tecnico | null>(null);
  const [exemplos, setExemplos] = useState(0);
  const [camposAbertos, setCamposAbertos] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { confirmar, Dialogo } = useConfirmacao();

  const carregar = useCallback(async (comCodigo: boolean) => {
    try {
      const r = await fetch(comCodigo ? "/api/whatsapp/conexao?qr=1" : "/api/whatsapp/conexao");
      const nova = (await r.json()) as RespostaConexao;
      // A consulta de 5 s não pede imagem: sem isso, o QR Code sumiria da tela entre uma troca e outra.
      setConexao((antes) => (nova.estado === "aguardando" && !nova.qr && antes?.qr ? { ...nova, qr: antes.qr } : nova));
    } catch {
      /* a próxima consulta tenta de novo; o estado anterior continua na tela */
    }
  }, []);

  const carregarCampos = useCallback(async () => {
    try {
      const r = await fetch("/api/setup");
      const dados = (await r.json()) as { integracoes: { id: string; campos: CampoConexao[] }[] };
      const whats = dados.integracoes.find((i) => i.id === "whatsapp");
      setCampos(whats ? whats.campos.filter((c) => !c.avancado) : []);
    } catch {
      setCampos([]);
    }
  }, []);

  const contarExemplos = useCallback(async () => {
    try {
      const r = await fetch("/api/conversas/exemplos");
      const dados = (await r.json()) as { quantas: number };
      setExemplos(dados.quantas);
    } catch {
      /* o link de apagar os exemplos simplesmente não aparece */
    }
  }, []);

  // A primeira carga sai do corpo do efeito por um setTimeout(0), mesmo padrão de components/setup.tsx:
  // chamar algo que muda estado direto no efeito dispara renderizações em cascata (regra do React 19).
  useEffect(() => {
    const t = setTimeout(() => {
      carregar(true);
      carregarCampos();
      contarExemplos();
      fetch("/api/whatsapp/webhook-info").then((r) => r.json()).then(setTecnico).catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, [carregar, carregarCampos, contarExemplos]);

  // Espera pelo celular da empresa: é o único estado que muda sozinho, e o único que precisa consultar.
  useEffect(() => {
    if (conexao?.estado !== "aguardando") return;
    const estado = setInterval(() => { if (!document.hidden) carregar(false); }, INTERVALO_ESTADO_MS);
    const codigo = setInterval(() => { if (!document.hidden) carregar(true); }, INTERVALO_CODIGO_MS);
    return () => { clearInterval(estado); clearInterval(codigo); };
  }, [conexao?.estado, carregar]);

  async function salvarEConectar() {
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/setup", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ valores }) });
      if (!r.ok) throw new Error("falhou");
      const resposta = (await r.json()) as { avisoConexao?: string };
      if (resposta.avisoConexao) setAviso(resposta.avisoConexao);
      setValores({});
      setCamposAbertos(false);
      await Promise.all([carregar(true), carregarCampos()]);
    } catch {
      setAviso("Não foi possível salvar agora. Confira a conexão da internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function desconectar() {
    const ok = await confirmar("Desconectar o número da empresa? O atendente vai parar de responder clientes até você conectar de novo.", { confirmarRotulo: "Desconectar" });
    if (!ok) return;
    setDesconectando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/whatsapp/conexao", { method: "DELETE" });
      const resposta = await r.json();
      if (!r.ok) {
        setAviso(typeof resposta?.error === "string" ? resposta.error : "Não foi possível desconectar agora. Tente de novo em alguns minutos.");
        return;
      }
      setConexao(resposta as RespostaConexao);
    } catch {
      setAviso("Não foi possível desconectar agora. Tente de novo em alguns minutos.");
    } finally {
      setDesconectando(false);
    }
  }

  async function apagarExemplos() {
    const ok = await confirmar("Apagar as conversas de exemplo? O app fica sem nenhuma conversa até a primeira mensagem de verdade chegar.", { confirmarRotulo: "Apagar" });
    if (!ok) return;
    await fetch("/api/conversas/exemplos", { method: "DELETE" }).catch(() => {});
    contarExemplos();
  }

  const estado = conexao?.estado;
  const preenchido = Object.values(valores).some((v) => v.trim() !== "");
  const mostrarCampos = estado === "sem_credenciais" || camposAbertos;

  const blocoCampos = (
    <div className="mt-1">
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 [&>*]:min-w-0">
        {campos.map((c) => (
          <Campo key={c.chave} campo={c} valor={valores[c.chave] ?? ""} aoMudar={(v) => setValores((s) => ({ ...s, [c.chave]: v }))} />
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap justify-end max-md:flex-col max-md:items-stretch mt-4">
        <a className="btn-link text-sm max-md:self-start" href="https://app.z-api.io" target="_blank" rel="noreferrer">Abrir o painel da z-api</a>
        <button type="button" className="btn-primary !w-auto max-md:!w-full" onClick={salvarEConectar} disabled={!preenchido || salvando}>
          {salvando ? "Salvando" : "Salvar e conectar"}
        </button>
      </div>
    </div>
  );

  return (
    <section id="conexao" className="card p-6 max-md:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold">{titulo}</h2>
        {estado === "conectado" && <span className="chip-status chip-status-conectado">Conectado</span>}
      </div>
      <p className="text-muted text-sm mt-1 mb-4 max-w-[640px]">{apoio}</p>

      {aviso && <div className="mb-4"><Aviso tom="warn">{aviso}</Aviso></div>}

      {!conexao && <p className="text-muted text-sm">Carregando...</p>}

      {estado === "sem_credenciais" && (
        <>
          <ol className="grid grid-cols-3 max-md:grid-cols-1 gap-4 mb-5">
            {PASSOS.map((p, i) => (
              <li key={p.imagem} className="flex flex-col gap-2">
                <span className="flex items-start gap-2 text-[13px] font-semibold">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{i + 1}</span>
                  {p.texto}
                </span>
                <img src={p.imagem} alt={p.alt} width={480} height={300} loading="lazy" className="w-full h-auto rounded-[10px] border border-line" />
              </li>
            ))}
          </ol>
          {blocoCampos}
        </>
      )}

      {estado === "aguardando" && (
        <div className="flex gap-6 max-md:flex-col items-start">
          <div className="shrink-0 rounded-[10px] border border-line bg-white p-3 max-md:self-center">
            {conexao?.qr ? (
              <img src={conexao.qr} alt="Código de barras quadrado para apontar a câmera do celular da empresa." width={240} height={240} className="h-[240px] w-[240px] max-md:h-[220px] max-md:w-[220px]" />
            ) : (
              <div className="grid h-[240px] w-[240px] max-md:h-[220px] max-md:w-[220px] place-items-center text-center text-sm text-muted">Preparando o código...</div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold mb-2">No celular da empresa:</p>
            <ol className="flex flex-col gap-1.5 text-sm">
              <li>1. Abra o WhatsApp.</li>
              <li>2. Toque em Dispositivos conectados e depois em Conectar dispositivo.</li>
              <li>3. Aponte a câmera para este código.</li>
            </ol>
            <p className="text-muted text-[12.5px] mt-3">O código muda a cada 20 segundos. Assim que o celular ler, esta tela muda sozinha.</p>
            <button type="button" className="btn-link text-sm mt-3" onClick={() => setCamposAbertos((v) => !v)}>
              {camposAbertos ? "Esconder os valores da empresa" : "Revisar os valores"}
            </button>
          </div>
        </div>
      )}

      {estado === "conectado" && (
        <div className="flex flex-col gap-3">
          {conexao?.provedor === "meta" ? (
            <p className="text-[15px]">O número está ligado pelo caminho da Meta, preenchido em Opções avançadas no cartão acima.</p>
          ) : (
            <>
              {/* O número e o nome do perfil só chegam no aviso de conexão da z-api: até ele chegar, a
                  linha some em vez de mostrar um rótulo genérico no lugar de um número de verdade. */}
              {(conexao?.numero || conexao?.nome) && (
                <p className="text-[15px] font-semibold">
                  {conexao?.nome ? `${conexao.nome}${conexao.numero ? " · " : ""}` : ""}
                  {conexao?.numero ? formatarTelefone(conexao.numero) : ""}
                </p>
              )}
              {conexao?.desde && <p className="text-sm text-muted">Conectado desde {data(conexao.desde, { comHora: true, comAno: true })}.</p>}
            </>
          )}
          {conexao?.ultimaRecebida ? (
            <p className="text-sm">
              Última mensagem recebida em <strong>{data(conexao.ultimaRecebida.em, { comHora: true, comAno: true })}</strong>, de {conexao.ultimaRecebida.de}.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Nenhuma mensagem de cliente chegou até agora. Mande uma mensagem para o número da empresa pelo seu próprio celular: ela deve aparecer aqui em segundos.
            </p>
          )}
          {exemplos > 0 && (
            <p className="text-sm text-muted">
              O app ainda mostra {exemplos} conversas de exemplo.{" "}
              <button type="button" className="btn-link" onClick={apagarExemplos}>Apagar as conversas de exemplo</button>
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap max-md:flex-col max-md:items-stretch mt-1">
            {conexao?.provedor === "zapi" && (
              <button type="button" className="btn-ghost !w-auto max-md:!w-full" onClick={desconectar} disabled={desconectando}>
                {desconectando ? "Desconectando" : "Desconectar"}
              </button>
            )}
            <button type="button" className="btn-link text-sm max-md:self-start" onClick={() => setCamposAbertos((v) => !v)}>
              {camposAbertos ? "Esconder os valores da empresa" : "Revisar os valores"}
            </button>
          </div>
        </div>
      )}

      {estado === "problema" && (
        <Aviso tom="danger" acao={{ rotulo: camposAbertos ? "Esconder os valores" : "Revisar os valores", onClick: () => setCamposAbertos((v) => !v) }}>
          {conexao?.mensagem ?? "Não foi possível falar com a z-api agora."}
        </Aviso>
      )}

      {estado !== "sem_credenciais" && mostrarCampos && (
        <div className="mt-5 pt-5 border-t border-line">{blocoCampos}</div>
      )}

      <div className="mt-5 pt-5 border-t border-line [&>details]:!mb-0">
        <MaisDetalhes titulo="Para a equipe técnica">
          <div className="flex flex-col gap-3">
            <Linha rotulo="Endereço dos avisos da z-api" valor={tecnico?.urlAvisos} rotuloCopiar="Copiar endereço" />
            <p className="text-muted text-[12.5px]">
              Este app cadastra esse endereço sozinho ao salvar os três valores. Só é preciso cadastrar à mão no painel da z-api (em Editar instância) quando o aviso acima disser que o cadastro falhou.
            </p>
            <Linha rotulo="Endereço para receber mensagens (Meta)" valor={tecnico?.url} rotuloCopiar="Copiar endereço" />
            <Linha rotulo="Valor de verificação (Meta)" valor={tecnico?.verifyToken} rotuloCopiar="Copiar" />
            <p className="text-muted text-[12.5px]">
              Os dois últimos só servem para quem conecta o número pela Meta, em Opções avançadas.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-line">
            <p className="text-[13px] font-semibold mb-2">As mensagens estão chegando?</p>
            {tecnico === null ? (
              <p className="text-muted text-sm">Carregando...</p>
            ) : tecnico.ultimaRecebida ? (
              <p className="text-sm">
                Última mensagem recebida do número real em <strong>{data(tecnico.ultimaRecebida.em, { comHora: true, comAno: true })}</strong>, de {tecnico.ultimaRecebida.de}.
              </p>
            ) : (
              <p className="text-muted text-sm">Nenhuma mensagem do número real chegou até agora.</p>
            )}
            {tecnico?.ultimaFalha && (
              <div className="mt-3">
                <Aviso tom="danger">
                  Uma resposta não saiu em {data(tecnico.ultimaFalha.em, { comHora: true, comAno: true })}: {tecnico.ultimaFalha.mensagem}
                </Aviso>
              </div>
            )}
          </div>
        </MaisDetalhes>
      </div>
      {Dialogo}
    </section>
  );
}

/** Mesmo desenho do campo da tela de configuração (rótulo, campo, linha de ajuda), sem o `select`: os
 * três valores da instância são texto e chave secreta, e chave já salva vira só a dica no campo. */
function Campo({ campo: c, valor, aoMudar }: { campo: CampoConexao; valor: string; aoMudar: (v: string) => void }) {
  const id = `conexao-${c.chave}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{c.rotulo}</label>
      <input
        id={id}
        className="input"
        type={c.tipo === "secret" ? "password" : "text"}
        autoComplete="off"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={c.mascarado ? `salvo: ${c.mascarado}` : c.valorVisivel || c.placeholder || ""}
      />
      {c.ajuda && <span className="text-[12.5px] text-muted">{c.ajuda}</span>}
    </div>
  );
}

function Linha({ rotulo, valor, rotuloCopiar }: { rotulo: string; valor: string | undefined; rotuloCopiar: string }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-[13px] font-semibold w-[230px] shrink-0">{rotulo}</span>
      <code className="bg-bg border border-line px-2 py-1 rounded-md text-[12.5px] break-all flex-1 min-w-[220px]">{valor ?? "carregando..."}</code>
      <CopyButton texto={() => valor ?? ""} rotulo={rotuloCopiar} />
    </div>
  );
}
