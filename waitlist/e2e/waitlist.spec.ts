import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * End-to-end checks for the spec's "Testing" list. Locators use roles and labels; the only ids
 * used are the documented hooks: #join (hero section) and #hero-email (hero email input).
 */

type AxeViolation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const DIALOG_TITLE = /You['’]re on the list/;

function randomOctet() {
  return Math.floor(Math.random() * 254) + 1;
}

function uniqueEmail() {
  return `e2e+${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.beforeEach(async ({ page }) => {
  // The server limits sign-ups per IP (x-forwarded-for). A made-up IP per test keeps parallel tests
  // from sharing one bucket. Next keeps an incoming x-forwarded-for header as it is.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomOctet()}.${randomOctet()}.${randomOctet()}` });
  // Vercel Web Analytics only exists on Vercel. Locally its script would 404 and log a console error,
  // and in dev it loads a debug script from Vercel's CDN. Stub both so the run needs no network.
  const emptyScript = { status: 200, contentType: "text/javascript", body: "" };
  await page.route("**/_vercel/insights/**", (route) => route.fulfill(emptyScript));
  await page.route("https://va.vercel-scripts.com/**", (route) => route.fulfill(emptyScript));
});

/** Opens the home page and waits until the hero form has hydrated. */
async function openHome(page: Page) {
  await page.goto("/");
  // JoinForm fills its hidden landing_path field on mount, so a value means React is in control of the form.
  await expect(page.locator('#join input[name="landing_path"]')).not.toHaveValue("");
}

function heroEmail(page: Page) {
  return page.locator("#hero-email");
}

function heroForm(page: Page) {
  return page.locator("form").filter({ has: heroEmail(page) });
}

function detailsDialog(page: Page) {
  return page.getByRole("dialog", { name: DIALOG_TITLE });
}

/** Scrolls without smooth scrolling, then waits two frames so scroll listeners have run. */
async function scrollToY(page: Page, top: number) {
  await page.evaluate(
    (y) =>
      new Promise<void>((resolve) => {
        window.scrollTo({ top: y, behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    top,
  );
}

async function joinFromHero(page: Page, email: string) {
  await heroEmail(page).fill(email);
  await heroForm(page).getByRole("button", { name: "Join the waitlist" }).click();
}

/** Waits for finite animations and transitions inside `locator` to finish, so axe sees final colours. */
async function settle(locator: Locator) {
  await locator.evaluate((element) =>
    Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

function axe(page: Page) {
  // nextjs-portal holds the dev-only Next.js indicator (present with E2E_SERVER=dev).
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).exclude("nextjs-portal");
}

/** Only serious and critical violations fail the build; the summary keeps failures readable. */
function seriousOrCritical(violations: AxeViolation[]) {
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(" ")) }));
}

test.describe("on a 360×640 screen", () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test("the hero email bar is visible without scrolling", async ({ page }) => {
    await openHome(page);

    await expect(heroEmail(page)).toHaveAccessibleName("Your email");
    await expect(heroEmail(page)).toBeInViewport({ ratio: 1 });
    await expect(heroForm(page).getByRole("button", { name: "Join the waitlist" })).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test("the header button moves focus to the hero email field", async ({ page }) => {
  await openHome(page);

  // Scroll down (the header hides), then up a little (it shows again), as a visitor would.
  await scrollToY(page, 1600);
  await scrollToY(page, 1300);

  const banner = page.getByRole("banner");
  const headerCta = banner
    .getByRole("link", { name: "Join the waitlist" })
    .or(banner.getByRole("button", { name: "Join the waitlist" }));
  await expect(headerCta).toBeInViewport();
  await headerCta.click();

  await expect(heroEmail(page)).toBeFocused();
  await expect(heroEmail(page)).toBeInViewport();
});

test("an invalid email shows a specific message", async ({ page }) => {
  await openHome(page);

  // Passes the browser's own type=email check, so the app's validation has to catch it.
  await joinFromHero(page, "sam@example");

  await expect(page.getByRole("alert").filter({ hasText: "Enter an email address, like sam@example.com." })).toBeVisible();
  await expect(detailsDialog(page)).toBeHidden();
  await expect(heroEmail(page)).toBeVisible();
});

test("a likely typo offers a one-tap fix", async ({ page }) => {
  await openHome(page);

  await heroEmail(page).fill("sam@gmial.com");
  await heroEmail(page).blur();

  await expect(page.getByText(/Did you mean/)).toBeVisible();
  const suggestion = page.getByRole("button", { name: /sam@gmail\.com/ });
  await suggestion.click();
  await expect(heroEmail(page)).toHaveValue("sam@gmail.com");
});

test("joining opens the details dialog, and Skip shows the joined state in the hero", async ({ page }) => {
  const email = uniqueEmail();
  await openHome(page);
  await joinFromHero(page, email);

  const dialog = detailsDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("2 quick questions to help us plan farms near you. Both optional.")).toBeVisible();

  // The visible "Skip" text button (a close icon may also be labelled Skip).
  await dialog.getByRole("button", { name: "Skip", exact: true }).filter({ hasText: "Skip" }).click();
  await expect(dialog).toBeHidden();

  const hero = page.locator("#join");
  await expect(hero.getByText(DIALOG_TITLE)).toBeVisible();
  await expect(hero.getByText(new RegExp(`We['’]ll email ${escapeRegExp(email)}`))).toBeVisible();
  await expect(heroEmail(page)).toHaveCount(0);
});

test("saving home type and postcode closes the dialog and shows the joined state everywhere", async ({ page }) => {
  await openHome(page);
  await joinFromHero(page, uniqueEmail());

  const dialog = detailsDialog(page);
  await expect(dialog).toBeVisible();

  await dialog.getByText("I rent", { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "I rent" })).toBeChecked();

  // Choosing a home type moves focus straight to the postcode.
  const postcode = dialog.getByRole("textbox", { name: /Postcode/ });
  await expect(postcode).toBeFocused();
  await postcode.fill("2000");

  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(page.locator("#join").getByText(DIALOG_TITLE)).toBeVisible();
  // Every JoinForm swaps its email bar for the joined view.
  await expect(page.getByRole("textbox", { name: "Your email" })).toHaveCount(0);
});

test("the page loads and scrolls with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`);
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await openHome(page);
  // Scroll the whole story so every section, reveal and scene layer renders.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) await scrollToY(page, y);
  await scrollToY(page, height);
  await expect(page.getByRole("contentinfo")).toBeInViewport();

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("the footer has the privacy link, sources, illustration label and disclaimer", async ({ page }) => {
  await openHome(page);
  const footer = page.getByRole("contentinfo");

  await expect(footer.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(footer.getByRole("link", { name: /ABS/ })).toHaveAttribute("href", /abs\.gov\.au/);
  await expect(footer.getByRole("link", { name: /Energy Consumers Australia/ })).toHaveAttribute("href", /energyconsumersaustralia\.com\.au/);
  await expect(footer.getByText("Illustration. Farm site to be announced.")).toBeVisible();
  await expect(footer.getByText(/is a concept in development.*It is not available yet\./)).toBeVisible();
});

test("the home page has no serious or critical accessibility violations", async ({ page }) => {
  await openHome(page);

  const results = await axe(page).analyze();
  expect(seriousOrCritical(results.violations)).toEqual([]);
});

test("the open details dialog has no serious or critical accessibility violations", async ({ page }) => {
  await openHome(page);
  await joinFromHero(page, uniqueEmail());

  const dialog = detailsDialog(page);
  await expect(dialog).toBeVisible();
  await settle(dialog);

  const results = await axe(page).include("dialog[open], [role='dialog']").analyze();
  expect(seriousOrCritical(results.violations)).toEqual([]);
});

test("the privacy policy renders", async ({ page }) => {
  await page.goto("/privacy");

  await expect(page).toHaveTitle(/Privacy Policy/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByText(/^Last updated: \d{1,2} [A-Z][a-z]+ \d{4}$/)).toBeVisible();
  for (const heading of ["What we collect", "Overseas disclosure", "How long we keep it", "See, fix or delete your details", "Complaints"]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /OAIC website/ })).toHaveAttribute("href", "https://www.oaic.gov.au/privacy/privacy-complaints");

  const results = await axe(page).analyze();
  expect(seriousOrCritical(results.violations)).toEqual([]);

  await page.getByRole("banner").getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/);
});
