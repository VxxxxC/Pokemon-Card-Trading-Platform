import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type {
  UiAssertion,
  UiRequiredElement,
  UiStateSetup,
  UiStateVariant,
} from "@/lib/dev/ui-feature-map";

export async function assertUiSurface(
  page: Page,
  assertions: UiAssertion[],
): Promise<void> {
  for (const assertion of assertions) {
    switch (assertion.type) {
      case "heading": {
        const heading = page.getByRole("heading", {
          name: assertion.name,
          level: assertion.level,
        });
        await expect(heading.first()).toBeVisible({ timeout: 20_000 });
        break;
      }
      case "text": {
        if (!assertion.pattern) {
          throw new Error("text assertion requires pattern");
        }
        await expect(page.getByText(new RegExp(assertion.pattern)).first()).toBeVisible({
          timeout: 20_000,
        });
        break;
      }
      case "locator": {
        if (!assertion.name) {
          throw new Error("locator assertion requires name");
        }
        await expect(page.locator(assertion.name).first()).toBeVisible({
          timeout: 20_000,
        });
        break;
      }
      default:
        throw new Error(`Unknown assertion type`);
    }
  }
}

function resolveName(
  id: string,
  name?: string,
  pattern?: string,
): string | RegExp {
  if (pattern) {
    return new RegExp(pattern);
  }
  if (!name) {
    throw new Error(`${id} requires name or pattern`);
  }
  return name;
}

function resolveElementName(element: UiRequiredElement): string | RegExp {
  return resolveName(element.id, element.name, element.pattern);
}

function locateRequiredElement(page: Page, element: UiRequiredElement) {
  if (element.locator) {
    return page.locator(element.locator).first();
  }

  const name = resolveElementName(element);
  switch (element.role) {
    case "text":
      return page.getByText(name).first();
    case "heading":
      return page.getByRole("heading", { name }).first();
    case "tab":
      return page.getByRole("tab", { name }).first();
    case "columnheader":
      return page.getByRole("columnheader", { name }).first();
    case "searchbox":
      return page.getByRole("searchbox", { name }).first();
    case "switch":
      return page.getByRole("switch", { name }).first();
    default:
      return page.getByRole(element.role, { name }).first();
  }
}

export async function assertRequiredElements(
  page: Page,
  elements: UiRequiredElement[],
): Promise<void> {
  for (const element of elements) {
    const target = locateRequiredElement(page, element);
    if (element.optional) {
      if ((await target.count()) === 0) continue;
    }
    await expect(target).toBeVisible({ timeout: 20_000 });
  }
}

async function applyStateSetup(page: Page, steps: UiStateSetup[]): Promise<void> {
  for (const step of steps) {
    if (step.action !== "click") {
      throw new Error(`Unsupported setup action: ${step.action}`);
    }

    if (step.locator) {
      await page.locator(step.locator).first().click();
      continue;
    }

    const name = resolveName(
      "setup-step",
      step.name,
      step.pattern,
    );
    const role = step.role ?? "button";
    await page.getByRole(role, { name }).first().click();
  }
}

export async function assertStateVariants(
  page: Page,
  variants: UiStateVariant[],
): Promise<void> {
  for (const variant of variants) {
    await applyStateSetup(page, variant.setup);
    await assertRequiredElements(page, variant.requiredElements);
  }
}

export function projectMatchesSurfaceRole(
  projectName: string,
  role: "guest" | "buyer" | "seller" | "admin",
): boolean {
  if (role === "guest") return projectName === "guest";
  if (role === "buyer") return projectName === "buyer";
  if (role === "seller") return projectName === "seller";
  if (role === "admin") return projectName === "buyer";
  return false;
}
