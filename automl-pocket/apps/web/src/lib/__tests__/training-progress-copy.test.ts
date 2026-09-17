import { describe, expect, it } from "vitest";

import {
  PROJECTS_HREF,
  TRAINING_PROGRESS_COPY,
  TRAINING_SUCCEEDED_SCREEN_ENABLED,
  trainingReportHref,
} from "../training-progress-copy";

describe("TRAINING_SUCCEEDED_SCREEN_ENABLED", () => {
  it("tela 'Treinamento concluído' fica oculta: o treino abre o relatório direto (2026-09-14)", () => {
    expect(TRAINING_SUCCEEDED_SCREEN_ENABLED).toBe(false);
  });
});

describe("TRAINING_PROGRESS_COPY", () => {
  it("não promete redirecionamento automático", () => {
    for (const text of Object.values(TRAINING_PROGRESS_COPY)) {
      expect(text.toLowerCase()).not.toMatch(/redirecion/);
    }
  });

  it("tem os textos do estado concluído", () => {
    expect(TRAINING_PROGRESS_COPY.succeededTitle).toBe("Treinamento concluído");
    expect(TRAINING_PROGRESS_COPY.backToProjects).toBe("Voltar aos projetos");
    expect(TRAINING_PROGRESS_COPY.viewReport).toBe("Ver relatório do modelo");
  });

  it("aponta o relatório para o Prever do projeto e o secundário para /projects", () => {
    expect(trainingReportHref("abc")).toBe("/projects/abc/predict");
    expect(PROJECTS_HREF).toBe("/projects");
  });
});
