import { test, expect } from "@playwright/test";

test("chat interface renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Say anything" })).toBeVisible();
});
