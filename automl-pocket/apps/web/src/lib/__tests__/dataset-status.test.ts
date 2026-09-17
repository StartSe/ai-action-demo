import { describe, expect, it } from "vitest";

import { DATASET_STATUSES } from "@/db/schema";
import {
  DATASET_STATUS_LABEL,
  isDatasetProcessing,
  isDatasetSelectable,
} from "@/lib/dataset-status";

describe("dataset-status", () => {
  it("tem rótulo para todo valor do enum dataset_status", () => {
    for (const status of DATASET_STATUSES) {
      expect(DATASET_STATUS_LABEL[status]).toBeTruthy();
    }
    expect(DATASET_STATUS_LABEL.needs_review).toBe("Precisa de revisão");
  });

  it("needs_review não é processamento nem selecionável", () => {
    expect(isDatasetProcessing("needs_review")).toBe(false);
    expect(isDatasetSelectable("needs_review")).toBe(false);
  });

  it("mantém os status anteriores como antes", () => {
    expect(isDatasetProcessing("uploading")).toBe(true);
    expect(isDatasetProcessing("parsing")).toBe(true);
    expect(isDatasetProcessing("profiling")).toBe(true);
    expect(isDatasetProcessing("ready")).toBe(false);
    expect(isDatasetProcessing("error")).toBe(false);
    expect(isDatasetSelectable("ready")).toBe(true);
    expect(isDatasetSelectable("parsing")).toBe(true);
    expect(isDatasetSelectable("error")).toBe(false);
  });
});
