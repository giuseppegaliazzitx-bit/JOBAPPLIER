import { expect, test } from "@playwright/test";

test("primary nav reaches Jobs and Profile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What needs you" })).toBeVisible();
  await page.getByRole("link", { name: "Jobs" }).click();
  await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
  await expect(page.getByLabel("Job URLs")).toBeVisible();
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
});
