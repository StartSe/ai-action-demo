"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import {
  Boxes,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Gem,
  Globe,
  MessageSquare,
  MessageSquareText,
  MousePointer2,
  Plug,
  PowerOff,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  DeploymentKeyStatus,
  KEY_ACTION_LABELS,
  KEY_REVEAL_NOTICE,
  RevokeKeyDialog,
  RotateKeyDialog,
  SECURITY_PRACTICES,
  SECURITY_PRACTICES_TITLE,
  SecurityPracticesList,
  UnpublishDialog,
  useClientClock,
} from "@/components/app/deployment-key-controls";
import {
  DeploymentPageHeader,
  type DeploymentMenuItem,
  type DeploymentPrimaryAction,
} from "@/components/app/deployment-page-header";
import type { DeploymentFormField } from "@/components/deployment-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  publishMcpDeployment,
  revokeMcpKey,
  rotateMcpKey,
  saveMcpDeployment,
  unpublishMcpDeployment,
} from "./actions";

export type McpDeploymentState = {
  status: "draft" | "published";
  fields: string[];
  apiKeyPrefix: string | null;
  /** Expiração (ISO) da chave anterior em graça após rotação (US-039) */
  previousKeyExpiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  /** Nome do deployment — título do servidor e da tool no cliente MCP */
  title: string;
  /** Descrição curta injetada nas instructions/descrições do servidor */
  description: string | null;
};

const TYPE_LABELS: Record<DeploymentFormField["type"], string> = {
  number: "número",
  category: "categoria",
  text: "texto",
  date: "data (AAAA-MM-DD)",
  id: "texto",
};

const KEY_PLACEHOLDER = "SUA_CHAVE_API";

// Mensagens de validação: aparecem junto do campo e no `title` da ação primária
const SERVER_NAME_REQUIRED = "Informe um nome para o servidor.";
const FIELDS_REQUIRED = "Selecione pelo menos um campo.";
/** Quem usa a chave, para o texto dos diálogos de confirmação */
const CONSUMERS_LABEL = "Agentes conectados com a chave";

type AgentId =
  | "claude"
  | "claude-code"
  | "chatgpt"
  | "cursor"
  | "vscode"
  | "gemini-cli"
  | "other";

// Ícones genéricos do lucide — sem logomarcas de terceiros
const AGENTS: { id: AgentId; name: string; icon: LucideIcon }[] = [
  { id: "claude", name: "Claude", icon: Sparkles },
  { id: "claude-code", name: "Claude Code", icon: SquareTerminal },
  { id: "chatgpt", name: "ChatGPT", icon: MessageSquare },
  { id: "cursor", name: "Cursor", icon: MousePointer2 },
  { id: "vscode", name: "VS Code", icon: Code2 },
  { id: "gemini-cli", name: "Gemini CLI", icon: Gem },
  { id: "other", name: "Outro (genérico)", icon: Boxes },
];

/**
 * Agentes em destaque na faixa "Depois de publicar, conecte a:" do rascunho
 * (PRD UX 2026-09, US-002). Os demais de AGENTS aparecem no tooltip "e outros".
 */
const FEATURED_AGENT_IDS = [
  "claude",
  "chatgpt",
  "cursor",
  "vscode",
] as const satisfies readonly AgentId[];

const FEATURED_AGENTS = FEATURED_AGENT_IDS.map((id) =>
  AGENTS.find((agent) => agent.id === id)!,
);
const OTHER_AGENTS = AGENTS.filter(
  (agent) => !(FEATURED_AGENT_IDS as readonly AgentId[]).includes(agent.id),
);

const CONNECT_LATER_LABEL = "Depois de publicar, conecte a:";
const OTHER_AGENTS_CHIP_LABEL = "e outros";
/** Link discreto abaixo da grade de agentes — seleciona "Outro (genérico)". */
const GENERIC_LINK_LABEL = "Ver URL e header genéricos";
/** `<details>` do passo 1 na tela publicada (US-003). */
const SERVER_CONFIG_TITLE = "Configuração do servidor";
const UNSAVED_BADGE_LABEL = "Alterações não salvas";

/** Stepper de uma linha: passo 1 em rascunho, passo 2 quando publicado. */
const STEPS: { icon: LucideIcon; label: string }[] = [
  { icon: Globe, label: "Configurar" },
  { icon: Plug, label: "Conectar" },
  { icon: MessageSquareText, label: "Usar" },
];

type InstructionStep = { text: string; code?: string };

/** Instruções de conexão específicas por agente, com a URL e a chave reais. */
function buildInstructions(
  agentId: AgentId,
  url: string,
  key: string,
  serverName: string,
): InstructionStep[] {
  const authHeader = `Authorization: Bearer ${key}`;
  const jsonHeaders = { Authorization: `Bearer ${key}` };
  const urlWithKey = `${url}?token=${key}`;
  switch (agentId) {
    case "claude":
      return [
        {
          text: "No Claude (web ou desktop), abra Configurações → Conectores → “Adicionar conector personalizado”.",
        },
        {
          text: "Cole a URL abaixo (a chave já vai embutida) no campo de URL remota:",
          code: urlWithKey,
        },
        {
          text: "Em Authentication, escolha “None” — a chave na URL já autentica (o servidor usa chave de API, não OAuth).",
        },
      ];
    case "claude-code":
      return [
        {
          text: "No terminal, adicione o servidor com o comando abaixo e confirme com /mcp:",
          code: `claude mcp add --transport http automl ${url} --header "${authHeader}"`,
        },
      ];
    case "chatgpt":
      return [
        {
          text: "No ChatGPT, ative o modo desenvolvedor e abra Configurações → Conectores → “Criar”.",
        },
        {
          text: "Informe a URL do servidor MCP com a chave embutida e escolha “Sem autenticação”:",
          code: urlWithKey,
        },
      ];
    case "cursor":
      return [
        {
          text: "Adicione ao arquivo ~/.cursor/mcp.json (ou ao mcp.json do projeto):",
          code: JSON.stringify(
            { mcpServers: { [serverName]: { url, headers: jsonHeaders } } },
            null,
            2,
          ),
        },
      ];
    case "vscode":
      return [
        {
          text: "Adicione ao arquivo .vscode/mcp.json (ou via comando “MCP: Add Server”):",
          code: JSON.stringify(
            {
              servers: {
                [serverName]: { type: "http", url, headers: jsonHeaders },
              },
            },
            null,
            2,
          ),
        },
      ];
    case "gemini-cli":
      return [
        {
          text: "Adicione ao arquivo ~/.gemini/settings.json:",
          code: JSON.stringify(
            {
              mcpServers: {
                [serverName]: { httpUrl: url, headers: jsonHeaders },
              },
            },
            null,
            2,
          ),
        },
      ];
    case "other":
      return [
        {
          text: "Cliente que só tem campo de URL: use a URL com a chave embutida:",
          code: urlWithKey,
        },
        {
          text: "Cliente com suporte a servidores MCP remotos (Streamable HTTP): configure com a URL e o header, ou use o JSON:",
          code: JSON.stringify(
            { mcpServers: { [serverName]: { url, headers: jsonHeaders } } },
            null,
            2,
          ),
        },
        {
          text: "Cliente que só roda servidores locais (stdio): use a ponte mcp-remote, que traduz para HTTP:",
          code: JSON.stringify(
            {
              mcpServers: {
                [serverName]: {
                  command: "npx",
                  args: ["-y", "mcp-remote", url, "--header", authHeader],
                },
              },
            },
            null,
            2,
          ),
        },
      ];
  }
}

/** Nome do servidor no JSON do cliente MCP, derivado do nome do projeto. */
function slugifyServerName(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "automl-predict";
}

function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Configuração do deployment MCP (US-047, reformulada na US-051 no estilo
 * "New MCP server" do Zapier e simplificada na PRD UX 2026-09): stepper de
 * uma linha; em rascunho só o passo Configurar (nome, descrição, campos) com
 * a faixa de integrações não clicável; publicado vira a tela "Conectar":
 * chave, cards por agente de IA com busca e as instruções logo abaixo, com a
 * configuração do servidor recolhida num `<details>`. Mecânica de
 * campos/chave (mesma da API) preservada.
 */
export function McpConfig({
  projectId,
  projectName,
  modelFields,
  initial,
}: {
  projectId: string;
  projectName: string;
  modelFields: DeploymentFormField[];
  initial: McpDeploymentState | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        initial && initial.fields.length > 0
          ? initial.fields
          : modelFields.map((field) => field.name),
      ),
  );
  const [status, setStatus] = useState<"draft" | "published">(
    initial?.status ?? "draft",
  );
  // Nome do deployment — vira serverInfo.title, título da tool e instructions
  const [title, setTitle] = useState(initial?.title ?? projectName);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [keyPrefix, setKeyPrefix] = useState(initial?.apiKeyPrefix ?? null);
  // Chave em claro, disponível só até sair da tela (nunca volta do servidor)
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentId, setAgentId] = useState<AgentId | null>(null);
  // Chave anterior em graça (US-039): ISO da expiração, null sem rotação ativa
  const [previousKeyExpiresAt, setPreviousKeyExpiresAt] = useState<
    string | null
  >(initial?.previousKeyExpiresAt ?? null);
  const [isPending, startTransition] = useTransition();
  // Confirmações abertas pelo menu "Mais ações" do cabeçalho
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  // Relógio do cliente para "Último uso: há X min" / "expira em HH:MM"
  const now = useClientClock();
  // Bloco "Conectar ao {agente}" — rolado para a viewport ao escolher o agente
  const instructionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!agentId) return;
    const block = instructionsRef.current;
    if (!block) return;
    // Sem animação quando o sistema pede menos movimento
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    block.scrollIntoView({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [agentId]);

  // Última configuração persistida (null = ainda não existe deployment)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(
    initial
      ? JSON.stringify({
          fields: initial.fields,
          title: initial.title,
          description: initial.description ?? "",
        })
      : null,
  );

  // Origin só existe no client — snapshot vazio no servidor evita mismatch
  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );

  const selectedFields = useMemo(
    () => modelFields.filter((field) => selected.has(field.name)),
    [modelFields, selected],
  );
  const selectedNames = selectedFields.map((field) => field.name);
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const currentSnapshot = JSON.stringify({
    fields: selectedNames,
    title: trimmedTitle,
    description: trimmedDescription,
  });
  const dirty = savedSnapshot !== null && savedSnapshot !== currentSnapshot;
  const canSubmit = selectedNames.length > 0 && trimmedTitle.length > 0;
  const published = status === "published";
  // Stepper: rascunho está em "1 Configurar", publicado em "2 Conectar"
  const currentStep = published ? 2 : 1;
  const disabledReason =
    trimmedTitle.length === 0
      ? SERVER_NAME_REQUIRED
      : selectedNames.length === 0
        ? FIELDS_REQUIRED
        : undefined;

  const endpointUrl = `${origin || ""}/api/mcp`;
  const serverName = slugifyServerName(trimmedTitle || projectName);
  // A chave em claro só existe logo após publicar/regenerar; fora disso as
  // instruções levam o placeholder para o usuário trocar
  const keyDisplay = revealedKey ?? KEY_PLACEHOLDER;

  const filteredAgents = useMemo(() => {
    const query = normalizeSearch(agentSearch.trim());
    if (!query) return AGENTS;
    return AGENTS.filter((agent) =>
      normalizeSearch(agent.name).includes(query),
    );
  }, [agentSearch]);

  const activeAgent = AGENTS.find((agent) => agent.id === agentId) ?? null;
  const instructions = activeAgent
    ? buildInstructions(activeAgent.id, endpointUrl, keyDisplay, serverName)
    : null;

  const payload = () => ({
    fields: selectedNames,
    title: trimmedTitle,
    description: trimmedDescription,
  });

  function toggleField(name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const result = await publishMcpDeployment(projectId, payload());
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setStatus("published");
      setKeyPrefix(result.apiKeyPrefix);
      setRevealedKey(result.apiKey);
      // Publicar de novo não é rotação: a chave anterior morre na hora
      setPreviousKeyExpiresAt(null);
      setSavedSnapshot(currentSnapshot);
      toast.success(`Endpoint MCP publicado. ${KEY_REVEAL_NOTICE}`);
    });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveMcpDeployment(projectId, payload());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedSnapshot(currentSnapshot);
      toast.success(
        published
          ? "Alterações salvas. A tool já está atualizada."
          : "Rascunho salvo.",
      );
    });
  }

  function handleRotate() {
    startTransition(async () => {
      const result = await rotateMcpKey(projectId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setKeyPrefix(result.apiKeyPrefix);
      setRevealedKey(result.apiKey);
      setPreviousKeyExpiresAt(result.previousKeyExpiresAt);
      toast.success(
        result.previousKeyExpiresAt
          ? "Chave rotacionada. A anterior continua válida por 24 h."
          : "Nova chave gerada. O endpoint MCP voltou a aceitar chamadas.",
      );
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeMcpKey(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setKeyPrefix(null);
      setRevealedKey(null);
      setPreviousKeyExpiresAt(null);
      toast.success("Chave revogada. Gere uma nova chave para reativar.");
    });
  }

  function handleUnpublish() {
    startTransition(async () => {
      const result = await unpublishMcpDeployment(projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatus("draft");
      setKeyPrefix(null);
      setRevealedKey(null);
      setPreviousKeyExpiresAt(null);
      setAgentId(null);
      toast.success("Endpoint MCP despublicado. A chave deixou de funcionar.");
    });
  }

  async function copyText(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  }

  const hasKey = keyPrefix !== null;
  // Ação primária do cabeçalho fixo: Publicar (rascunho) / Salvar (publicado)
  const primaryAction: DeploymentPrimaryAction = published
    ? {
        label: "Salvar alterações",
        icon: Check,
        onClick: handleSave,
        disabled: !canSubmit || !dirty,
        pending: isPending,
        disabledReason,
      }
    : {
        label: "Publicar",
        icon: Globe,
        onClick: handlePublish,
        disabled: !canSubmit,
        pending: isPending,
        disabledReason,
      };
  const menuItems: DeploymentMenuItem[] = published
    ? [
        {
          label: hasKey ? KEY_ACTION_LABELS.rotate : KEY_ACTION_LABELS.generate,
          icon: RefreshCw,
          // Sem chave não há o que preservar: gera direto, como antes
          onSelect: () => (hasKey ? setConfirmRotate(true) : handleRotate()),
          disabled: isPending,
        },
        {
          label: KEY_ACTION_LABELS.revoke,
          icon: ShieldOff,
          onSelect: () => setConfirmRevoke(true),
          disabled: isPending || !hasKey,
          destructive: true,
        },
        {
          label: KEY_ACTION_LABELS.unpublish,
          icon: PowerOff,
          onSelect: () => setConfirmUnpublish(true),
          disabled: isPending,
          destructive: true,
        },
      ]
    : [
        {
          label: "Salvar rascunho",
          icon: Save,
          onSelect: handleSave,
          disabled:
            isPending || !canSubmit || (savedSnapshot !== null && !dirty),
        },
      ];

  // Formulário do passo 1 — o mesmo nos dois estados; em rascunho é a tela
  // inteira, publicado fica recolhido em "Configuração do servidor"
  const configForm = (
    <>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="mcp-server-name"
          className="text-sm font-medium text-foreground"
        >
          Nome do servidor
        </label>
        <Input
          id="mcp-server-name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder={projectName}
        />
        <p className="text-xs text-muted-foreground">
          Aparece no cliente MCP como título do servidor e da tool predict —
          ex.: “Predição — {trimmedTitle || projectName}”.
        </p>
        {trimmedTitle.length === 0 && (
          <p className="text-xs text-destructive">{SERVER_NAME_REQUIRED}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="mcp-server-description"
          className="text-sm font-medium text-foreground"
        >
          Descrição{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <Textarea
          id="mcp-server-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Ex.: Estima o orçamento em R$ de projetos de IA a partir do escopo, das ferramentas e do prazo em semanas."
        />
        <p className="text-xs text-muted-foreground">
          Entra nas instruções do servidor e da tool predict — é o que o agente
          lê para decidir quando usar o modelo.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">
          Selecionar campos
        </legend>
        <p className="text-xs text-muted-foreground">
          Parâmetros aceitos pela tool de predição.
        </p>
        <p
          className="text-xs font-medium text-foreground"
          data-mcp-field-counter
        >
          {selectedNames.length} de {modelFields.length} campos selecionados
        </p>
        <label className="flex items-center gap-2.5 border-b border-border pb-2 text-sm text-foreground">
          <Checkbox
            checked={selected.size === modelFields.length}
            onCheckedChange={(checked) =>
              setSelected(
                checked === true
                  ? new Set(modelFields.map((field) => field.name))
                  : new Set(),
              )
            }
            aria-label="Selecionar todos os campos"
          />
          Selecionar todos
        </label>
        <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1">
          {modelFields.map((field) => (
            <label
              key={field.name}
              className="flex items-center gap-2.5 text-sm text-foreground"
            >
              <Checkbox
                checked={selected.has(field.name)}
                onCheckedChange={(checked) =>
                  toggleField(field.name, checked === true)
                }
              />
              <span className="truncate" title={field.name}>
                {field.name}
              </span>
            </label>
          ))}
        </div>
        {selectedNames.length === 0 && (
          <p className="text-xs text-destructive">{FIELDS_REQUIRED}</p>
        )}
      </fieldset>
    </>
  );

  // Publicado: passo 1 recolhido, com resumo "{título} · N campos" e o badge
  // de alterações pendentes no próprio summary
  const serverConfigDetails = (
    <CollapsibleSection
      icon={Globe}
      summary={SERVER_CONFIG_TITLE}
      detail={`${trimmedTitle || projectName} · ${pluralize(selectedNames.length, "campo", "campos")}`}
      badge={
        dirty ? (
          <Badge variant="secondary" data-mcp-unsaved>
            {UNSAVED_BADGE_LABEL}
          </Badge>
        ) : null
      }
      testId="server-config"
    >
      <div className="flex flex-col gap-5">{configForm}</div>
    </CollapsibleSection>
  );

  // Passo 3 — o que o agente vê, recolhido por padrão
  const toolPredictDetails = (
    <CollapsibleSection
      icon={Wrench}
      summary={`Tool predict — ${pluralize(selectedFields.length, "parâmetro", "parâmetros")}`}
      testId="tool-predict"
    >
      <p className="text-xs text-muted-foreground">
        O cliente MCP verá a tool <code>predict</code> com um parâmetro opcional
        por campo selecionado — campos não informados viram valores nulos.
        Também verá a tool <code>model_info</code>, que descreve o modelo (alvo,
        campos, métricas) sem consumir predições.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {selectedFields.map((field) => (
          <li key={field.name} className="font-mono text-xs text-foreground">
            {field.name}
            <span className="text-muted-foreground">
              {" "}
              — {TYPE_LABELS[field.type]}
              {field.type === "category" && field.categories.length > 0
                ? ` (ex.: ${field.categories.slice(0, 3).join(", ")})`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );

  const securityDetails = (
    <CollapsibleSection
      icon={ShieldCheck}
      summary={`${SECURITY_PRACTICES_TITLE} — ${SECURITY_PRACTICES.length} itens`}
      testId="security-practices"
    >
      <SecurityPracticesList />
    </CollapsibleSection>
  );

  return (
    <div className="flex flex-col">
      <DeploymentPageHeader
        backHref={`/projects/${projectId}/deploy`}
        backLabel="Publicar"
        title="Servidor MCP"
        statusBadge={
          published ? (
            <Badge>Publicado</Badge>
          ) : (
            <Badge variant="outline">Não publicado</Badge>
          )
        }
        primaryAction={primaryAction}
        menuItems={menuItems}
      />
      <RotateKeyDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        onConfirm={handleRotate}
        consumersLabel={CONSUMERS_LABEL}
      />
      <RevokeKeyDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        onConfirm={handleRevoke}
        consumersLabel={CONSUMERS_LABEL}
      />
      <UnpublishDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        onConfirm={handleUnpublish}
        consumersLabel={CONSUMERS_LABEL}
      />

      {/* Abaixo de sm a barra inferior fixa do cabeçalho cobre ~5rem: pb-24.
          Coluna única nos dois estados; publicado um pouco mais largo para a
          grade de agentes e os blocos de código */}
      <div
        className={`mx-auto flex w-full flex-col px-6 pt-6 pb-24 sm:pb-8 ${
          published ? "max-w-3xl" : "max-w-2xl"
        }`}
        data-mcp-layout={published ? "published" : "draft"}
      >
        <p className="text-sm text-muted-foreground">
          Deixe agentes de IA (Claude, ChatGPT, Cursor…) fazerem predições com o
          seu modelo via Model Context Protocol.
        </p>

        {/* Stepper de uma linha: 1 Configurar · 2 Conectar · 3 Usar */}
        <ol
          aria-label="Etapas"
          className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        >
          {STEPS.map((step, index) => {
            const number = index + 1;
            const current = number === currentStep;
            return (
              <li
                key={step.label}
                aria-current={current ? "step" : undefined}
                className={`flex items-center gap-1.5 font-medium ${
                  current ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {index > 0 && (
                  <span aria-hidden className="mr-0.5 text-muted-foreground/60">
                    ·
                  </span>
                )}
                <step.icon className="size-4" aria-hidden />
                <span>
                  {number} {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* `key` por layout: sem ela o React reaproveita os <details> pela
            posição e um "Configuração do servidor" aberto vira um "Tool
            predict" aberto ao despublicar */}
        {!published ? (
          <div key="draft" className="mt-6 flex flex-col gap-6">
            {configForm}

            {/* Integrações visíveis já no rascunho, sem nada clicável */}
            <TooltipProvider>
              <div
                className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/40 p-4"
                data-mcp-connect-later
              >
                <p className="text-sm font-medium text-foreground">
                  {CONNECT_LATER_LABEL}
                </p>
                <ul className="flex flex-wrap items-center gap-2">
                  {FEATURED_AGENTS.map((agent) => (
                    <li
                      key={agent.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground"
                    >
                      <agent.icon
                        className="size-3.5 text-muted-foreground"
                        aria-hidden
                      />
                      {agent.name}
                    </li>
                  ))}
                  <li>
                    <Tooltip>
                      <TooltipTrigger className="inline-flex cursor-help items-center rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        {OTHER_AGENTS_CHIP_LABEL}
                      </TooltipTrigger>
                      <TooltipContent>
                        {OTHER_AGENTS.map((agent) => agent.name).join(", ")}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                </ul>
              </div>
            </TooltipProvider>

            {toolPredictDetails}
            {securityDetails}
          </div>
        ) : (
          <div key="published" className="mt-6 flex flex-col gap-6">
            {/* (1) Chave — em destaque enquanto está em claro */}
            <DeploymentKeyStatus
              published={published}
              revealedKey={revealedKey}
              info={{
                keyPrefix,
                previousKeyExpiresAt,
                lastUsedAt: initial?.lastUsedAt ?? null,
                lastUsedIp: initial?.lastUsedIp ?? null,
              }}
              now={now}
              onCopy={copyText}
            />

            {/* (2) Passo 2 — escolha do agente + instruções logo abaixo */}
            <section
              aria-label="Conectar agente de IA"
              className="flex min-w-0 flex-col gap-5"
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-sm font-medium text-foreground">
                    Escolha seu agente de IA
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Selecione o agente para ver as instruções de conexão
                    prontas.
                  </p>
                </div>

                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={agentSearch}
                    onChange={(event) => setAgentSearch(event.target.value)}
                    placeholder="Buscar agente…"
                    aria-label="Buscar agente de IA"
                    maxLength={100}
                    className="pl-9"
                  />
                </div>

                {filteredAgents.length === 0 ? (
                  <p className="rounded-lg border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                    Nenhum agente encontrado para “{agentSearch.trim()}”.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {filteredAgents.map((agent) => {
                      const active = agent.id === agentId;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => setAgentId(active ? null : agent.id)}
                          aria-pressed={active}
                          className={`flex items-center gap-2.5 rounded-lg border p-3 text-left text-sm font-medium text-foreground transition-colors ${
                            active
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-primary/40 hover:bg-muted/40"
                          }`}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
                            <agent.icon className="size-4" aria-hidden />
                          </span>
                          <span className="truncate" title={agent.name}>
                            {agent.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* A URL só aparece dentro das instruções; o genérico traz
                    URL com ?token= e o header Authorization */}
                <button
                  type="button"
                  onClick={() => setAgentId("other")}
                  className="self-start rounded-sm text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  data-mcp-generic-link
                >
                  {GENERIC_LINK_LABEL}
                </button>
              </div>

              {activeAgent && instructions && (
                <div
                  ref={instructionsRef}
                  className="flex scroll-mb-24 flex-col gap-2.5 rounded-lg border border-border p-4 sm:scroll-mb-4"
                  data-mcp-instructions={activeAgent.id}
                >
                  <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <activeAgent.icon
                      className="size-4 text-primary"
                      aria-hidden
                    />
                    Conectar ao {activeAgent.name}
                  </h3>
                  <ol className="flex flex-col gap-3">
                    {instructions.map((step, index) => (
                      <li key={index} className="flex flex-col gap-1.5">
                        <p className="text-xs text-muted-foreground">
                          {instructions.length > 1 ? `${index + 1}. ` : ""}
                          {step.text}
                        </p>
                        {step.code && (
                          <div className="flex items-start gap-2">
                            <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
                              {step.code}
                            </pre>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => copyText(step.code!, "Copiado.")}
                            >
                              <Copy className="size-3.5" aria-hidden />
                              Copiar
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    {revealedKey
                      ? "Os blocos acima já incluem a chave recém-gerada."
                      : `Troque ${KEY_PLACEHOLDER} pela chave gerada ao publicar.`}
                  </p>
                </div>
              )}
            </section>

            {/* (3) Passo 1 recolhido, (4) o que o agente vê e segurança */}
            {serverConfigDetails}
            {toolPredictDetails}
            {securityDetails}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Seção recolhível nativa (`<details>` fechado por padrão) com resumo de uma
 * linha — "Tool predict — 8 parâmetros", "Boas práticas de segurança — 4 itens".
 * `detail` é o complemento em cinza ("{título} · 8 campos") e `badge` um
 * indicador à direita (ex.: "Alterações não salvas"), ambos opcionais.
 */
function CollapsibleSection({
  icon: Icon,
  summary,
  detail,
  badge,
  testId,
  children,
}: {
  icon: LucideIcon;
  summary: string;
  detail?: string;
  badge?: ReactNode;
  testId: string;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-lg border border-border"
      data-mcp-details={testId}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span>{summary}</span>{" "}
          {detail && (
            <span
              className="min-w-0 truncate font-normal text-muted-foreground"
              data-mcp-details-detail
            >
              {detail}
            </span>
          )}
        </span>{" "}
        {badge}
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border px-4 py-3">{children}</div>
    </details>
  );
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// window.location.origin nunca muda durante a sessão — não há o que assinar
function subscribeNoop() {
  return () => {};
}
