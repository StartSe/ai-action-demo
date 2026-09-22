import { test, expect } from "@playwright/test";

test("copiar confirma sem tirar foco e abrir link usa nova aba; falha de cópia orienta recuperação", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/simulacoes");
  const copiar = page.getByRole("button", { name: "Copiar link", exact: true }).filter({ visible: true }).first();
  const abrir = page.getByRole("link", { name: "Abrir link em nova aba", exact: true }).first();
  await expect(abrir).toHaveAttribute("target", "_blank");
  await copiar.click();
  await expect(page.getByText("Link copiado. Pronto para compartilhar.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await abrir.getAttribute("href"));
  await expect(copiar).toBeFocused();
  const popup = page.waitForEvent("popup");
  await abrir.click();
  const nova = await popup;
  await nova.waitForLoadState();
  expect(nova.url()).toContain("/simular/");
  await nova.close();
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Negado"); }; });
  await copiar.click();
  await expect(page.getByText(/Não foi possível copiar. Use Abrir link/)).toBeVisible();
  await page.screenshot({ path: "test-results/links-toast.png", fullPage: true });
});

test("configurações ocultam equipe técnica e a limpeza desaparece após sucesso e recarga", async ({ page }) => {
  let removidos = false;
  let falhar = true;
  await page.route("**/api/setup/exemplos", route => {
    if (route.request().method() === "DELETE") {
      if (falhar) return route.fulfill({ status: 500, json: { error: "Falha temporária" } });
      removidos = true;
    }
    return route.fulfill({ json: { removidos } });
  });
  await page.goto("/setup");
  await expect(page.getByText("Para a equipe técnica", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Remover dados de exemplo", exact: true }).click();
  await page.getByRole("button", { name: "Remover exemplos", exact: true }).click();
  await expect(page.getByText(/Não foi possível remover os exemplos/)).toBeVisible();
  falhar = false;
  await page.getByRole("button", { name: "Remover dados de exemplo", exact: true }).click();
  await page.getByRole("button", { name: "Remover exemplos", exact: true }).click();
  await expect(page.getByText(/Dados de exemplo removidos. Seus dados reais/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover dados de exemplo", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Voz do cliente (ElevenLabs)", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover dados de exemplo", exact: true })).toHaveCount(0);
});
