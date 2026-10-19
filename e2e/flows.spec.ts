import { expect, type Page, test } from "@playwright/test";

// End-to-end coverage of PRD flows F1–F7 against a fresh browser profile.

/** Hard navigation after giving IndexedDB a moment to persist the last write. */
async function reload(page: Page, path: string) {
  await page.waitForTimeout(300);
  await page.goto(path);
}

async function onboard(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/onboarding/);
  await page.getByRole("button", { name: "Continue" }).click();
  // F1 step 2: salary + budget month
  await page.getByPlaceholder("85,000").fill("85000");
  await page.getByRole("button", { name: "Continue" }).click();
  // Bank
  await page.getByPlaceholder("0").first().fill("50000");
  await page.getByPlaceholder("deep@boi").fill("deep@boi");
  await page.getByRole("button", { name: "Continue" }).click();
  // Card
  await page.getByRole("textbox").nth(1).fill("4821");
  await page.getByRole("textbox").nth(2).fill("100000");
  await page.getByRole("button", { name: "Continue" }).click();
  // Rent & bills
  await page.getByRole("textbox").first().fill("15000");
  await page.getByRole("button", { name: "Continue" }).click();
  // Budgets
  await page.getByRole("button", { name: /See my Safe-to-Spend/ }).click();
  await expect(page.getByText("Today you can spend")).toBeVisible();
}

async function quickAdd(page: Page, text: string) {
  await page.getByRole("button", { name: "Add transaction" }).first().click();
  const input = page.getByLabel("Quick add");
  await input.fill(text);
  return input;
}

test("F1 + F2: onboarding, then log a UPI spend in seconds", async ({ page }) => {
  await onboard(page);
  await quickAdd(page, "180 chai upi");
  await expect(page.getByText("Food › Tea & snacks").first()).toBeVisible();
  await page.getByRole("button", { name: /^Save ₹180/ }).click();
  await expect(page.getByRole("button", { name: /Chai/ }).first()).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/home.png", fullPage: true });
});

test("F3: card spend lands on the card and paying it is a transfer", async ({ page }) => {
  await onboard(page);
  await quickAdd(page, "2400 amazon card");
  await page.getByRole("button", { name: /^Save ₹2,400/ }).click();
  await reload(page, "/cards");
  await page.getByText("BOI RuPay Credit Card").first().click();
  await expect(page.getByText("Unbilled (this cycle)")).toBeVisible();
  await page.getByRole("button", { name: "Pay bill" }).click();
  await page.getByRole("tab", { name: "All dues" }).click();
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Bill payment of ₹2,400 recorded")).toBeVisible();
  await reload(page, "/activity?type=expense");
  // Budget impact counts the swipe once, not the bill payment.
  await expect(page.getByText(/budget impact\s*₹2,400/)).toBeVisible();
});

test("F5: IPO blocks funds and releases them when not allotted", async ({ page }) => {
  await onboard(page);
  await reload(page, "/invest");
  await page.getByRole("button", { name: "+ IPO" }).click();
  await page.getByPlaceholder("Acme Technologies").fill("Sunrise Renewables");
  await page.getByPlaceholder("150", { exact: true }).first().fill("300");
  await page.getByPlaceholder("100", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Apply & block funds" }).click();
  await expect(page.getByText("₹15,000").first()).toBeVisible();
  await reload(page, "/");
  await expect(page.getByText(/IPO holds ₹15,000/)).toBeVisible();
  await reload(page, "/invest");
  await page.getByText("Sunrise Renewables").click();
  await page.getByRole("button", { name: "Record allotment" }).click();
  await page.getByRole("tab", { name: "Not allotted" }).click();
  await page.getByRole("button", { name: "Save allotment" }).click();
  await reload(page, "/");
  await expect(page.getByText(/IPO holds ₹15,000/)).toHaveCount(0);
});

test("F6: dinner paid by Rahul + movie paid by me → you owe Rahul ₹300", async ({ page }) => {
  await onboard(page);
  await quickAdd(page, "3600 dinner paid by rahul split rahul amit");
  await expect(page.getByText(/your share ₹1,200/)).toBeVisible();
  await page.getByRole("button", { name: /^Save ₹3,600/ }).click();
  await quickAdd(page, "2700 movie upi split rahul amit");
  await page.getByRole("button", { name: /^Save ₹2,700/ }).click();
  await reload(page, "/friends");
  const rahul = page.getByRole("link", { name: /Rahul/ });
  await expect(rahul).toContainText("you owe");
  await expect(rahul).toContainText("₹300");
  await expect(page.getByRole("link", { name: /Amit/ })).toContainText("₹900");
});

test("F4/F7: demo data renders every main screen", async ({ page }) => {
  await reload(page, "/onboarding");
  await page.getByRole("button", { name: /Load demo data/ }).click();
  await expect(page.getByText("Today you can spend")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/home-demo.png", fullPage: true });
  for (const path of ["/activity", "/cards", "/plan", "/plan/recurring", "/plan/goals", "/invest", "/invest/portfolio", "/friends", "/reports", "/settings", "/tax", "/more"]) {
    await reload(page, path);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({ path: `e2e/screenshots/${path.slice(1).replace(/\//g, "-")}.png`, fullPage: true });
  }
});

test("Habit: close the day and see the streak", async ({ page }) => {
  await onboard(page);
  await quickAdd(page, "60 chai upi");
  await page.getByRole("button", { name: /^Save ₹60/ }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: /Calm/ }).click();
  await page.getByRole("button", { name: "Close the day" }).click();
  await expect(page.getByText("1-day streak", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Today is closed")).toBeVisible();
  await reload(page, "/review");
  await expect(page.getByText("current streak · best 1")).toBeVisible();
});
