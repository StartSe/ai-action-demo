"use client";
import { useState } from "react";
import type { Settings } from "@/lib/types";
import type { SetupState } from "@/lib/capture-types";
import { Connections } from "./Connections";
import { CaptureComposer } from "./Captures";
import { Icon } from "./Icons";
import { request } from "./client";

const steps = [
  { title: "Conectar a IA", icon: "brain", detail: "Quem pensa com você" },
  {
    title: "Escolher as fontes",
    icon: "plug",
    detail: "De onde vêm as memórias",
  },
  { title: "Primeira coleta", icon: "spark", detail: "Do pedido à sua wiki" },
];
export function Onboarding({
  setup,
  settings,
  rules,
  updateSettings,
  updateSetup,
  finish,
}: {
  setup: SetupState;
  settings: Settings;
  rules: string;
  updateSettings: (s: Settings) => void;
  updateSetup: (s: SetupState) => void;
  finish: (destination: "home" | "captures" | "manual") => void | Promise<void>;
}) {
  const [step, setStep] = useState(setup.step === 3 ? 4 : setup.step);
  const [draft, setDraft] = useState(rules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function move(target: number) {
    setBusy(true);
    setError("");
    try {
      if (target > step && step === 1 && !setup.aiVerified)
        updateSetup(
          await request<SetupState>("/api/onboarding", "POST", {
            action: "verify-ai",
          }),
        );
      updateSetup(
        await request<SetupState>("/api/onboarding", "POST", {
          action: "step",
          step: target,
        }),
      );
      setStep(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function defer(destination: "home" | "manual") {
    setBusy(true);
    setError("");
    try {
      updateSetup(
        await request<SetupState>("/api/onboarding", "POST", {
          action: "defer",
        }),
      );
      if (destination === "manual" && setup.aiVerified)
        updateSetup(
          await request<SetupState>("/api/onboarding", "POST", {
            action: "complete",
          }),
        );
      await finish(destination);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding">
      <div className="onboarding-heading">
        <div>
          <span className="eyebrow">BEM-VINDO AO SEU SEGUNDO CÉREBRO</span>
          <h1>Sua memória começa aqui.</h1>
          <p>
            Conecte a IA e guarde seu primeiro texto. Você pode adicionar
            aplicativos e rotinas quando precisar.
          </p>
        </div>
        <span className="onboarding-orb">
          <Icon name="brain" size={42} />
        </span>
      </div>
      <nav className="onboarding-steps" aria-label="Etapas da configuração">
        {steps.map((s, i) => {
          const target = [1, 2, 4][i];
          return (
            <button
              key={s.title}
              aria-current={step === target ? "step" : undefined}
              disabled={busy || target > step}
              className={
                step === target ? "active" : target < step ? "complete" : ""
              }
              onClick={() => void move(target)}
            >
              <span>
                {target < step ? <Icon name="check" size={17} /> : `0${i + 1}`}
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.detail}</small>
              </div>
            </button>
          );
        })}
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="onboarding-body">
        {step === 1 && (
          <>
            <div className="onboarding-intro">
              <h2>Escolha quem pensa com você.</h2>
              <p>
                Use sua assinatura ChatGPT ou uma chave OpenRouter. Vamos testar
                a conexão antes de continuar.
              </p>
            </div>
            <Connections
              focus="ai"
              settings={settings}
              update={updateSettings}
            />
            {setup.aiVerified && (
              <p className="setup-verified">
                <Icon name="check" size={17} />
                Sua IA respondeu ao teste de conexão.
              </p>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <div className="manual-start">
              <Icon name="file" size={25} />
              <div>
                <h2>Comece com um texto</h2>
                <p>
                  Cole uma nota ou conversa e organize sua primeira página. Não
                  precisa conectar outro aplicativo.
                </p>
              </div>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void defer("manual")}
              >
                Inserir meu primeiro texto <Icon name="arrow" size={16} />
              </button>
            </div>
            <details className="connect-later">
              <summary>Quero coletar de aplicativos · opcional</summary>
              <div className="onboarding-intro">
                <h2>Traga o contexto do seu dia.</h2>
                <p>
                  No Zapier, conecte o Slack e habilite a leitura de mensagens
                  ou histórico de canal. Também pode usar Gmail, Drive e outras
                  fontes. Depois, salve a conexão abaixo e confira as
                  ferramentas de coleta.
                </p>
                <a
                  href="https://mcp.zapier.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-button"
                >
                  Abrir minhas conexões no Zapier{" "}
                  <Icon name="arrow" size={14} />
                </a>
              </div>
              <Connections
                focus="zapier"
                settings={settings}
                update={updateSettings}
              />
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void defer("manual")}
              >
                Prefiro começar com texto
              </button>
            </details>
          </>
        )}
        {step === 4 && (
          <>
            <div className="onboarding-intro">
              <h2>Agora, dê a primeira missão.</h2>
              <p>
                Informe uma fonte que você conectou. Seu pedido entra na fila, e
                Daily mostra o progresso até organizar as informações na wiki.
              </p>
            </div>
            <CaptureComposer
              guided
              ready={setup.aiConnected && setup.zapier && setup.readTools > 0}
              configure={() => void move(2)}
              done={async () => {
                try {
                  updateSetup(
                    await request<SetupState>("/api/onboarding", "POST", {
                      action: "complete",
                    }),
                  );
                } finally {
                  await finish("captures");
                }
              }}
            />
          </>
        )}
      </div>
      <details className="setup-optional">
        <summary>Personalizar como Daily organiza · opcional</summary>
        <label>
          Regras iniciais da memória
          <textarea
            rows={8}
            maxLength={12000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={busy || !draft.trim()}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await request("/api/brain", "POST", {
                action: "rules",
                content: draft,
              });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Salvar regras
        </button>
      </details>
      <footer className="onboarding-footer">
        <div>
          {step > 1 && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void move(step === 4 ? 2 : 1)}
            >
              Voltar
            </button>
          )}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void defer("home")}
          >
            Continuar depois
          </button>
        </div>
        {step < 4 && (
          <button
            className="button primary"
            disabled={
              busy ||
              (step === 1 && !setup.aiConnected) ||
              (step === 2 && (!setup.zapier || setup.readTools < 1))
            }
            onClick={() => void move(step === 2 ? 4 : 2)}
          >
            {busy
              ? step === 1
                ? "Testando conexão…"
                : "Salvando…"
              : step === 1 && !setup.aiVerified
                ? "Testar IA e continuar"
                : step === 2
                  ? "Continuar com aplicativos"
                  : "Continuar"}
            <Icon name="arrow" size={16} />
          </button>
        )}
      </footer>
      <p className="onboarding-hint">
        Seu progresso fica salvo. Você pode retomar em Ajustes → Primeiros
        passos a qualquer momento.
      </p>
    </div>
  );
}
