import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// training-eta importa "server-only" (lança fora de Server Components) — neutraliza
vi.mock("server-only", () => ({}));

import {
  computeDurationMedians,
  DURATION_HISTORY_DAYS,
  DURATION_MEDIANS_CACHE_TTL_MS,
  ETA_RANGE_FACTORS,
  estimateQueueWait,
  estimateTrainingDuration,
  FALLBACK_DURATION_SECONDS,
  fallbackDurationRange,
  formatApproxDuration,
  formatDurationRange,
  formatElapsed,
  median,
  MIN_DURATION_SAMPLES,
  remainingSeconds,
  resetTrainingDurationCache,
  rowBucket,
  simulateQueueWait,
  type DurationHistoryStore,
  type DurationSample,
  type TrainingJobInfo,
  type TrainingJobInfoStore,
} from "@/lib/training-eta";
import type { TrainingQueueSnapshot } from "@/lib/queue";

describe("formatDurationRange", () => {
  it("abaixo de 1 min vira 'menos de 1 min'", () => {
    expect(formatDurationRange(10, 45)).toBe("menos de 1 min");
    expect(formatDurationRange(0, 59)).toBe("menos de 1 min");
  });

  it("faixa em minutos", () => {
    expect(formatDurationRange(120, 240)).toBe("entre 2 e 4 min");
    expect(formatDurationRange(84, 180)).toBe("entre 1 e 3 min");
    expect(formatDurationRange(168, 360)).toBe("entre 3 e 6 min");
  });

  it("extremos que arredondam para o mesmo minuto viram 'cerca de'", () => {
    expect(formatDurationRange(4200, 4200)).toBe("cerca de 1 h 10 min");
    expect(formatDurationRange(170, 190)).toBe("cerca de 3 min");
    expect(formatDurationRange(3600, 3600)).toBe("cerca de 1 h");
  });

  it("acima de 1 h cada extremo leva a própria unidade", () => {
    expect(formatDurationRange(3000, 4500)).toBe("entre 50 min e 1 h 15 min");
    expect(formatDurationRange(3600, 7200)).toBe("entre 1 h e 2 h");
  });

  it("tolera extremos invertidos e valores negativos", () => {
    expect(formatDurationRange(240, 120)).toBe("entre 2 e 4 min");
    expect(formatDurationRange(-30, 30)).toBe("menos de 1 min");
  });
});

describe("formatApproxDuration", () => {
  it("abaixo de 1 min vira 'menos de 1 min'", () => {
    expect(formatApproxDuration(0)).toBe("menos de 1 min");
    expect(formatApproxDuration(59)).toBe("menos de 1 min");
    expect(formatApproxDuration(-10)).toBe("menos de 1 min");
  });

  it("arredonda para o minuto e usa 'cerca de'", () => {
    expect(formatApproxDuration(60)).toBe("cerca de 1 min");
    expect(formatApproxDuration(170)).toBe("cerca de 3 min");
    expect(formatApproxDuration(4200)).toBe("cerca de 1 h 10 min");
    expect(formatApproxDuration(3600)).toBe("cerca de 1 h");
  });
});

describe("remainingSeconds", () => {
  it("estimativa menos o decorrido, nunca negativo", () => {
    expect(remainingSeconds(120, 30)).toBe(90);
    expect(remainingSeconds(120, 120)).toBe(0);
    expect(remainingSeconds(120, 500)).toBe(0);
  });

  it("decorrido negativo (relógio atrasado) conta como zero", () => {
    expect(remainingSeconds(120, -15)).toBe(120);
  });
});

describe("fallbackDurationRange", () => {
  it("aplica 0,7x e 1,5x sobre a tabela fixa por problemType", () => {
    for (const [type, seconds] of Object.entries(FALLBACK_DURATION_SECONDS)) {
      expect(fallbackDurationRange(type)).toEqual({
        minSeconds: seconds * ETA_RANGE_FACTORS.min,
        maxSeconds: seconds * ETA_RANGE_FACTORS.max,
      });
    }
    expect(FALLBACK_DURATION_SECONDS).toEqual({
      classification: 120,
      regression: 120,
      forecasting: 240,
    });
  });

  it("devolve null para tipo desconhecido", () => {
    expect(fallbackDurationRange("clustering")).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("segundos, minutos e horas", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45.9)).toBe("45s");
    expect(formatElapsed(125)).toBe("2min 05s");
    expect(formatElapsed(3789)).toBe("1h 03min 09s");
  });

  it("negativo vira zero", () => {
    expect(formatElapsed(-5)).toBe("0s");
  });
});

describe("rowBucket", () => {
  it("faixas <1k, 1k–10k, 10k–100k, >=100k", () => {
    expect(rowBucket(0)).toBe("lt_1k");
    expect(rowBucket(999)).toBe("lt_1k");
    expect(rowBucket(1_000)).toBe("1k_10k");
    expect(rowBucket(9_999)).toBe("1k_10k");
    expect(rowBucket(10_000)).toBe("10k_100k");
    expect(rowBucket(99_999)).toBe("10k_100k");
    expect(rowBucket(100_000)).toBe("gte_100k");
    expect(rowBucket(5_000_000)).toBe("gte_100k");
  });
});

describe("median", () => {
  it("ímpar devolve o central, par a média dos dois centrais", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([42])).toBe(42);
  });
});

function sample(
  problemType: string,
  durationSeconds: number,
  rowCount: number | null,
): DurationSample {
  return { problemType, durationSeconds, rowCount };
}

describe("computeDurationMedians", () => {
  it("agrupa por célula (tipo + faixa) e por tipo; sem rowCount só entra no tipo", () => {
    const medians = computeDurationMedians([
      sample("classification", 100, 500),
      sample("classification", 300, 800),
      sample("classification", 900, 50_000),
      sample("classification", 700, null),
      sample("forecasting", 240, 2_000),
    ]);
    expect(medians.byCell.get("classification:lt_1k")).toEqual({
      seconds: 200,
      samples: 2,
    });
    expect(medians.byCell.get("classification:10k_100k")).toEqual({
      seconds: 900,
      samples: 1,
    });
    expect(medians.byType.get("classification")).toEqual({
      seconds: 500,
      samples: 4,
    });
    expect(medians.byType.get("forecasting")).toEqual({
      seconds: 240,
      samples: 1,
    });
  });

  it("ignora durações inválidas (NaN, negativas)", () => {
    const medians = computeDurationMedians([
      sample("regression", Number.NaN, 10),
      sample("regression", -5, 10),
      sample("regression", 60, 10),
    ]);
    expect(medians.byType.get("regression")).toEqual({
      seconds: 60,
      samples: 1,
    });
  });
});

describe("estimateTrainingDuration", () => {
  const NOW = new Date(2026, 8, 2, 12, 0, 0);

  function fakeStore(samples: DurationSample[]) {
    const calls: Date[] = [];
    const store: DurationHistoryStore = {
      async listSucceededDurations(since) {
        calls.push(since);
        return samples;
      },
    };
    return { store, calls };
  }

  function repeat(
    problemType: string,
    durations: number[],
    rowCount: number | null,
  ): DurationSample[] {
    return durations.map((d) => sample(problemType, d, rowCount));
  }

  beforeEach(() => {
    resetTrainingDurationCache();
  });

  afterEach(() => {
    resetTrainingDurationCache();
    vi.restoreAllMocks();
  });

  it("usa a mediana da célula quando ela tem amostras suficientes", async () => {
    const { store, calls } = fakeStore([
      ...repeat("classification", [100, 110, 120, 130, 900], 500),
      ...repeat("classification", [3_000, 3_100, 3_200, 3_300, 3_400], 50_000),
    ]);
    const estimate = await estimateTrainingDuration(
      { problemType: "classification", rowCount: 700 },
      { store, now: NOW },
    );
    expect(estimate).toEqual({
      seconds: 120,
      samples: 5,
      source: "history_cell",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      new Date(NOW.getTime() - DURATION_HISTORY_DAYS * 24 * 60 * 60 * 1000),
    );
  });

  it("célula com menos de 5 amostras cai na mediana do tipo", async () => {
    const { store } = fakeStore([
      ...repeat("regression", [10, 20, 30, 40], 500),
      ...repeat("regression", [600, 700, 800], 20_000),
    ]);
    expect(MIN_DURATION_SAMPLES).toBe(5);
    const estimate = await estimateTrainingDuration(
      { problemType: "regression", rowCount: 500 },
      { store, now: NOW },
    );
    expect(estimate).toEqual({
      seconds: 40,
      samples: 7,
      source: "history_type",
    });
  });

  it("rowCount desconhecido pula a célula e usa o tipo", async () => {
    const { store } = fakeStore(
      repeat("forecasting", [100, 200, 300, 400, 500], 100),
    );
    const estimate = await estimateTrainingDuration(
      { problemType: "forecasting", rowCount: null },
      { store, now: NOW },
    );
    expect(estimate?.source).toBe("history_type");
    expect(estimate?.seconds).toBe(300);
  });

  it("tipo com menos de 5 amostras cai na tabela fixa da US-006", async () => {
    const { store } = fakeStore(repeat("forecasting", [1, 2, 3, 4], 100));
    const estimate = await estimateTrainingDuration(
      { problemType: "forecasting", rowCount: 100 },
      { store, now: NOW },
    );
    expect(estimate).toEqual({
      seconds: FALLBACK_DURATION_SECONDS.forecasting,
      samples: 0,
      source: "fallback",
    });
  });

  it("tipo sem histórico nem fallback devolve null", async () => {
    const { store } = fakeStore([]);
    await expect(
      estimateTrainingDuration(
        { problemType: "clustering", rowCount: 100 },
        { store, now: NOW },
      ),
    ).resolves.toBeNull();
  });

  it("cacheia as medianas por 5 min por processo", async () => {
    const { store, calls } = fakeStore(
      repeat("classification", [50, 60, 70, 80, 90], 100),
    );
    const input = { problemType: "classification", rowCount: 100 };
    await estimateTrainingDuration(input, { store, now: NOW });
    const withinTtl = new Date(
      NOW.getTime() + DURATION_MEDIANS_CACHE_TTL_MS - 1,
    );
    const cached = await estimateTrainingDuration(input, {
      store,
      now: withinTtl,
    });
    expect(cached?.seconds).toBe(70);
    expect(calls).toHaveLength(1);

    const afterTtl = new Date(NOW.getTime() + DURATION_MEDIANS_CACHE_TTL_MS);
    await estimateTrainingDuration(input, { store, now: afterTtl });
    expect(calls).toHaveLength(2);
    expect(DURATION_MEDIANS_CACHE_TTL_MS).toBe(5 * 60_000);
  });

  it("o cache é compartilhado entre tipos e resetável", async () => {
    const { store, calls } = fakeStore([]);
    await estimateTrainingDuration(
      { problemType: "classification", rowCount: 1 },
      { store, now: NOW },
    );
    await estimateTrainingDuration(
      { problemType: "regression", rowCount: 1 },
      { store, now: NOW },
    );
    expect(calls).toHaveLength(1);
    resetTrainingDurationCache();
    await estimateTrainingDuration(
      { problemType: "regression", rowCount: 1 },
      { store, now: NOW },
    );
    expect(calls).toHaveLength(2);
  });

  it("falha na consulta não lança: usa o fallback, avisa e não martela o banco", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const store: DurationHistoryStore = {
      async listSucceededDurations() {
        calls += 1;
        throw new Error("db down");
      },
    };
    const input = { problemType: "classification", rowCount: 100 };
    const estimate = await estimateTrainingDuration(input, { store, now: NOW });
    expect(estimate).toEqual({
      seconds: FALLBACK_DURATION_SECONDS.classification,
      samples: 0,
      source: "fallback",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    await estimateTrainingDuration(input, {
      store,
      now: new Date(NOW.getTime() + 2_000),
    });
    expect(calls).toBe(1);
  });

  it("falha depois de um cache válido mantém o último valor conhecido", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let fail = false;
    const store: DurationHistoryStore = {
      async listSucceededDurations() {
        if (fail) throw new Error("db down");
        return repeat("classification", [50, 60, 70, 80, 90], 100);
      },
    };
    const input = { problemType: "classification", rowCount: 100 };
    await estimateTrainingDuration(input, { store, now: NOW });
    fail = true;
    const afterTtl = new Date(
      NOW.getTime() + DURATION_MEDIANS_CACHE_TTL_MS + 1,
    );
    const estimate = await estimateTrainingDuration(input, {
      store,
      now: afterTtl,
    });
    expect(estimate?.seconds).toBe(70);
    expect(estimate?.source).toBe("history_cell");
  });
});

describe("simulateQueueWait", () => {
  it("distribui os jobs à frente pelos slots e devolve o slot que libera primeiro", () => {
    // 4 slots, 6 jobs de 120 s: 4 entram agora, 2 esperam 120 s — o 7º entra em 120 s
    expect(simulateQueueWait([], [120, 120, 120, 120, 120, 120], 4)).toBe(120);
    // 9 jobs: 3 rodadas completas, o próximo só entra em 240 s
    expect(simulateQueueWait([], new Array(8).fill(120), 4)).toBe(240);
    expect(simulateQueueWait([], [], 4)).toBe(0);
  });

  it("ativos ocupam slots com o restante; restante negativo conta como zero", () => {
    // 2 slots: um ativo com 20 s restantes e outro com 120 s; 1 job à frente
    // pega o slot dos 20 s (fica 140) e o nosso entra no de 120 s
    expect(simulateQueueWait([120, 20], [120], 2)).toBe(120);
    expect(simulateQueueWait([-30, 100], [], 2)).toBe(0);
    expect(simulateQueueWait([-30, 100], [60], 2)).toBe(60);
  });

  it("concorrência inválida vira 1 slot", () => {
    expect(simulateQueueWait([], [10, 10], 0)).toBe(20);
  });
});

describe("estimateQueueWait", () => {
  const NOW = new Date(2026, 8, 2, 12, 0, 0);
  const JOB = "job-own";
  const OWN: TrainingJobInfo = { problemType: "classification", rowCount: 100 };

  const emptyHistory: DurationHistoryStore = {
    async listSucceededDurations() {
      return [];
    },
  };

  function snapshotOf(
    partial: Partial<TrainingQueueSnapshot>,
  ): () => Promise<TrainingQueueSnapshot | null> {
    return async () => ({
      active: [],
      waiting: [],
      ahead: [],
      position: null,
      total: 0,
      ...partial,
    });
  }

  function infoStore(entries: Record<string, TrainingJobInfo>) {
    const calls: string[][] = [];
    const store: TrainingJobInfoStore = {
      async listJobInfo(ids) {
        calls.push(ids);
        return new Map(
          ids.flatMap((id) => (entries[id] ? [[id, entries[id]]] : [])),
        );
      },
    };
    return { store, calls };
  }

  beforeEach(() => {
    resetTrainingDurationCache();
  });

  afterEach(() => {
    resetTrainingDurationCache();
    vi.restoreAllMocks();
  });

  it("concorrência 4 com 6 jobs à frente e nenhum ativo: espera uma rodada", async () => {
    const ahead = ["a1", "a2", "a3", "a4", "a5", "a6"];
    const { store, calls } = infoStore({});
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({ ahead, position: 7, total: 7 }),
      concurrency: 4,
      now: NOW,
    });
    // Sem histórico nem info dos outros jobs, tudo vale o fallback de 120 s
    expect(estimate).toEqual({
      minSeconds: 240 * ETA_RANGE_FACTORS.min,
      maxSeconds: 240 * ETA_RANGE_FACTORS.max,
      position: 7,
      total: 7,
      waitSeconds: 120,
      totalSeconds: 240,
      own: {
        seconds: FALLBACK_DURATION_SECONDS.classification,
        samples: 0,
        source: "fallback",
      },
      startedAt: null,
    });
    expect(
      formatDurationRange(estimate!.minSeconds, estimate!.maxSeconds),
    ).toBe("entre 3 e 6 min");
    expect(calls).toEqual([ahead]);
  });

  it("sem jobs ativos e primeiro da fila: só a estimativa própria", async () => {
    const { store, calls } = infoStore({});
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({ position: 1, total: 1 }),
      concurrency: 4,
      now: NOW,
    });
    expect(estimate).toMatchObject({
      position: 1,
      total: 1,
      waitSeconds: 0,
      totalSeconds: 120,
      minSeconds: 84,
      maxSeconds: 180,
    });
    expect(calls).toEqual([]);
  });

  it("Redis indisponível (snapshot null) devolve null", async () => {
    const { store, calls } = infoStore({});
    await expect(
      estimateQueueWait(JOB, OWN, {
        store: emptyHistory,
        jobInfoStore: store,
        snapshot: async () => null,
        now: NOW,
      }),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it("desconta o tempo já rodado dos ativos e usa o tipo real de cada job", async () => {
    const { store } = infoStore({
      "act-forecast": { problemType: "forecasting", rowCount: 500 },
      "act-class": { problemType: "classification", rowCount: 500 },
    });
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({
        active: [
          // forecasting (240 s) começou há 60 s → restam 180 s
          {
            trainingJobId: "act-forecast",
            processedOn: NOW.getTime() - 60_000,
          },
          // classification (120 s) começou há 100 s → restam 20 s
          { trainingJobId: "act-class", processedOn: NOW.getTime() - 100_000 },
        ],
        ahead: ["ahead-unknown"],
        position: 2,
        total: 2,
      }),
      concurrency: 2,
      now: NOW,
    });
    // O job à frente (proxy: 120 s) pega o slot que libera em 20 s → 140 s;
    // o nosso entra nesse mesmo slot aos 140 s, antes do outro (180 s)
    expect(estimate).toMatchObject({
      waitSeconds: 140,
      totalSeconds: 260,
      position: 2,
      total: 2,
    });
  });

  it("ativo sem processedOn conta a estimativa inteira", async () => {
    const { store } = infoStore({});
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({
        active: [{ trainingJobId: "act", processedOn: null }],
        position: 1,
        total: 1,
      }),
      concurrency: 1,
      now: NOW,
    });
    expect(estimate?.waitSeconds).toBe(120);
    expect(estimate?.totalSeconds).toBe(240);
  });

  it("job já fora de waiting (rodando) não soma espera", async () => {
    const { store } = infoStore({});
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({
        active: [
          { trainingJobId: JOB, processedOn: NOW.getTime() - 30_000 },
          { trainingJobId: "other", processedOn: NOW.getTime() },
        ],
        position: null,
        total: 3,
      }),
      concurrency: 1,
      now: NOW,
    });
    expect(estimate).toMatchObject({
      position: null,
      total: 3,
      waitSeconds: 0,
      totalSeconds: 120,
      // processedOn do próprio job = início real do treino
      startedAt: NOW.getTime() - 30_000,
    });
  });

  it("job na fila (não ativo) não tem startedAt", async () => {
    const { store } = infoStore({});
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({
        active: [{ trainingJobId: "other", processedOn: NOW.getTime() }],
        position: 1,
        total: 1,
      }),
      concurrency: 2,
      now: NOW,
    });
    expect(estimate).toMatchObject({ position: 1, startedAt: null });
  });

  it("pending: job ainda fora do Redis entra como último de waiting", async () => {
    const waiting = ["w1", "w2"];
    const { store, calls } = infoStore({
      w1: { problemType: "forecasting", rowCount: 10 },
    });
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      // snapshot de quem não está na fila: ahead vazio, position null
      snapshot: snapshotOf({
        active: [{ trainingJobId: "a1", processedOn: NOW.getTime() - 60_000 }],
        waiting,
        ahead: [],
        position: null,
        total: 2,
      }),
      concurrency: 1,
      now: NOW,
      pending: true,
    });
    // 1 slot: a1 restam 60 s, w1 (forecasting) 240 s, w2 (proxy) 120 s
    expect(estimate).toMatchObject({
      position: 3,
      total: 3,
      waitSeconds: 60 + 240 + 120,
      totalSeconds: 60 + 240 + 120 + 120,
      startedAt: null,
    });
    expect(calls).toEqual([["a1", ...waiting]]);
  });

  it("pending com o job já visível em waiting (corrida) usa a posição real", async () => {
    const { store } = infoStore({});
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({
        waiting: ["w1", JOB],
        ahead: ["w1"],
        position: 2,
        total: 2,
      }),
      concurrency: 1,
      now: NOW,
      pending: true,
    });
    expect(estimate).toMatchObject({
      position: 2,
      total: 2,
      waitSeconds: 120,
      totalSeconds: 240,
    });
  });

  it("usa a mediana histórica na estimativa própria e nos jobs da fila", async () => {
    const history: DurationHistoryStore = {
      async listSucceededDurations() {
        return [
          ...repeatSamples("classification", [60, 60, 60, 60, 60], 100),
          ...repeatSamples("forecasting", [600, 600, 600, 600, 600], 100),
        ];
      },
    };
    const { store } = infoStore({
      ahead: { problemType: "forecasting", rowCount: 100 },
    });
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: history,
      jobInfoStore: store,
      snapshot: snapshotOf({ ahead: ["ahead"], position: 2, total: 2 }),
      concurrency: 1,
      now: NOW,
    });
    expect(estimate).toMatchObject({
      waitSeconds: 600,
      totalSeconds: 660,
      own: { seconds: 60, source: "history_cell", samples: 5 },
    });
  });

  it("falha ao ler os jobs do banco: avisa e usa a estimativa própria como proxy", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store: TrainingJobInfoStore = {
      async listJobInfo() {
        throw new Error("db down");
      },
    };
    const estimate = await estimateQueueWait(JOB, OWN, {
      store: emptyHistory,
      jobInfoStore: store,
      snapshot: snapshotOf({ ahead: ["a1", "a2"], position: 3, total: 3 }),
      concurrency: 1,
      now: NOW,
    });
    expect(estimate?.waitSeconds).toBe(240);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("tipo sem estimativa própria devolve null", async () => {
    const { store } = infoStore({});
    await expect(
      estimateQueueWait(
        JOB,
        { problemType: "clustering", rowCount: 100 },
        {
          store: emptyHistory,
          jobInfoStore: store,
          snapshot: snapshotOf({ position: 1, total: 1 }),
          now: NOW,
        },
      ),
    ).resolves.toBeNull();
  });
});

function repeatSamples(
  problemType: string,
  durations: number[],
  rowCount: number | null,
): DurationSample[] {
  return durations.map((d) => sample(problemType, d, rowCount));
}
