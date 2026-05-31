import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { priceSnapshots } from "@/server/db/schema";
import type * as schema from "@/server/db/schema";

const YGOPRODECK_CARDINFO_URL =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php";

type Db = BetterSQLite3Database<typeof schema>;

type PriceStatus = "priced" | "pricing_unavailable" | "no_price_found";

type PriceSnapshotInput = {
  sessionItemId: number;
  status: PriceStatus;
  observedAmount: string | null;
  source: string;
  currency: string | null;
  observedAt: Date;
};

type YgoProDeckCardSet = {
  set_code?: string;
  set_price?: string;
};

type YgoProDeckCardPrice = {
  tcgplayer_price?: string;
  ebay_price?: string;
  amazon_price?: string;
  cardmarket_price?: string;
};

type YgoProDeckCard = {
  id: number;
  card_sets?: YgoProDeckCardSet[];
  card_prices?: YgoProDeckCardPrice[];
};

type YgoProDeckResponse = {
  data?: YgoProDeckCard[];
};

export type PriceLookupItem = {
  id: number;
  passcode: string;
  setCode: string;
};

function normalizeAmount(value: string | undefined) {
  if (!value) {
    return null;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return amount.toFixed(2);
}

function pricedSnapshot(
  item: PriceLookupItem,
  amount: string,
  source: string,
  currency: string,
  observedAt: Date,
): PriceSnapshotInput {
  return {
    sessionItemId: item.id,
    status: "priced",
    observedAmount: amount,
    source,
    currency,
    observedAt,
  };
}

async function fetchYgoProDeckCard(
  item: PriceLookupItem,
  fetcher: typeof fetch,
) {
  const url = new URL(YGOPRODECK_CARDINFO_URL);
  url.searchParams.set("id", item.passcode);

  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`YGOPRODeck pricing lookup failed with ${response.status}`);
  }

  const payload = (await response.json()) as YgoProDeckResponse;

  if (!Array.isArray(payload.data)) {
    throw new Error("YGOPRODeck pricing response did not include card data");
  }

  return payload.data[0] ?? null;
}

export async function fetchYgoProDeckPriceSnapshot(
  item: PriceLookupItem,
  options: {
    fetcher?: typeof fetch;
    now?: Date;
  } = {},
): Promise<PriceSnapshotInput> {
  const fetcher = options.fetcher ?? fetch;
  const observedAt = options.now ?? new Date();

  try {
    const card = await fetchYgoProDeckCard(item, fetcher);

    if (!card) {
      return {
        sessionItemId: item.id,
        status: "no_price_found",
        observedAmount: null,
        source: "ygoprodeck",
        currency: null,
        observedAt,
      };
    }

    const matchingSet = card.card_sets?.find(
      (set) => set.set_code?.toUpperCase() === item.setCode.toUpperCase(),
    );
    const setAmount = normalizeAmount(matchingSet?.set_price);

    if (setAmount) {
      return pricedSnapshot(
        item,
        setAmount,
        "ygoprodeck.card_sets.set_price",
        "USD",
        observedAt,
      );
    }

    const cardPrice = card.card_prices?.[0];
    const fallbacks = [
      ["tcgplayer_price", "ygoprodeck.card_prices.tcgplayer_price", "USD"],
      ["ebay_price", "ygoprodeck.card_prices.ebay_price", "USD"],
      ["amazon_price", "ygoprodeck.card_prices.amazon_price", "USD"],
      ["cardmarket_price", "ygoprodeck.card_prices.cardmarket_price", "EUR"],
    ] as const;

    for (const [field, source, currency] of fallbacks) {
      const amount = normalizeAmount(cardPrice?.[field]);

      if (amount) {
        return pricedSnapshot(item, amount, source, currency, observedAt);
      }
    }

    return {
      sessionItemId: item.id,
      status: "no_price_found",
      observedAmount: null,
      source: "ygoprodeck",
      currency: null,
      observedAt,
    };
  } catch {
    return {
      sessionItemId: item.id,
      status: "pricing_unavailable",
      observedAmount: null,
      source: "ygoprodeck",
      currency: null,
      observedAt,
    };
  }
}

export async function storePriceSnapshot(
  db: Db,
  snapshot: PriceSnapshotInput,
) {
  const [stored] = await db.insert(priceSnapshots).values(snapshot).returning();

  return stored;
}

export async function fetchAndStorePriceSnapshot(
  db: Db,
  item: PriceLookupItem,
  options: {
    fetcher?: typeof fetch;
    now?: Date;
  } = {},
) {
  const snapshot = await fetchYgoProDeckPriceSnapshot(item, options);

  return storePriceSnapshot(db, snapshot);
}
