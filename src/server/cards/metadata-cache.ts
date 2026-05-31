import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, count, eq, like, or } from "drizzle-orm";

import {
  appMeta,
  cardMetadataCards,
  cardMetadataPrintings,
} from "@/server/db/schema";
import type * as schema from "@/server/db/schema";

const YGOPRODECK_CARDINFO_URL =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const REFRESH_META_KEY = "card_metadata_last_refreshed_at";
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const SEARCH_LIMIT = 20;

type Db = BetterSQLite3Database<typeof schema>;

type YgoProDeckCardSet = {
  set_name?: string;
  set_code?: string;
  set_rarity?: string;
  set_rarity_code?: string;
  set_price?: string;
};

type YgoProDeckCardImage = {
  image_url?: string;
  image_url_small?: string;
};

type YgoProDeckCard = {
  id: number;
  name: string;
  type: string;
  frameType?: string;
  desc?: string;
  race?: string;
  attribute?: string;
  card_sets?: YgoProDeckCardSet[];
  card_images?: YgoProDeckCardImage[];
};

type YgoProDeckResponse = {
  data: YgoProDeckCard[];
};

export type CardMetadataStatus = {
  cardCount: number;
  printingCount: number;
  lastRefreshedAt: string | null;
  refreshRecommended: boolean;
};

export type CardMetadataSearchResult = {
  passcode: string;
  name: string;
  cardType: string;
  frameType: string | null;
  description: string | null;
  race: string | null;
  attribute: string | null;
  imageUrl: string | null;
  setCode: string | null;
  setName: string | null;
  rarity: string | null;
  rarityCode: string | null;
  metadataOnly: true;
  pricingStatus: "requires_pricing";
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function wildcardFor(value: string) {
  return `%${value.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

async function fetchYgoProDeckCards(fetcher: typeof fetch) {
  const response = await fetcher(YGOPRODECK_CARDINFO_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `YGOPRODeck metadata refresh failed with ${response.status}`,
    );
  }

  const payload = (await response.json()) as YgoProDeckResponse;

  if (!Array.isArray(payload.data)) {
    throw new Error("YGOPRODeck metadata response did not include card data");
  }

  return payload.data;
}

function refreshMetaValue(db: Db) {
  const [meta] = db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, REFRESH_META_KEY))
    .all();

  return meta?.value ?? null;
}

function refreshNeeded(lastRefreshedAt: string | null, now: Date) {
  if (!lastRefreshedAt) {
    return true;
  }

  return now.getTime() - new Date(lastRefreshedAt).getTime() >= REFRESH_INTERVAL_MS;
}

export async function getCardMetadataStatus(
  db: Db,
  now = new Date(),
): Promise<CardMetadataStatus> {
  const [cards] = db.select({ total: count() }).from(cardMetadataCards).all();
  const [printings] = db
    .select({ total: count() })
    .from(cardMetadataPrintings)
    .all();
  const lastRefreshedAt = refreshMetaValue(db);

  return {
    cardCount: cards?.total ?? 0,
    printingCount: printings?.total ?? 0,
    lastRefreshedAt,
    refreshRecommended: refreshNeeded(lastRefreshedAt, now),
  };
}

export async function refreshCardMetadataCache(
  db: Db,
  options: {
    fetcher?: typeof fetch;
    now?: Date;
  } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? new Date();
  const cards = await fetchYgoProDeckCards(fetcher);

  db.transaction((tx) => {
    tx.delete(cardMetadataPrintings).run();
    tx.delete(cardMetadataCards).run();

    for (const card of cards) {
      const passcode = String(card.id);
      const image = card.card_images?.[0];

      tx.insert(cardMetadataCards)
        .values({
          passcode,
          name: card.name,
          normalizedName: normalizeSearchValue(card.name),
          cardType: card.type,
          frameType: card.frameType ?? null,
          description: card.desc ?? null,
          race: card.race ?? null,
          attribute: card.attribute ?? null,
          imageUrl: image?.image_url_small ?? image?.image_url ?? null,
          updatedAt: now,
        })
        .run();

      for (const printing of card.card_sets ?? []) {
        if (!printing.set_code || !printing.set_name) {
          continue;
        }

        tx.insert(cardMetadataPrintings)
          .values({
            passcode,
            setName: printing.set_name,
            setCode: printing.set_code,
            rarity: printing.set_rarity ?? null,
            rarityCode: printing.set_rarity_code ?? null,
            sourceSetPrice: printing.set_price ?? null,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .run();
      }
    }

    tx.insert(appMeta)
      .values({
        key: REFRESH_META_KEY,
        value: now.toISOString(),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: {
          value: now.toISOString(),
          updatedAt: now,
        },
      })
      .run();
  });

  return getCardMetadataStatus(db, now);
}

export async function ensureCardMetadataFresh(
  db: Db,
  options: {
    fetcher?: typeof fetch;
    forceOnRestart?: boolean;
    now?: Date;
  } = {},
) {
  const now = options.now ?? new Date();
  const lastRefreshedAt = refreshMetaValue(db);

  if (options.forceOnRestart || refreshNeeded(lastRefreshedAt, now)) {
    return refreshCardMetadataCache(db, {
      fetcher: options.fetcher,
      now,
    });
  }

  return getCardMetadataStatus(db, now);
}

export async function searchCardMetadata(
  db: Db,
  query: string,
): Promise<CardMetadataSearchResult[]> {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return [];
  }

  const rows = await db
    .select({
      passcode: cardMetadataCards.passcode,
      name: cardMetadataCards.name,
      cardType: cardMetadataCards.cardType,
      frameType: cardMetadataCards.frameType,
      description: cardMetadataCards.description,
      race: cardMetadataCards.race,
      attribute: cardMetadataCards.attribute,
      imageUrl: cardMetadataCards.imageUrl,
      setCode: cardMetadataPrintings.setCode,
      setName: cardMetadataPrintings.setName,
      rarity: cardMetadataPrintings.rarity,
      rarityCode: cardMetadataPrintings.rarityCode,
    })
    .from(cardMetadataCards)
    .leftJoin(
      cardMetadataPrintings,
      eq(cardMetadataCards.passcode, cardMetadataPrintings.passcode),
    )
    .where(
      or(
        like(cardMetadataCards.normalizedName, wildcardFor(normalizedQuery)),
        eq(cardMetadataCards.passcode, normalizedQuery),
        and(
          eq(cardMetadataPrintings.setCode, normalizedQuery.toUpperCase()),
          eq(cardMetadataCards.passcode, cardMetadataPrintings.passcode),
        ),
      ),
    )
    .limit(SEARCH_LIMIT);

  return rows.map((row) => ({
    ...row,
    metadataOnly: true,
    pricingStatus: "requires_pricing",
  }));
}

export function refreshCardMetadataOnServerStart(db: Db) {
  void ensureCardMetadataFresh(db, { forceOnRestart: true }).catch((error) => {
    console.error(error);
  });
}
