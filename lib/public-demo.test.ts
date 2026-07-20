import { afterEach, describe, expect, it } from "vitest";
import { isPublicDemoShop, publicDemoShopId } from "./public-demo";

const ORIGINAL = process.env.PUBLIC_DEMO_SHOP_ID;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PUBLIC_DEMO_SHOP_ID;
  else process.env.PUBLIC_DEMO_SHOP_ID = ORIGINAL;
});

describe("isPublicDemoShop", () => {
  it("is false for every shop when unset — the guard must not fire by accident", () => {
    delete process.env.PUBLIC_DEMO_SHOP_ID;
    expect(publicDemoShopId()).toBeNull();
    expect(isPublicDemoShop("shop_a")).toBe(false);
  });

  it("is false for every shop when set to empty or whitespace", () => {
    process.env.PUBLIC_DEMO_SHOP_ID = "   ";
    expect(publicDemoShopId()).toBeNull();
    expect(isPublicDemoShop("")).toBe(false);
  });

  it("matches only the configured shop", () => {
    process.env.PUBLIC_DEMO_SHOP_ID = "shop_demo";
    expect(isPublicDemoShop("shop_demo")).toBe(true);
    expect(isPublicDemoShop("shop_other")).toBe(false);
  });

  it("tolerates surrounding whitespace in the env value", () => {
    process.env.PUBLIC_DEMO_SHOP_ID = "  shop_demo  ";
    expect(isPublicDemoShop("shop_demo")).toBe(true);
  });

  it("does not treat an empty shop id as a match", () => {
    process.env.PUBLIC_DEMO_SHOP_ID = "shop_demo";
    expect(isPublicDemoShop("")).toBe(false);
  });
});
