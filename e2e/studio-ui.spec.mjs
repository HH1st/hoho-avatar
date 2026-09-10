import { test, expect } from "@playwright/test";
import { zipSync } from "fflate";
import { readFileSync, readdirSync } from "node:fs";

test("character cards, import, and sample shortcut operate the studio", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  const bot = page.getByRole("button", { name: /Pixel Bot/ });
  await bot.click();
  await expect(bot).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#stageLabel")).toHaveText("Pixel Bot");
  await expect(bot).toBeEnabled();
  const directory = new URL("../public/characters/pixel-bot/", import.meta.url);
  const entries = Object.fromEntries(readdirSync(directory).map((name) => [
    `my-character/${name}`, new Uint8Array(readFileSync(new URL(name, directory))),
  ]));
  await page.locator("#avatarFile").setInputFiles({ name: "my-character.zip", mimeType: "application/zip", buffer: Buffer.from(zipSync(entries)) });
  await expect(page.locator("#customAvatarButton")).toBeVisible();
  await expect(page.locator("#customAvatarButton")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#stageLabel")).toHaveText("my-character");
  await page.getByRole("button", { name: /Niu Lai/ }).click();
  await expect(page.locator("#stageLabel")).toHaveText("Niu Lai");
  await page.locator("#demoSampleButton").click();
  await expect(page.locator("#tab-file")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#statusText")).toHaveText("AUDIO LIVE");
  await page.locator("#audioStopButton").click();
  expect(errors).toEqual([]);
});

test("voice mode tabs support arrow keys and expose the selected panel", async ({ page }) => {
  await page.goto("./");
  await page.locator("#tab-mic").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-file")).toBeFocused();
  await expect(page.locator("#panel-file")).toBeVisible();
  await expect(page.locator("#panel-mic")).toBeHidden();
  await page.keyboard.press("End");
  await expect(page.locator("#tab-agent")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.locator("#tab-mic")).toBeFocused();
});

for (const width of [390, 768, 1440]) {
  test(`studio controls fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("./");
    for (const mode of ["mic", "file", "tts", "agent"]) {
      await page.locator(`#tab-${mode}`).click();
      await expect(page.locator(`#panel-${mode}`)).toBeVisible();
      const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
    }
  });
}
