/**
 * Core UI scenarios. Deliberately data-independent: the e2e API starts on an
 * isolated empty database, so assertions rely on static UI (hero, filters,
 * tabs, theme) and URL behaviour rather than scraped inventory.
 */

import { test, expect } from "@playwright/test";

test("leaderboard renders hero, KPI tiles and filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header").getByText("CARSCORE")).toBeVisible();
  await expect(page.getByText("Listings scanned", { exact: false })).toBeVisible();
  await expect(page.getByText("Average score", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /refresh/i })).toBeVisible();
  await expect(page.getByLabel("Brand")).toBeVisible();
});

test("brand filter writes make= into the URL", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brand").click();
  await page.getByRole("option", { name: "Honda" }).click();
  await expect(page).toHaveURL(/make=Honda/);
  // and switching brand clears any model selection atomically
  await page.getByLabel("Brand").click();
  await page.getByRole("option", { name: "Toyota" }).click();
  await expect(page).toHaveURL(/make=Toyota/);
  await expect(page).not.toHaveURL(/model=/);
});

test("year-to only offers years >= year-from", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Year from").click();
  await page.getByRole("option", { name: "2024", exact: true }).click();
  await expect(page).toHaveURL(/yearMin=2024/);
  await page.getByLabel("Year to").click();
  await expect(page.getByRole("option", { name: "2020", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "2025", exact: true })).toBeVisible();
});

test("new cars tab navigates and renders its page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "New Cars" }).click();
  await expect(page).toHaveURL(/\/new-cars/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/New\s*Cars/i);
});

test("new cars brand tabs filter the grid and write make= into the URL", async ({ page }) => {
  await page.goto("/new-cars");
  const tabs = page.getByRole("tab");
  await expect(tabs.first()).toBeVisible({ timeout: 20_000 }); // first live fetch can take a moment
  await expect(tabs.filter({ hasText: "All" })).toHaveAttribute("aria-selected", "true");

  const second = tabs.nth(1); // first brand tab after "All"
  const brandName = (await second.textContent())?.replace(/\s*\(\d+\)\s*$/, "").trim();
  await second.click();
  await expect(page).toHaveURL(new RegExp(`make=${encodeURIComponent(brandName ?? "")}`));
  await expect(second).toHaveAttribute("aria-selected", "true");
  // section headers are hidden once a single brand is isolated
  await expect(page.locator("main h2")).toHaveCount(0);

  await tabs.filter({ hasText: "All" }).click();
  await expect(page).not.toHaveURL(/make=/);
});

test("theme switch toggles dark mode", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("switch", { name: /light mode/i }).click();
  await expect(html).not.toHaveClass(/dark/);
  await page.getByRole("switch", { name: /dark mode/i }).click();
  await expect(html).toHaveClass(/dark/);
});

test("favourites page shows the empty state", async ({ page }) => {
  await page.goto("/favorites");
  await expect(page.getByText("No favourites yet")).toBeVisible();
  await expect(page.getByRole("link", { name: /browse listings/i })).toBeVisible();
});
