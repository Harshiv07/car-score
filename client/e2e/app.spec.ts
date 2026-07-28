/**
 * Core UI scenarios. Deliberately data-independent: the e2e API starts on an
 * isolated empty database, so assertions rely on static UI (hero, filters,
 * tabs, theme) and URL behaviour rather than scraped inventory.
 */

import { test, expect } from "@playwright/test";

test("leaderboard renders its thesis, provenance line and filters", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header").getByText("CARSCORE")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/look at first/i);
  await expect(page.getByText(/listings/).first()).toBeVisible();
  await expect(page.getByLabel("Brand")).toBeVisible();
});

test("an empty inventory says so, rather than blaming filters", async ({ page }) => {
  // The e2e API starts on an isolated empty database, so this is the real
  // zero-inventory state. It used to render "No cars match these filters" with
  // advice to widen a range — while no filter was set — which sent the reader
  // to fix something that was never wrong.
  await page.goto("/");
  await expect(page.getByText("No listings yet.")).toBeVisible();
  await expect(page.getByText(/run a refresh from the header/i)).toBeVisible();
  await expect(page.getByText("No cars match these filters.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /clear all filters/i })).toHaveCount(0);
});

test("refresh lives in the header as a freshness control, not a page CTA", async ({ page }) => {
  await page.goto("/");
  const control = page.locator("header").getByRole("button", { name: /data freshness/i });
  await expect(control).toBeVisible();

  // It opens a popover rather than starting a crawl on a single click.
  await control.click();
  const panel = page.getByRole("dialog", { name: /data freshness/i });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: /refresh now|available in|refreshing/i })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("no horizontal overflow at any common width", async ({ page }) => {
  // 768px used to overflow: the top-pick hero went two-column at `md`, which
  // squeezed its title column to ~84px and pushed the panel off-screen.
  for (const width of [320, 360, 390, 414, 640, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("no text is rendered below 10px", async ({ page }) => {
  // The score's "/100" label was 8px, with a further 40-odd elements at 10px.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tiny = await page.evaluate(() =>
    [...document.querySelectorAll("body *")].filter(
      (el) => el.children.length === 0 && el.textContent?.trim() && parseFloat(getComputedStyle(el).fontSize) < 10
    ).length
  );
  expect(tiny).toBe(0);
});

test("filters move behind a drawer on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // The sidebar is hidden at this width; the drawer button is the way in.
  await page.getByRole("button", { name: /^filters/i }).click();
  const drawer = page.getByRole("dialog", { name: "Filters" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel("Brand")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
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
  await page.getByRole("link", { name: "New cars" }).first().click();
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

test("saved-cars page shows the empty state", async ({ page }) => {
  await page.goto("/favorites");
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
  await expect(page.getByRole("link", { name: /browse the leaderboard/i })).toBeVisible();
});
