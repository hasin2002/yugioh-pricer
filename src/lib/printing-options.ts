export const CARD_CONDITIONS = [
  "Mint",
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
] as const;

export const CARD_EDITIONS = [
  "1st Edition",
  "Limited Edition",
  "Unlimited",
] as const;

export const DEFAULT_CARD_LANGUAGE = "English";

export const CARD_RARITIES = [
  "Common",
  "Normal Rare",
  "Short Print",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Secret Rare",
  "Ultimate Rare",
  "Ghost Rare",
  "Holographic Rare",
  "Starlight Rare",
  "Collector's Rare",
  "Quarter Century Secret Rare",
  "Prismatic Secret Rare",
  "Platinum Secret Rare",
  "Extra Secret Rare",
  "Ultra Secret Rare",
  "20th Secret Rare",
  "10,000 Secret Rare",
  "Secret Ultra Rare",
  "Parallel Rare",
  "Normal Parallel Rare",
  "Super Parallel Rare",
  "Ultra Parallel Rare",
  "Secret Parallel Rare",
  "Extra Secret Parallel Rare",
  "Holographic Parallel Rare",
  "Starfoil Rare",
  "Mosaic Rare",
  "Shatterfoil Rare",
  "Gold Rare",
  "Gold Secret Rare",
  "Premium Gold Rare",
  "Ghost/Gold Rare",
  "Platinum Rare",
  "Ultra Rare (Pharaoh's Rare)",
  "Secret Rare (Pharaoh's Rare)",
  "Millennium Rare",
  "Millennium Super Rare",
  "Millennium Ultra Rare",
  "Millennium Secret Rare",
  "Millennium Gold Rare",
  "Duel Terminal Normal Parallel Rare",
  "Duel Terminal Normal Rare Parallel Rare",
  "Duel Terminal Rare Parallel Rare",
  "Duel Terminal Super Parallel Rare",
  "Duel Terminal Ultra Parallel Rare",
  "Duel Terminal Secret Parallel Rare",
  "Kaiba Corporation Common",
  "Kaiba Corporation Rare",
  "Kaiba Corporation Ultra Rare",
  "Astral Rare",
  "Prismatic Collector's Rare",
  "Prismatic Ultimate Rare",
  "Colored Ultra Rare",
] as const;

export const CARD_RARITY_ALIASES = [
  { alias: "QCSR", rarity: "Quarter Century Secret Rare" },
  { alias: "Blue Ultra Rare", rarity: "Colored Ultra Rare" },
  { alias: "Green Ultra Rare", rarity: "Colored Ultra Rare" },
  { alias: "Purple Ultra Rare", rarity: "Colored Ultra Rare" },
  { alias: "Silver Ultra Rare", rarity: "Colored Ultra Rare" },
  { alias: "Red Duelist League Rare", rarity: "Colored Ultra Rare" },
  { alias: "Blue Duelist League Rare", rarity: "Colored Ultra Rare" },
  { alias: "Green Duelist League Rare", rarity: "Colored Ultra Rare" },
  { alias: "Purple Duelist League Rare", rarity: "Colored Ultra Rare" },
  { alias: "Bronze Duelist League Rare", rarity: "Colored Ultra Rare" },
] as const;

export type RarityOption = {
  label: string;
  value: string;
  alias?: string;
};

export function searchRarities(query: string, limit = 8): RarityOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matches = CARD_RARITIES.map((rarity) => ({
    label: rarity,
    value: rarity,
  })).filter((option) =>
    normalizedQuery ? option.label.toLowerCase().includes(normalizedQuery) : true,
  );
  const aliasMatches = CARD_RARITY_ALIASES.filter(
    (entry) =>
      normalizedQuery &&
      (entry.alias.toLowerCase().includes(normalizedQuery) ||
        entry.rarity.toLowerCase().includes(normalizedQuery)),
  ).map((entry) => ({
    label: `${entry.rarity} (${entry.alias})`,
    value: entry.rarity,
    alias: entry.alias,
  }));

  const deduped = new Map<string, RarityOption>();

  for (const option of [...matches, ...aliasMatches]) {
    if (!deduped.has(option.value)) {
      deduped.set(option.value, option);
    }
  }

  return Array.from(deduped.values()).slice(0, limit);
}
