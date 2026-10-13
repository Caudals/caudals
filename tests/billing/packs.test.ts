/** Packs, bonuses and new-account limits (spec §6.5, §6.6, §6.15). */
import { describe, expect, it } from "vitest";
import { PACKS, findPack, packCredits, purchaseBlock } from "../../lib/billing/packs";
import { creditsToUcr } from "../../lib/billing/units";

const credits = (n: number) => creditsToUcr(n);

describe("packs (§6.6)", () => {
  it("match the table: €20 → 2,000 · €50 → 5,150 · €100 → 10,500 · €250 → 27,000 · €500 → 55,000", () => {
    expect(PACKS.map(pack => [pack.netCents / 100, packCredits(pack, false).totalUcr])).toEqual([
      [20, credits(2000)], [50, credits(5150)], [100, credits(10500)], [250, credits(27000)], [500, credits(55000)],
    ]);
  });
  it("the first top-up bonus (+20 %) and the pack bonus never stack: the larger applies", () => {
    expect(packCredits(findPack("eur_20")!, true)).toMatchObject({ baseUcr: credits(2000), bonusUcr: credits(400), bonusKind: "first_top_up", totalUcr: credits(2400) });
    expect(packCredits(findPack("eur_50")!, true)).toMatchObject({ packBonusUcr: credits(150), firstBonusUcr: credits(1000), bonusUcr: credits(1000), totalUcr: credits(6000) });
    expect(packCredits(findPack("eur_500")!, true)).toMatchObject({ packBonusUcr: credits(5000), bonusUcr: credits(10000), bonusKind: "first_top_up" });
    expect(packCredits(findPack("eur_250")!, false)).toMatchObject({ bonusUcr: credits(2000), bonusKind: "pack" });
    expect(packCredits(findPack("eur_20")!, false)).toMatchObject({ bonusUcr: BigInt(0), bonusKind: null });
  });
  it("finds packs by id or net cents only", () => {
    expect(findPack("eur_100")?.netCents).toBe(10000);
    expect(findPack(25000)?.id).toBe("eur_250");
    expect(findPack(3000)).toBeNull();
  });
});

describe("new-account limits (§6.15)", () => {
  const fresh = { isNew: true, windowNetCents: 0, recentCount: 0, lifted: false };
  it("up to €100 in flight or kept during the first 30 days", () => {
    expect(purchaseBlock(fresh, 10000)).toBeNull();
    expect(purchaseBlock(fresh, 25000)).toBe("PURCHASE_LIMIT");
    expect(purchaseBlock({ ...fresh, windowNetCents: 8000 }, 5000)).toBe("PURCHASE_LIMIT");
    expect(purchaseBlock({ ...fresh, windowNetCents: 8000 }, 2000)).toBeNull();
  });
  it("at most 3 top-ups started a day", () => {
    expect(purchaseBlock({ ...fresh, recentCount: 3, windowNetCents: 6000 }, 2000)).toBe("PURCHASE_RATE_LIMIT");
  });
  it("established accounts and lifted limits are not limited", () => {
    expect(purchaseBlock({ ...fresh, isNew: false, recentCount: 9, windowNetCents: 90000 }, 50000)).toBeNull();
    expect(purchaseBlock({ ...fresh, lifted: true, recentCount: 9 }, 50000)).toBeNull();
  });
});
