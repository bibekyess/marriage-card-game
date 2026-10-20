import { expect, Page, test } from "@playwright/test";

async function startPractice(page: Page, rounds = "1", bots = "1") {
  await page.goto("/");
  await page.fill("#name", "Tester");
  await page.getByRole("button", { name: "Practice with bots" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: bots, exact: true }).first().click();
  await dialog.getByRole("button", { name: rounds === "0" ? "∞" : rounds, exact: true }).last().click();
  await dialog.getByRole("button", { name: "Deal", exact: true }).click();
  await expect(page.getByTestId("hand")).toBeVisible();
}

async function waitMyTurn(page: Page) {
  await expect(page.getByTestId("hint")).toContainText("Your turn", { timeout: 30_000 });
}

test("play a turn, refresh, and keep the same seat and cards", async ({ page }) => {
  await startPractice(page, "3", "2");
  await waitMyTurn(page);
  await page.getByTestId("stock").click();
  await expect(page.getByTestId("discard-btn")).toBeVisible();
  const cards = page.locator("[data-card]");
  await expect(cards).toHaveCount(22);
  const thrown = await cards.first().getAttribute("data-card");
  await cards.first().click();
  await page.getByTestId("discard-btn").click();
  await expect(cards).toHaveCount(21);

  const before = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-card")).sort());
  expect(before).not.toContain(thrown);
  await page.reload();
  // The cached table shows straight away while the live state is fetched.
  await expect(page.getByTestId("hand")).toBeVisible({ timeout: 2000 });
  await expect(page.getByText("Taking your seat…")).toHaveCount(0);
  await expect(page.locator("[data-card]")).toHaveCount(21);
  const after = await page.locator("[data-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-card")).sort());
  expect(after).toEqual(before);
});

test("a quick flick up throws the card, even when the touch events arrive together", async ({ page }) => {
  await startPractice(page, "3", "2");
  // A dealt tunnela changes the hint, so wait for the stock to be drawable instead.
  await expect(page.getByTestId("stock")).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId("stock").click();
  await expect(page.getByTestId("discard-btn")).toBeVisible();
  const cards = page.locator("[data-card]");
  await expect(cards).toHaveCount(22);
  // iOS often delivers down, move and up back to back, before React re-renders.
  const thrown = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-card]")!;
    const r = el.getBoundingClientRect();
    const x = r.left + 6, y = r.top + r.height / 2;
    const fire = (type: string, cy: number) =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, clientX: x, clientY: cy }));
    fire("pointerdown", y);
    fire("pointermove", y - r.height);
    fire("pointerup", y - r.height * 2);
    return el.getAttribute("data-card");
  });
  await expect(cards).toHaveCount(21);
  await expect(page.locator(`[data-card="${thrown}"]`)).toHaveCount(0);
});

test("a bot plays a whole match for me and the settlement shows who pays", async ({ page }) => {
  await startPractice(page, "1", "2");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Let a bot play for me" }).click();
  const result = page.getByTestId("round-result");
  await expect(result).toBeVisible({ timeout: 60_000 });
  await expect(result).toContainText(/won|called off/);
  await page.getByTestId("next-round").click(); // last round → settle up
  const sheet = page.getByTestId("score-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Who pays whom")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Share scorecard" })).toBeVisible();
});

test("full screen button toggles the browser bars away and back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "phones get it automatically from the Deal tap");
  await startPractice(page);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test("two people at one table by code", async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.goto("/");
  await host.fill("#name", "Host");
  await host.getByRole("button", { name: "Create a table" }).click();
  await host.getByRole("button", { name: "Open table" }).click();
  await expect(host.getByText("Table code")).toBeVisible();
  const code = host.url().split("/t/")[1];
  expect(code).toMatch(/^[A-Z]{4}$/);

  // Guest opens the shared link.
  await guest.goto(`/t/${code}`);
  await guest.fill("#join-name", "Guest");
  await guest.getByRole("button", { name: "Join table" }).click();
  await expect(guest.getByText(`Waiting for Host to deal`)).toBeVisible();
  await expect(host.getByText("Guest")).toBeVisible();

  await host.getByRole("button", { name: "Deal cards" }).click();
  await expect(host.getByTestId("hand")).toBeVisible();
  await expect(guest.getByTestId("hand")).toBeVisible();
  await waitMyTurn(host);
  await expect(guest.getByTestId("hint")).toContainText("Host is playing");

  await host.getByTestId("stock").click();
  await host.locator("[data-card]").first().click();
  await host.getByTestId("discard-btn").click();
  await waitMyTurn(guest);

  // Guest's network drops and comes back: still seated, still their turn.
  await guestCtx.setOffline(true);
  await expect(guest.getByText("Reconnecting…")).toBeVisible({ timeout: 30_000 });
  await guestCtx.setOffline(false);
  await expect(guest.getByText("Reconnecting…")).toBeHidden({ timeout: 30_000 });
  await waitMyTurn(guest);
  await hostCtx.close();
  await guestCtx.close();
});

test("Your tables brings me back, and finished matches appear in history", async ({ page }) => {
  await startPractice(page, "1", "1");
  const code = page.url().split("/t/")[1];
  // Leave the page without leaving the table (e.g. closed the tab, lost the link).
  await page.goto("/");
  const yours = page.getByRole("region", { name: "Your tables" });
  await expect(yours.getByText(code)).toBeVisible();
  await yours.getByText(code).click();
  await expect(page.getByTestId("hand")).toBeVisible();

  // Finish the match with a bot, then find it in history.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Let a bot play for me" }).click();
  await expect(page.getByTestId("round-result")).toBeVisible({ timeout: 60_000 });
  await page.goto("/");
  await page.getByRole("button", { name: "History" }).click();
  const sheet = page.getByTestId("history-sheet");
  await expect(sheet.getByText(code)).toBeVisible();
  await sheet.getByText(code).click();
  await expect(page.getByTestId("score-sheet")).toBeVisible();
});
