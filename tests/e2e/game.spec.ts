import { expect, test, type Page } from "@playwright/test";

interface Mon {
  id: number;
  name: string;
  generation: number;
}

/** Test helper: identify the Pokémon on screen from the dataset (the UI never says). */
async function current(page: Page): Promise<Mon> {
  await expect(page.locator(".stage__img")).toBeVisible();
  return page.evaluate(async () => {
    const src = document.querySelector(".stage__img")!.getAttribute("src")!;
    const data = await (await fetch("data/pokemon.json")).json();
    const p = data.pokemon.find((x: { image: { path: string } }) => src.endsWith(x.image.path));
    return { id: p.id, name: p.name, generation: p.generation };
  });
}

async function guess(page: Page, text: string) {
  const input = page.getByLabel("Your guess");
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press("Enter");
}

/** A real Pokémon name that isn't the answer. */
function wrongName(answer: Mon): string {
  return answer.name === "Bulbasaur" ? "Pikachu" : "Bulbasaur";
}

async function startMode(page: Page, name: string) {
  await page.goto("#modes");
  await page.locator(".modes__item", { hasText: name }).click();
  await page.locator(".modes__start").click();
}

test.beforeEach(async ({ page }) => {
  // Reduced motion keeps tests fast; the full reveal has its own test.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("silhouette hides the answer until the reveal", async ({ page }) => {
  await page.goto("./");
  const mon = await current(page);
  const img = page.locator(".stage__img");
  await expect(img).toHaveAttribute("alt", "Mystery Pokémon silhouette");
  expect(await img.evaluate((el) => getComputedStyle(el).filter)).toBe("brightness(0)");
  expect(await img.getAttribute("src")).not.toContain(mon.name.toLowerCase());
  expect(await img.getAttribute("src")).not.toMatch(/\/\d{3,4}_/);
  await expect(page.locator("body")).not.toContainText(mon.name);

  await guess(page, mon.name);
  await expect(page.locator(".stage__name")).toHaveText(`It's ${mon.name}!`);
  await expect(img).toHaveAttribute("alt", mon.name);
  expect(await img.evaluate((el) => getComputedStyle(el).filter)).toBe("none");
});

test("classic: wrong, unknown and correct answers @mobile", async ({ page }) => {
  await page.goto("./");
  const mon = await current(page);

  await guess(page, "");
  await expect(page.getByRole("status").first()).toContainText("Type a name first");
  await guess(page, "Pikachoooo");
  await expect(page.getByRole("status").first()).toContainText("No Pokémon goes by that name");
  await guess(page, wrongName(mon));
  await expect(page.getByRole("status").first()).toContainText("Not quite! 2 guesses left");

  await guess(page, mon.name.toUpperCase());
  await expect(page.locator(".result__verdict")).toContainText("Correct!");
  await expect(page.locator(".result__points")).toHaveText("+70");
  await expect(page.locator(".score__value").first()).toHaveText("70");
});

test("rapid repeated submissions only score once", async ({ page }) => {
  await page.goto("./");
  const mon = await current(page);
  const input = page.getByLabel("Your guess");
  await input.fill(mon.name);
  await input.press("Enter");
  // Hammer Enter and the button while the round resolves.
  for (let i = 0; i < 4; i++) await page.keyboard.press("Enter");
  await page.locator(".guess__go").click({ timeout: 300, force: true }).catch(() => undefined);
  await expect(page.locator(".result")).toBeVisible();
  await expect(page.locator(".score__value").first()).toHaveText("100");
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem("wtp.stats.v1")!));
  expect(stats.roundsPlayed).toBe(1);
});

test("autocomplete works with the keyboard", async ({ page }) => {
  await page.goto("./");
  const input = page.getByLabel("Your guess");
  await input.fill("pika");
  const list = page.getByRole("listbox", { name: "Suggestions" });
  await expect(list.getByRole("option", { name: "Pikachu" })).toBeVisible();
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
  await input.press("Escape");
  await expect(list).toBeHidden();
});

test("the full anime reveal plays hold → flash → name, and can be skipped", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("./");
  let mon = await current(page);
  await page.evaluate(() => {
    const w = window as unknown as { steps: string[] };
    w.steps = [];
    const stage = document.querySelector(".stage")!;
    new MutationObserver(() => w.steps.push(stage.getAttribute("data-step")!)).observe(stage, {
      attributes: true,
      attributeFilter: ["data-step"],
    });
  });
  await guess(page, mon.name);
  await expect(page.locator(".result")).toBeVisible();
  const steps = await page.evaluate(() => (window as unknown as { steps: string[] }).steps);
  const order = ["hold", "flash", "named", "result"].map((s) => steps.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);

  // Next round: skip during the hold.
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Next Pokémon" }).click();
  mon = await current(page);
  await guess(page, mon.name);
  await expect(page.locator(".stage")).toHaveAttribute("data-step", "hold");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator(".result")).toBeVisible({ timeout: 300 });
});

test("progress, settings and Pokédex survive a reload", async ({ page }) => {
  await page.goto("./");
  const mon = await current(page);
  await guess(page, mon.name);
  await expect(page.locator(".result")).toBeVisible();

  await page.goto("#options");
  await page.getByRole("radio", { name: "Off" }).first().click(); // sound off
  await page.reload();

  await page.goto("#trainer");
  await expect(page.locator(".trainer__row").filter({ hasText: "Correct" }).locator("dd")).toHaveText("1");
  await page.goto("#pokedex");
  await expect(page.locator(".dex__cell.is-found")).toHaveCount(1);
  await expect(page.locator(".dex__cell.is-found")).toContainText(mon.name);
  await page.goto("#options");
  await expect(page.getByRole("radiogroup", { name: "Sound effects" }).getByRole("radio", { name: "Off" })).toHaveAttribute("aria-checked", "true");
});

test("Pokédex keeps undiscovered Pokémon secret", async ({ page }) => {
  await page.goto("#pokedex");
  await expect(page.locator(".dex__cell.is-found")).toHaveCount(0);
  await page.getByPlaceholder("Search name or #").fill("Pikachu");
  await expect(page.locator(".dex__cell")).toHaveCount(0);
  await page.getByPlaceholder("Search name or #").fill("25");
  await expect(page.locator(".dex__cell")).toHaveCount(1);
  await expect(page.locator(".dex__cell")).toContainText("???");
});

test("corrupted saves are repaired, not fatal", async ({ page }) => {
  await page.goto("./");
  await current(page); // let the app finish its own first save
  await page.evaluate(() => {
    localStorage.setItem("wtp.stats.v1", "{broken");
    localStorage.setItem("wtp.settings.v1", JSON.stringify({ difficulty: 42 }));
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("couldn't be read");
  const mon = await current(page);
  await guess(page, mon.name);
  await expect(page.locator(".result")).toBeVisible();
});

test("timed mode counts down and ends", async ({ page }) => {
  await page.clock.install();
  await page.goto("./");
  await page.goto("#modes");
  await page.getByRole("button", { name: "Timed Challenge" }).click();
  await page.getByRole("radio", { name: "30 s" }).click();
  await page.locator(".modes__start").click();
  await expect(page.getByRole("timer")).toContainText("0:30");
  const mon = await current(page);
  await guess(page, mon.name);
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("heading", { name: "Time's up!" })).toBeVisible();
  await expect(page.locator(".summary__total")).toHaveText("100");
});

test("survival ends after three wrong answers", async ({ page }) => {
  await startMode(page, "Survival");
  for (let i = 0; i < 3; i++) {
    const mon = await current(page);
    await guess(page, wrongName(mon));
    await page.getByRole("button", { name: /Next Pokémon|See results/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Out of lives!" })).toBeVisible();
});

test("generation challenge only uses the chosen generation", async ({ page }) => {
  await page.goto("#modes");
  await page.getByRole("button", { name: "Generation Challenge" }).click();
  await page.getByRole("button", { name: "Generation 1", exact: true }).click(); // ensure selected
  const gen1 = page.getByRole("button", { name: "Generation 1", exact: true });
  if ((await gen1.getAttribute("aria-pressed")) !== "true") await gen1.click();
  for (const g of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const b = page.getByRole("button", { name: `Generation ${g}`, exact: true });
    if ((await b.getAttribute("aria-pressed")) === "true") await b.click();
  }
  await page.locator(".modes__start").click();
  for (let i = 0; i < 10; i++) {
    const mon = await current(page);
    expect(mon.generation).toBe(1);
    await guess(page, mon.name);
    await page.getByRole("button", { name: /Next Pokémon|See results/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Challenge complete!" })).toBeVisible();
  await expect(page.locator(".summary__total")).not.toHaveText("0");
});

test("hardcore: no suggestions, no hints, strict spelling", async ({ page }) => {
  await startMode(page, "Hardcore");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Hint/ })).toHaveCount(0);
  const mon = await current(page);
  await guess(page, "Pikachoo"); // misspellings count in Hardcore
  if (mon.name !== "Pikachoo") await expect(page.locator(".guess__balls")).toHaveAttribute("aria-label", "1 of 2 guesses left");
});

test("daily is the same for everyone and only counts once", async ({ browser }) => {
  const day = new Date("2026-10-12T10:00:00");
  const ids: number[] = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.clock.setFixedTime(day);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    await startMode(page, "Daily Pokémon");
    const mon = await current(page);
    ids.push(mon.id);
    if (i === 1) {
      // A reload mid-round keeps the wrong guess.
      await guess(page, wrongName(mon));
      await page.reload();
      await startMode(page, "Daily Pokémon");
      await expect(page.locator(".guess__balls")).toHaveAttribute("aria-label", "2 of 3 guesses left");
      await guess(page, mon.name);
      await page.getByRole("button", { name: "See today's result" }).click();
      await expect(page.locator(".daily-done")).toContainText(mon.name);
      // Starting again shows the result instead of a new round.
      await page.reload();
      await startMode(page, "Daily Pokémon");
      await expect(page.locator(".daily-done")).toBeVisible();
      await expect(page.locator(".guess__input")).toHaveCount(0);
      const daily = await page.evaluate(() => JSON.parse(localStorage.getItem("wtp.daily.v1")!));
      expect(daily.played).toBe(1);
      expect(daily.streak).toBe(1);
    }
    await ctx.close();
  }
  expect(ids[0]).toBe(ids[1]);
});

test("easy difficulty defaults to generation 1", async ({ page }) => {
  await page.goto("#options");
  await page.getByRole("radio", { name: "Easy" }).click();
  await page.goto("#play");
  for (let i = 0; i < 3; i++) {
    const mon = await current(page);
    expect(mon.generation).toBe(1);
    await page.getByRole("button", { name: "Give up" }).click();
    await page.getByRole("button", { name: "Next Pokémon" }).click();
  }
});

test("no horizontal overflow on any screen @mobile", async ({ page }) => {
  for (const screen of ["play", "modes", "pokedex", "trainer", "options"]) {
    await page.goto(`#${screen}`);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, screen).toBeLessThanOrEqual(0);
  }
});
