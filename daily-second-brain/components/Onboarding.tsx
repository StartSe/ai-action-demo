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
  {
    title: "Dar sua direção",
    icon: "settings",
    detail: "Como organizar suas ideias",
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
  const [step, setStep] = useState(setup.step);
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
      if (target > step && step === 3)
        await request("/api/brain", "POST", {
          action: "rules",
          content: draft,
        });
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
            Conecte sua inteligência, escolha suas fontes e deixe Daily cuidar
            da organização.
          </p>
        </div>
        <span className="onboarding-orb">
          <Icon name="brain" size={42} />
        </span>
      </div>
      <nav className="onboarding-steps" aria-label="Etapas do primeiro acesso">
        {steps.map((s, i) => (
          <button
            key={s.title}
            aria-current={step === i + 1 ? "step" : undefined}
            disabled={busy || i + 1 > step}
            className={
              step === i + 1 ? "active" : i + 1 < step ? "complete" : ""
            }
            onClick={() => void move(i + 1)}
          >
            <span>
              {i + 1 < step ? <Icon name="check" size={17} /> : `0${i + 1}`}
            </span>
            <div>
              <strong>{s.title}</strong>
              <small>{s.detail}</small>
            </div>
          </button>
        ))}
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
            <div className="onboarding-intro">
              <h2>Traga o contexto do seu dia.</h2>
              <p>
                No Zapier, conecte o Slack e habilite a leitura de mensagens ou
                histórico de canal. Também pode usar Gmail, Drive e outras
                fontes. Depois, salve a conexão abaixo e confira as ferramentas
                de coleta.
              </p>
              <a
                href="https://mcp.zapier.com"
                target="_blank"
                rel="noreferrer"
                className="text-button"
              >
                Abrir minhas conexões no Zapier <Icon name="arrow" size={14} />
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
          </>
        )}
        {step === 3 && (
          <>
            <div className="onboarding-intro">
              <h2>Uma memória com seus princípios.</h2>
              <p>
                Estas regras orientam a wiki e as respostas. Já deixamos uma
                base pronta; ajuste o que for importante para você.
              </p>
            </div>
            <label>
              Regras iniciais da memória
              <textarea
                rows={12}
                maxLength={12000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <details className="optional-voice">
              <summary>
                <Icon name="volume" size={17} />
                Quero falar e ouvir respostas <span>Opcional</span>
              </summary>
              <Connections
                focus="voice"
                settings={settings}
                update={updateSettings}
              />
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
      <footer className="onboarding-footer">
        <div>
          {step > 1 && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void move(step - 1)}
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
              (step === 2 && (!setup.zapier || setup.readTools < 1)) ||
              (step === 3 && !draft.trim())
            }
            onClick={() => void move(step + 1)}
          >
            {busy
              ? step === 1
                ? "Testando conexão…"
                : "Salvando…"
              : step === 1 && !setup.aiVerified
                ? "Testar IA e continuar"
                : step === 3
                  ? "Salvar regras e continuar"
                  : "Continuar"}
            <Icon name="arrow" size={16} />
          </button>
        )}
      </footer>
      <p className="onboarding-hint">
        Seu progresso fica salvo. Você pode retomar em Primeiro acesso a
        qualquer momento.
      </p>
    </div>
  );
}
