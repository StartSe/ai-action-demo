"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  formatLastUsed,
  formatRemainingHHMM,
} from "@/lib/deployment-key-format";
import { cn } from "@/lib/utils";

/**
 * Bloco de chave dos deployments autenticados por chave (API e MCP) — US-039.
 * As duas telas de configuração (`deploy/api/api-config.tsx` e
 * `deploy/mcp/mcp-config.tsx`) montam o mesmo estado da chave (ativa /
 * revelada / revogada), as linhas "Chave anterior expira em HH:MM" e
 * "Último uso", e os botões Rotacionar / Revogar com confirmação. O estado e
 * as server actions continuam em cada tela; aqui só apresentação + diálogos.
 */

/** Estado da chave que vem do banco (ISO strings — serializáveis para o client). */
export type DeploymentKeyInfo = {
  /** Prefixo da chave atual; null = publicado sem chave (revogada) ou draft */
  keyPrefix: string | null;
  /** Expiração da chave anterior em graça (ISO), null sem rotação recente */
  previousKeyExpiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
};

const KEY_ROTATION_GRACE_NOTICE = "A chave anterior continua válida por 24 h.";
const KEY_REVOKED_NOTICE =
  "Nenhuma chave ativa. Gere uma nova chave para reativar.";
/** Aviso mostrado junto da chave em claro e no toast de publicação. */
export const KEY_REVEAL_NOTICE =
  "Copie a chave agora — ela não será exibida de novo.";

/** Os 4 itens do bloco "Boas práticas de segurança" (US-040) — mesmos nas duas telas. */
export const SECURITY_PRACTICES = [
  {
    title: "Guarde a chave em uma variável de ambiente",
    text: "No servidor que chama a API, nunca no código-fonte nem no repositório.",
  },
  {
    title: "Nunca use a chave no front-end",
    text: "Site, app mobile ou planilha compartilhada expõem a chave a qualquer pessoa. Chame a partir do seu backend.",
  },
  {
    title: "Rotacione se a chave foi exposta",
    text: 'Gere uma nova em "Rotacionar chave": a anterior continua válida por 24 h para você trocar sem parar a integração.',
  },
  {
    title: "Revogue em caso de vazamento",
    text: '"Revogar agora" invalida a chave atual e a anterior na hora; depois gere uma nova para reativar.',
  },
] as const;

/** Título do bloco de boas práticas — o mesmo no card e no resumo recolhido. */
export const SECURITY_PRACTICES_TITLE = "Boas práticas de segurança";

/**
 * Só a lista numerada das boas práticas, sem título nem moldura — para caber
 * dentro de um `<details>` cujo `<summary>` já traz o título (tela MCP).
 */
export function SecurityPracticesList({ className }: { className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-2", className)}>
      {SECURITY_PRACTICES.map((item, index) => (
        <li key={item.title} className="flex items-start gap-2.5 text-xs">
          <span
            className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground"
            aria-hidden
          >
            {index + 1}
          </span>
          <p className="min-w-0 text-muted-foreground">
            <span className="font-medium text-foreground">{item.title}.</span>{" "}
            {item.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Bloco "Boas práticas de segurança" mostrado nas telas dos deploys API e
 * MCP, ao lado dos exemplos de uso. Só apresentação.
 */
export function DeploymentSecurityPractices() {
  return (
    <section
      aria-labelledby="deployment-security-practices"
      className="flex flex-col gap-2.5 rounded-lg border border-border p-4"
    >
      <h2
        id="deployment-security-practices"
        className="flex items-center gap-2 text-sm font-medium text-foreground"
      >
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        {SECURITY_PRACTICES_TITLE}
      </h2>
      <SecurityPracticesList />
    </section>
  );
}

/**
 * Relógio do cliente para textos relativos ("há 5 min", "expira em 23:41").
 * Começa null para o HTML do servidor e a hidratação baterem; o primeiro
 * valor vem no mount e depois a cada `intervalMs`.
 */
export function useClientClock(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, intervalMs);
    tick();
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Linhas de estado que aparecem em qualquer bloco de chave publicado. */
function KeyStatusLines({
  info,
  now,
}: {
  info: DeploymentKeyInfo;
  now: number | null;
}) {
  // Sem relógio ainda (SSR / antes do mount) só o texto que não depende dele
  const remaining =
    now === null ? null : formatRemainingHHMM(info.previousKeyExpiresAt, now);
  const lastUsed =
    info.lastUsedAt === null
      ? "Nunca usada"
      : now === null
        ? null
        : formatLastUsed(info.lastUsedAt, info.lastUsedIp, now);
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {remaining && (
        <p
          title={
            info.previousKeyExpiresAt
              ? new Date(info.previousKeyExpiresAt).toLocaleString("pt-BR")
              : undefined
          }
        >
          Chave anterior expira em {remaining}
        </p>
      )}
      {lastUsed && <p>{lastUsed}</p>}
    </div>
  );
}

/**
 * Bloco da chave: recém-gerada (em claro, uma única vez), ativa (só o
 * prefixo) ou revogada. Fora de `published` não renderiza nada.
 */
export function DeploymentKeyStatus({
  published,
  revealedKey,
  info,
  now,
  onCopy,
}: {
  published: boolean;
  /** Chave em claro logo após publicar/rotacionar; nunca volta do servidor */
  revealedKey: string | null;
  info: DeploymentKeyInfo;
  now: number | null;
  onCopy: (text: string, message: string) => void;
}) {
  if (revealedKey) {
    return (
      <div
        className="flex flex-col gap-2 rounded-lg border border-primary bg-primary/5 p-3"
        data-deployment-key="revealed"
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <KeyRound className="size-3.5 text-primary" aria-hidden />
          Sua chave de API
        </p>
        <p className="font-mono text-xs break-all text-foreground">
          {revealedKey}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopy(revealedKey, "Chave copiada.")}
        >
          <Copy className="size-3.5" aria-hidden />
          Copiar chave
        </Button>
        <p
          className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800"
          role="status"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {KEY_REVEAL_NOTICE}
        </p>
        <KeyStatusLines info={info} now={now} />
      </div>
    );
  }

  if (!published) return null;

  if (info.keyPrefix) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <KeyRound className="size-3.5" aria-hidden />
          Chave ativa
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {info.keyPrefix}… (só o começo é armazenado)
        </p>
        <KeyStatusLines info={info} now={now} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <ShieldOff className="size-3.5" aria-hidden />
        Chave revogada
      </p>
      <p className="text-xs text-amber-800">{KEY_REVOKED_NOTICE}</p>
      <KeyStatusLines info={info} now={now} />
    </div>
  );
}

/** Textos dos itens de menu / botões das ações da chave — mesmos nas duas telas. */
export const KEY_ACTION_LABELS = {
  rotate: "Rotacionar chave",
  generate: "Gerar nova chave",
  revoke: "Revogar chave",
  unpublish: "Despublicar",
} as const;

/**
 * Diálogo de confirmação da rotação. Controlado por `open`/`onOpenChange`
 * para servir tanto aos botões de `DeploymentKeyActions` quanto a itens de
 * menu ("Mais ações" do cabeçalho fixo) sem duplicar o texto.
 */
export function RotateKeyDialog({
  open,
  onOpenChange,
  onConfirm,
  consumersLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Quem usa a chave, para o texto do diálogo ("Integrações" / "Agentes conectados") */
  consumersLabel: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rotacionar chave de API?</AlertDialogTitle>
          <AlertDialogDescription>
            Uma nova chave será gerada e exibida uma única vez.{" "}
            {KEY_ROTATION_GRACE_NOTICE} {consumersLabel} têm esse prazo para
            trocar para a nova sem interrupção.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {KEY_ACTION_LABELS.rotate}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Diálogo de confirmação da revogação (mesmo contrato de `RotateKeyDialog`). */
export function RevokeKeyDialog({
  open,
  onOpenChange,
  onConfirm,
  consumersLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  consumersLabel: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revogar a chave agora?</AlertDialogTitle>
          <AlertDialogDescription>
            A chave atual e a anterior deixam de funcionar imediatamente.{" "}
            {consumersLabel} vão falhar até você gerar uma nova chave. Gere uma
            nova chave para reativar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Revogar agora
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Diálogo de confirmação do "Despublicar". Quando a ação sai de um botão
 * visível para um item de menu, um clique errado não pode derrubar a
 * integração sem aviso.
 */
export function UnpublishDialog({
  open,
  onOpenChange,
  onConfirm,
  consumersLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  consumersLabel: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Despublicar o endpoint?</AlertDialogTitle>
          <AlertDialogDescription>
            A chave deixa de funcionar na hora e {consumersLabel.toLowerCase()}{" "}
            passam a falhar. A configuração fica salva como rascunho e você pode
            publicar de novo quando quiser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {KEY_ACTION_LABELS.unpublish}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Botões "Rotacionar chave" e "Revogar agora" com confirmação. Com a chave
 * revogada, rotacionar vira "Gerar nova chave" e dispara direto (não há
 * chave a preservar); revogar fica desabilitado.
 */
export function DeploymentKeyActions({
  hasKey,
  isPending,
  onRotate,
  onRevoke,
  consumersLabel,
}: {
  hasKey: boolean;
  isPending: boolean;
  onRotate: () => void;
  onRevoke: () => void;
  /** Quem usa a chave, para o texto dos diálogos ("Integrações" / "Agentes conectados") */
  consumersLabel: string;
}) {
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => (hasKey ? setConfirmRotate(true) : onRotate())}
        disabled={isPending}
      >
        <RefreshCw className="size-4" aria-hidden />
        {hasKey ? KEY_ACTION_LABELS.rotate : KEY_ACTION_LABELS.generate}
      </Button>
      {hasKey && (
        <p className="-mt-1 text-xs text-muted-foreground">
          {KEY_ROTATION_GRACE_NOTICE}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirmRevoke(true)}
        disabled={isPending || !hasKey}
      >
        <ShieldOff className="size-4" aria-hidden />
        Revogar agora
      </Button>

      <RotateKeyDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        onConfirm={onRotate}
        consumersLabel={consumersLabel}
      />
      <RevokeKeyDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        onConfirm={onRevoke}
        consumersLabel={consumersLabel}
      />
    </>
  );
}
