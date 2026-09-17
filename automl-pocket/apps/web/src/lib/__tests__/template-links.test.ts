import { describe, expect, it } from "vitest";

import {
  TEMPLATE_DOWNLOAD_PATH,
  TEMPLATE_FORMATS,
  TEMPLATE_SOURCES,
  templateDownloadHref,
} from "@/lib/template-links";

describe("templateDownloadHref", () => {
  it("aponta para a rota da planilha modelo com format e source", () => {
    expect(templateDownloadHref("xlsx", "upload")).toBe(
      `${TEMPLATE_DOWNLOAD_PATH}?format=xlsx&source=upload`,
    );
    expect(templateDownloadHref("csv", "error")).toBe(
      `${TEMPLATE_DOWNLOAD_PATH}?format=csv&source=error`,
    );
  });

  it("cobre todas as combinações aceitas pela rota", () => {
    for (const format of TEMPLATE_FORMATS) {
      for (const source of TEMPLATE_SOURCES) {
        const href = templateDownloadHref(format, source);
        const params = new URL(href, "http://localhost").searchParams;
        expect(params.get("format")).toBe(format);
        expect(params.get("source")).toBe(source);
      }
    }
  });
});
