"""Benchmark de treino de classificação (US-001 — prática 100 executivos).

Mede a duração de `train_classification` sobre um dataset sintético do tamanho
do dataset da prática (20 linhas × 8 colunas), por modo e por nível de
concorrência, e imprime uma tabela markdown pronta para o runbook.

Fora do caminho de produção: nada em jobs/ ou main.py importa este script.

Uso (no container de testes do worker, a partir de apps/worker):
    uv run python scripts/benchmark_training.py
    uv run python scripts/benchmark_training.py --modes fastest --concurrency 1,4 \
        --repeat 1 --skip-large   # smoke rápido

A concorrência usa threads porque é assim que o worker roda treinos paralelos
em produção (bullmq.Worker com `concurrency` + asyncio.to_thread em main.py):
N treinos simultâneos disputam CPU dentro do MESMO processo Python.
"""

from __future__ import annotations

import os

# Espelha o environment de produção do worker (docker-compose). Precisa vir
# ANTES dos imports pesados: OMP_NUM_THREADS é lido quando o numpy carrega e
# MODEL_N_JOBS quando jobs.automl é importado.
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MODEL_N_JOBS", "2")

import argparse
import math
import platform
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from jobs.automl import train_classification  # noqa: E402

TARGET_COLUMN = "resultado"


def build_dataset(rows: int, cols: int, seed: int) -> tuple[pd.DataFrame, dict[str, str]]:
    """Dataset sintético determinístico com alvo binário aprendível.

    `cols` inclui o alvo; as features saem ~60% number / ~10% date / resto
    category, cobrindo os três ramos do pré-processador do automl.
    """
    rng = np.random.default_rng(seed)
    n_features = cols - 1
    n_num = max(1, int(n_features * 0.6))
    n_date = max(1, int(n_features * 0.1))
    n_cat = max(1, n_features - n_num - n_date)
    n_num = n_features - n_date - n_cat

    data: dict[str, object] = {}
    column_types: dict[str, str] = {}
    signal = np.zeros(rows)

    for i in range(n_num):
        values = rng.normal(size=rows)
        data[f"numero_{i + 1}"] = np.round(values * 10 + 50, 2)
        column_types[f"numero_{i + 1}"] = "number"
        if i < 3:
            signal = signal + values

    for i in range(n_date):
        days = rng.integers(0, 365 * 3, size=rows)
        data[f"data_{i + 1}"] = pd.Timestamp("2023-01-01") + pd.to_timedelta(days, unit="D")
        column_types[f"data_{i + 1}"] = "date"

    levels = ["baixo", "medio", "alto", "critico"]
    for i in range(n_cat):
        codes = rng.integers(0, len(levels), size=rows)
        data[f"categoria_{i + 1}"] = [levels[c] for c in codes]
        column_types[f"categoria_{i + 1}"] = "category"
        if i == 0:
            signal = signal + codes

    noise = rng.normal(scale=0.5, size=rows)
    target = np.where(signal + noise > np.median(signal + noise), "sim", "não")
    data[TARGET_COLUMN] = target
    column_types[TARGET_COLUMN] = "category"

    return pd.DataFrame(data), column_types


def run_one(df: pd.DataFrame, column_types: dict[str, str], mode: str) -> float:
    """Um treino completo; devolve a duração em segundos."""
    start = time.perf_counter()
    train_classification(
        df,
        target=TARGET_COLUMN,
        ignored_columns=[],
        mode=mode,
        column_types=column_types,
    )
    return time.perf_counter() - start


def measure(
    df: pd.DataFrame,
    column_types: dict[str, str],
    mode: str,
    workers: int,
    total_jobs: int,
) -> tuple[list[float], float]:
    """Roda `total_jobs` treinos com `workers` threads; durações + makespan."""
    start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(run_one, df, column_types, mode) for _ in range(total_jobs)]
        durations = [future.result() for future in futures]
    return durations, time.perf_counter() - start


def memory_gib() -> str:
    try:
        total = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        return f"{total / 1024**3:.1f} GiB"
    except (ValueError, OSError, AttributeError):
        return "n/d"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--modes", default="fastest,high_quality", help="modos separados por vírgula")
    parser.add_argument(
        "--concurrency", default="1,4,8,10,12", help="níveis de treinos simultâneos, separados por vírgula"
    )
    parser.add_argument(
        "--repeat", type=int, default=2, help="treinos por slot: total de treinos = concorrência × repeat"
    )
    parser.add_argument("--rows", type=int, default=20, help="linhas do dataset da prática")
    parser.add_argument("--cols", type=int, default=8, help="colunas (incluindo alvo) do dataset da prática")
    parser.add_argument("--skip-large", action="store_true", help="pula a medição do dataset grande")
    parser.add_argument("--large-rows", type=int, default=100_000)
    parser.add_argument("--large-cols", type=int, default=30)
    parser.add_argument("--large-runs", type=int, default=1, help="treinos por modo no dataset grande")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    modes = [m.strip() for m in args.modes.split(",") if m.strip()]
    levels = [int(c) for c in args.concurrency.split(",") if c.strip()]

    df, column_types = build_dataset(args.rows, args.cols, args.seed)

    # Aquecimento: primeiro treino paga import/alocação do xgboost e BLAS
    run_one(df, column_types, modes[0])

    print("# Benchmark de treino de classificação — US-001")
    print()
    print(f"- Data: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(
        f"- Hardware: {os.cpu_count()} vCPUs, RAM {memory_gib()}, "
        f"{platform.system()} {platform.machine()}, Python {platform.python_version()}"
    )
    print(
        f"- Envs: MODEL_N_JOBS={os.environ['MODEL_N_JOBS']}, "
        f"OMP_NUM_THREADS={os.environ['OMP_NUM_THREADS']}"
    )
    print(
        f"- Concorrência via threads no mesmo processo "
        f"(igual ao worker: bullmq concurrency + asyncio.to_thread)"
    )
    print()

    print(f"## Dataset da prática ({args.rows} linhas × {args.cols} colunas)")
    print()
    print(
        "| Modo | Simultâneos | Treinos | p50 (s) | p95 (s) | Makespan do lote (s) "
        "| Degradação vs 1 | Makespan proj. 100 treinos |"
    )
    print("|---|---|---|---|---|---|---|---|")

    baseline_p50: dict[str, float] = {}
    for mode in modes:
        for level in levels:
            total_jobs = max(level * args.repeat, level)
            durations, wall = measure(df, column_types, mode, level, total_jobs)
            p50 = float(np.percentile(durations, 50))
            p95 = float(np.percentile(durations, 95))
            if level == min(levels):
                baseline_p50[mode] = p50
            degradation = p50 / baseline_p50[mode] if baseline_p50.get(mode) else float("nan")
            # makespan ≈ ceil(100/C) × T com T = p95 medido NESSA concorrência
            projected = math.ceil(100 / level) * p95
            print(
                f"| {mode} | {level} | {total_jobs} | {p50:.2f} | {p95:.2f} "
                f"| {wall:.2f} | {degradation:.2f}x | {projected / 60:.1f} min |"
            )
    print()

    if args.skip_large:
        print("_Dataset grande: medição pulada (--skip-large)._")
        return

    large_df, large_types = build_dataset(args.large_rows, args.large_cols, args.seed + 1)
    print(
        f"## Dataset grande ({args.large_rows:,} linhas × {args.large_cols} colunas)"
        .replace(",", ".")
    )
    print()
    print("Quanto tempo um treino pesado ocupa UM slot da fila (concorrência 1):")
    print()
    print("| Modo | Treinos | p50 (s) | p95 (s) |")
    print("|---|---|---|---|")
    for mode in modes:
        durations, _ = measure(large_df, large_types, mode, 1, args.large_runs)
        p50 = float(np.percentile(durations, 50))
        p95 = float(np.percentile(durations, 95))
        print(f"| {mode} | {args.large_runs} | {p50:.2f} | {p95:.2f} |")


if __name__ == "__main__":
    main()
