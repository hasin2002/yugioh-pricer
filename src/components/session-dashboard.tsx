"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import {
  Archive,
  ArchiveRestore,
  Check,
  Database,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AppRouter } from "@/server/api/root";
import {
  CARD_CONDITIONS,
  CARD_EDITIONS,
  DEFAULT_CARD_LANGUAGE,
  searchRarities,
} from "@/lib/printing-options";
import { shouldSuggestMetadata } from "@/lib/search-suggestions";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Session = RouterOutputs["sessions"]["list"][number];
type Summary = RouterOutputs["sessions"]["summary"];
type CardMetadataStatus = RouterOutputs["cards"]["metadataStatus"];
type CardMetadataResult = RouterOutputs["cards"]["searchMetadata"][number];
type SessionItem = RouterOutputs["sessions"]["items"][number];

type ManualEntryForm = {
  cardName: string;
  setCode: string;
  passcode: string;
  rarity: string;
  edition: (typeof CARD_EDITIONS)[number];
  language: string;
  condition: (typeof CARD_CONDITIONS)[number];
  quantity: number;
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const MANUAL_SEARCH_DEBOUNCE_MS = 250;

function formatDate(date: string) {
  return formatter.format(new Date(date));
}

function formatSnapshotAmount(item: SessionItem) {
  const snapshot = item.latestPriceSnapshot;

  if (
    !snapshot ||
    snapshot.status !== "priced" ||
    !snapshot.observedAmount ||
    !snapshot.currency
  ) {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: snapshot.currency,
  }).format(Number(snapshot.observedAmount));
}

function captureHref(session: Pick<Session, "joinCode" | "joinUrl">) {
  return session.joinUrl ?? `/capture?join=${encodeURIComponent(session.joinCode)}`;
}

function emptyManualEntryForm(): ManualEntryForm {
  return {
    cardName: "",
    setCode: "",
    passcode: "",
    rarity: "",
    edition: "1st Edition",
    language: DEFAULT_CARD_LANGUAGE,
    condition: "Mint",
    quantity: 1,
  };
}

export function SessionDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [metadataStatus, setMetadataStatus] =
    useState<CardMetadataStatus | null>(null);
  const [metadataRefreshing, setMetadataRefreshing] = useState(false);
  const [metadataQuery, setMetadataQuery] = useState("");
  const [metadataResults, setMetadataResults] = useState<CardMetadataResult[]>(
    [],
  );
  const [metadataSearching, setMetadataSearching] = useState(false);
  const [manualSessionId, setManualSessionId] = useState<number | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<CardMetadataResult[]>([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [manualSuggestionsOpen, setManualSuggestionsOpen] = useState(false);
  const [raritySuggestionsOpen, setRaritySuggestionsOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [pricingRefreshingId, setPricingRefreshingId] = useState<number | null>(
    null,
  );
  const [manualForm, setManualForm] = useState<ManualEntryForm>(
    emptyManualEntryForm,
  );
  const [sessionItems, setSessionItems] = useState<Record<number, SessionItem[]>>(
    {},
  );
  const [selectedReviewItemIds, setSelectedReviewItemIds] = useState<
    Record<number, number[]>
  >({});
  const [itemSavingId, setItemSavingId] = useState<number | null>(null);
  const [bulkConfirmingSessionId, setBulkConfirmingSessionId] = useState<
    number | null
  >(null);
  const manualSearchRequestRef = useRef(0);

  const trpc = useMemo(
    () =>
      createTRPCClient<AppRouter>({
        links: [
          httpBatchLink({
            url: "/api/trpc",
          }),
        ],
      }),
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    const [nextSessions, nextSummary] = await Promise.all([
      trpc.sessions.list.query({ includeArchived }),
      trpc.sessions.summary.query(),
    ]);
    setSessions(nextSessions);
    setSummary(nextSummary);
    setLoading(false);
  }, [includeArchived, trpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unloadedSessions = sessions.filter(
      (session) => sessionItems[session.id] === undefined,
    );

    if (unloadedSessions.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      unloadedSessions.map(async (session) => ({
        id: session.id,
        items: await trpc.sessions.items.query({ id: session.id }),
      })),
    ).then((loadedSessions) => {
      if (cancelled) {
        return;
      }

      setSessionItems((current) => {
        const next = { ...current };

        for (const loadedSession of loadedSessions) {
          next[loadedSession.id] = loadedSession.items;
        }

        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sessions, sessionItems, trpc]);

  const refreshMetadataStatus = useCallback(async () => {
    setMetadataStatus(await trpc.cards.metadataStatus.query());
  }, [trpc]);

  useEffect(() => {
    void refreshMetadataStatus();
  }, [refreshMetadataStatus]);

  useEffect(() => {
    const query = manualQuery.trim();
    const requestId = manualSearchRequestRef.current + 1;
    manualSearchRequestRef.current = requestId;

    if (!manualSessionId || !shouldSuggestMetadata(query)) {
      setManualResults([]);
      setManualSearching(false);
      return;
    }

    setManualSearching(true);
    const timeoutId = window.setTimeout(() => {
      void trpc.cards.searchMetadata
        .query({ query })
        .then((results) => {
          if (manualSearchRequestRef.current === requestId) {
            setManualResults(results);
          }
        })
        .finally(() => {
          if (manualSearchRequestRef.current === requestId) {
            setManualSearching(false);
          }
        });
    }, MANUAL_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [manualQuery, manualSessionId, trpc]);

  async function refreshMetadata() {
    setMetadataRefreshing(true);
    try {
      const status = await trpc.cards.refreshMetadata.mutate();
      setMetadataStatus(status);
    } finally {
      setMetadataRefreshing(false);
    }
  }

  async function searchMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = metadataQuery.trim();

    if (!query) {
      setMetadataResults([]);
      return;
    }

    setMetadataSearching(true);
    try {
      const results = await trpc.cards.searchMetadata.query({ query });
      setMetadataResults(results);
      await refreshMetadataStatus();
    } finally {
      setMetadataSearching(false);
    }
  }

  async function loadSessionItems(sessionId: number) {
    const items = await trpc.sessions.items.query({ id: sessionId });
    setSessionItems((current) => ({ ...current, [sessionId]: items }));
    setSelectedReviewItemIds((current) => ({
      ...current,
      [sessionId]: (current[sessionId] ?? []).filter((id) =>
        items.some((item) => item.id === id && item.reviewReason === "Rarity Review"),
      ),
    }));
  }

  async function refreshItemPricing(sessionId: number, itemId: number) {
    setPricingRefreshingId(itemId);
    try {
      await trpc.sessions.refreshItemPricing.mutate({ id: itemId });
      await Promise.all([loadSessionItems(sessionId), refresh()]);
    } finally {
      setPricingRefreshingId(null);
    }
  }

  async function confirmItemRarity(sessionId: number, itemId: number) {
    setItemSavingId(itemId);
    try {
      await trpc.sessions.confirmItemRarity.mutate({ id: itemId });
      await Promise.all([loadSessionItems(sessionId), refresh()]);
    } finally {
      setItemSavingId(null);
    }
  }

  async function updateSessionItem(
    event: FormEvent<HTMLFormElement>,
    sessionId: number,
    item: SessionItem,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = (name: string) => String(formData.get(name) ?? "").trim();

    setItemSavingId(item.id);
    try {
      await trpc.sessions.updateItem.mutate({
        id: item.id,
        cardName: value("cardName"),
        setCode: value("setCode"),
        passcode: value("passcode"),
        rarity: value("rarity"),
        edition: value("edition") as ManualEntryForm["edition"],
        language: value("language"),
        condition: value("condition") as ManualEntryForm["condition"],
        quantity: Number(value("quantity")),
        rarityConfirmed: formData.get("rarityConfirmed") === "on",
        printingIdentityTrusted: formData.get("printingIdentityTrusted") === "on",
      });
      await Promise.all([loadSessionItems(sessionId), refresh()]);
    } finally {
      setItemSavingId(null);
    }
  }

  function toggleReviewSelection(sessionId: number, itemId: number) {
    setSelectedReviewItemIds((current) => {
      const selected = current[sessionId] ?? [];
      const next = selected.includes(itemId)
        ? selected.filter((id) => id !== itemId)
        : [...selected, itemId];

      return { ...current, [sessionId]: next };
    });
  }

  function selectedSimilarRarityItems(sessionId: number) {
    const selected = selectedReviewItemIds[sessionId] ?? [];
    const items = sessionItems[sessionId] ?? [];
    const selectedItems = selected
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is SessionItem => Boolean(item));
    const [firstItem] = selectedItems;

    if (!firstItem) {
      return { items: selectedItems, allowed: false };
    }

    const allowed = selectedItems.every(
      (item) =>
        item.reviewReason === "Rarity Review" &&
        item.cardName === firstItem.cardName &&
        item.setCode === firstItem.setCode &&
        item.passcode === firstItem.passcode &&
        item.rarity === firstItem.rarity &&
        item.edition === firstItem.edition &&
        item.language === firstItem.language,
    );

    return { items: selectedItems, allowed };
  }

  async function bulkConfirmSelectedRarities(sessionId: number) {
    const selection = selectedSimilarRarityItems(sessionId);

    if (!selection.allowed || selection.items.length === 0) {
      return;
    }

    setBulkConfirmingSessionId(sessionId);
    try {
      await trpc.sessions.bulkConfirmRarity.mutate({
        ids: selection.items.map((item) => item.id),
      });
      setSelectedReviewItemIds((current) => ({ ...current, [sessionId]: [] }));
      await Promise.all([loadSessionItems(sessionId), refresh()]);
    } finally {
      setBulkConfirmingSessionId(null);
    }
  }

  async function openManualEntry(sessionId: number) {
    if (manualSessionId === sessionId) {
      setManualSessionId(null);
      return;
    }

    setManualSessionId(sessionId);
    setManualQuery("");
    setManualResults([]);
    setManualSuggestionsOpen(false);
    setRaritySuggestionsOpen(false);
    setManualForm(emptyManualEntryForm());
    await loadSessionItems(sessionId);
  }

  function selectManualCandidate(result: CardMetadataResult) {
    setManualForm((current) => ({
      ...current,
      cardName: result.name,
      setCode: result.setCode ?? current.setCode,
      passcode: result.passcode,
      rarity: result.rarity ?? current.rarity,
    }));
    setManualQuery(result.name);
    setManualSuggestionsOpen(false);
  }

  async function addManualItem(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    setManualSaving(true);
    try {
      await trpc.sessions.addManualItem.mutate({
        id,
        ...manualForm,
        quantity: Number(manualForm.quantity),
      });
      setManualForm(emptyManualEntryForm());
      setManualQuery("");
      setManualResults([]);
      setManualSuggestionsOpen(false);
      setRaritySuggestionsOpen(false);
      await Promise.all([loadSessionItems(id), refresh()]);
    } finally {
      setManualSaving(false);
    }
  }

  async function createSession() {
    setSavingId(0);
    await trpc.sessions.create.mutate();
    await refresh();
    setSavingId(null);
  }

  async function renameSession(id: number, name: string) {
    const current = sessions.find((session) => session.id === id);
    const nextName = name.trim();

    if (!current || nextName.length === 0 || nextName === current.name) {
      return;
    }

    setSavingId(id);
    await trpc.sessions.rename.mutate({ id, name: nextName });
    await refresh();
    setSavingId(null);
  }

  async function submitRename(
    event: FormEvent<HTMLFormElement>,
    id: number,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");

    if (typeof name === "string") {
      await renameSession(id, name);
      setEditingId(null);
    }
  }

  async function setArchived(id: number, archived: boolean) {
    setSavingId(id);
    if (archived) {
      await trpc.sessions.archive.mutate({ id });
    } else {
      await trpc.sessions.unarchive.mutate({ id });
    }
    await refresh();
    setSavingId(null);
  }

  async function deleteSession(id: number) {
    setSavingId(id);
    await trpc.sessions.delete.mutate({ id });
    await refresh();
    setSavingId(null);
    setDeletePendingId(null);
  }

  const continueSession = summary?.continueSession;
  const manualRarityOptions = manualForm.rarity.trim()
    ? searchRarities(manualForm.rarity)
    : [];

  return (
    <main className="grid min-h-screen grid-cols-1 bg-[#f6f7f9] text-[#151923] md:grid-cols-[260px_minmax(0,1fr)]">
      <aside
        className="border-r border-[#d9dee7] bg-gray-900 p-5 text-gray-50 md:p-6"
        aria-label="Review navigation"
      >
        <div className="mb-8">
          <p className="mb-1.5 text-xs font-bold uppercase text-gray-400">
            Review Client
          </p>
          <p className="text-[21px] font-extrabold leading-tight">
            Yu-Gi-Oh Pricer
          </p>
        </div>
        <nav>
          <ul className="grid list-none gap-2 p-0">
            <li>
              <a
                className="block rounded-md px-3 py-2.5 text-gray-300 hover:bg-gray-800 hover:text-white"
                href="/capture"
              >
                Capture Client
              </a>
            </li>
            <li>
              <a
                className="block rounded-md bg-gray-800 px-3 py-2.5 text-white"
                href="/"
              >
                Home
              </a>
            </li>
            <li>
              <span className="block rounded-md px-3 py-2.5 text-gray-300">
                Pricing Sessions
              </span>
            </li>
            <li>
              <span className="block rounded-md px-3 py-2.5 text-gray-300">
                Review Queue
              </span>
            </li>
            <li>
              <span className="block rounded-md px-3 py-2.5 text-gray-300">
                Collection
              </span>
            </li>
          </ul>
        </nav>
      </aside>

      <section className="min-w-0 p-5 md:p-8" aria-labelledby="home-title">
        <header className="mb-7 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1
              className="mb-1.5 text-[28px] font-bold leading-tight"
              id="home-title"
            >
              Pricing sessions
            </h1>
            <p className="text-[#667085]">
              Durable review workspaces for scanned cards and pricing decisions.
            </p>
          </div>
          <button
            className="min-h-[42px] whitespace-nowrap rounded-md bg-teal-700 px-4 font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-900/60"
            type="button"
            disabled={savingId !== null}
            onClick={createSession}
          >
            New session
          </button>
        </header>

        <section
          className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3"
          aria-label="Collection summary"
        >
          <article className="rounded-lg border border-[#d9dee7] bg-white p-[18px]">
            <p className="mb-2.5 text-[13px] font-bold text-[#667085]">
              Collection estimated value
            </p>
            <p className="text-3xl font-extrabold leading-none">
              {summary?.collectionEstimatedValue ?? "£0.00"}
            </p>
            <p className="mt-2 text-xs text-[#667085]">Active sessions only</p>
          </article>
          <article className="rounded-lg border border-[#d9dee7] bg-white p-[18px]">
            <p className="mb-2.5 text-[13px] font-bold text-[#667085]">
              Review queue
            </p>
            <p className="text-3xl font-extrabold leading-none">
              {summary?.activeReviewCount ?? 0}
            </p>
            <p className="mt-2 text-xs text-[#667085]">Across active sessions</p>
          </article>
          <article className="rounded-lg border border-[#d9dee7] bg-white p-[18px]">
            <p className="mb-2.5 text-[13px] font-bold text-[#667085]">
              Recent sessions
            </p>
            <p className="text-3xl font-extrabold leading-none">
              {summary?.activeSessionCount ?? 0}
            </p>
            <p className="mt-2 text-xs text-[#667085]">
              {summary?.archivedSessionCount ?? 0} archived
            </p>
          </article>
        </section>

        <section
          className="mb-6 rounded-lg border border-[#d9dee7] bg-white p-5"
          aria-labelledby="metadata-cache-title"
        >
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2
                className="mb-1 flex items-center gap-2 text-[17px] font-bold"
                id="metadata-cache-title"
              >
                <Database className="h-5 w-5 text-teal-700" aria-hidden="true" />
                Card metadata cache
              </h2>
              <p className="text-sm text-[#667085]">
                {metadataStatus?.lastRefreshedAt
                  ? `Updated ${formatDate(metadataStatus.lastRefreshedAt)} · ${metadataStatus.cardCount.toLocaleString()} cards · ${metadataStatus.printingCount.toLocaleString()} printings`
                  : "No local card metadata has been cached yet."}
              </p>
              {metadataStatus?.refreshRecommended ? (
                <p className="mt-1 text-sm font-semibold text-amber-700">
                  Refresh recommended
                </p>
              ) : null}
            </div>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={metadataRefreshing}
              onClick={() => void refreshMetadata()}
            >
              <RefreshCw
                className={`h-4 w-4 ${metadataRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>

          <form
            className="flex flex-col gap-2 md:flex-row"
            onSubmit={(event) => void searchMetadata(event)}
          >
            <label className="sr-only" htmlFor="metadata-search">
              Search card metadata
            </label>
            <input
              className="min-h-10 min-w-0 flex-1 rounded-md border border-[#b8c2d2] px-3 text-base outline-none focus:border-[#667085]"
              id="metadata-search"
              value={metadataQuery}
              onChange={(event) => setMetadataQuery(event.target.value)}
              placeholder="Search by name, Set Code, or Passcode"
            />
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={metadataSearching}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </button>
          </form>

          {metadataSearching ? (
            <div className="mt-4 border-t border-[#eaecf0] pt-4 text-sm text-[#667085]">
              Searching metadata...
            </div>
          ) : metadataResults.length > 0 ? (
            <ul className="mt-4 divide-y divide-[#eaecf0] border-t border-[#eaecf0] p-0">
              {metadataResults.map((result) => (
                <li
                  className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
                  key={`${result.passcode}-${result.setCode ?? "card"}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{result.name}</p>
                    <p className="text-sm text-[#667085]">
                      Passcode {result.passcode}
                      {result.setCode
                        ? ` · ${result.setCode} · ${result.rarity ?? "Unknown rarity"}`
                        : ""}
                    </p>
                    {result.setName ? (
                      <p className="mt-1 text-sm text-[#667085]">
                        {result.setName}
                      </p>
                    ) : null}
                  </div>
                  <span className="self-start rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    Pricing required
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section
          className="mb-6 rounded-lg border border-[#d9dee7] bg-white p-5"
          aria-labelledby="continue-session-title"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2
                className="mb-1 text-[17px] font-bold"
                id="continue-session-title"
              >
                Continue last session
              </h2>
              <p className="text-sm text-[#667085]">
                {continueSession
                  ? `${continueSession.name} · updated ${formatDate(
                      continueSession.updatedAt,
                    )}`
                  : "No active pricing session yet."}
              </p>
            </div>
            {continueSession ? (
              <a
                className="inline-flex min-h-[42px] items-center justify-center rounded-md bg-gray-900 px-4 font-bold !text-white hover:bg-gray-800"
                href={captureHref(continueSession)}
              >
                Continue
              </a>
            ) : (
              <button
                className="min-h-[42px] rounded-md bg-gray-900 px-4 font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-700"
                type="button"
                disabled={savingId !== null}
                onClick={createSession}
              >
                Start session
              </button>
            )}
          </div>
        </section>

        <section
          className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-[#e4e7ec]"
          aria-labelledby="recent-sessions-title"
        >
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-[17px] font-bold" id="recent-sessions-title">
              Recent pricing sessions
            </h2>
            <label className="flex items-center gap-2 text-sm font-semibold text-[#344054]">
              <input
                className="h-4 w-4 accent-teal-700"
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              Show archived
            </label>
          </div>

          {loading ? (
            <div className="border-t border-[#eaecf0] py-8 text-[#667085]">
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="border-t border-[#eaecf0] py-8 text-[#667085]">
              No pricing sessions yet.
            </div>
          ) : (
            <ul className="divide-y divide-[#eaecf0] border-t border-[#eaecf0] p-0">
              {sessions.map((session) => (
                <li className="py-4" key={session.id}>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      {editingId === session.id ? (
                        <form
                          className="mb-2 flex max-w-xl gap-2"
                          onSubmit={(event) =>
                            void submitRename(event, session.id)
                          }
                        >
                          <input
                            className="min-h-10 min-w-0 flex-1 rounded-md border border-[#b8c2d2] px-2 text-base font-semibold outline-none focus:border-[#667085]"
                            defaultValue={session.name}
                            name="name"
                            aria-label={`Session name for ${session.name}`}
                            autoFocus
                          />
                          <button
                            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                            type="submit"
                            disabled={savingId === session.id}
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Save
                          </button>
                          <button
                            className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#475467] hover:bg-[#f2f4f7]"
                            type="button"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <h3 className="truncate text-lg font-bold leading-tight">
                            {session.name}
                          </h3>
                          {session.archivedAt ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              Archived
                            </span>
                          ) : null}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#667085]">
                        <span>{session.reviewCount} reviews</span>
                        <span>{session.sessionEstimatedValue} estimated</span>
                        <span>{session.unpricedItemCount} unpriced</span>
                        <span>Updated {formatDate(session.updatedAt)}</span>
                        <span>Join code {session.joinCode}</span>
                        {session.activeCaptureClientId ? (
                          <span>Capture client connected</span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 rounded-md border border-[#d9dee7] bg-[#f8fafc] p-3 md:grid-cols-[96px_minmax(0,1fr)]">
                        <div className="flex h-24 w-24 items-center justify-center rounded-md border border-[#d9dee7] bg-white p-1">
                          {session.joinQrSvg ? (
                            <div
                              className="h-full w-full"
                              aria-label={`QR code for ${session.name}`}
                              dangerouslySetInnerHTML={{
                                __html: session.joinQrSvg,
                              }}
                            />
                          ) : (
                            <QrCode
                              className="h-9 w-9 text-[#98a2b3]"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#344054]">
                            Capture join link
                          </p>
                          <a
                            className="mt-1 block break-all text-sm font-medium text-teal-800 hover:text-teal-900"
                            href={captureHref(session)}
                          >
                            {session.joinUrl ?? captureHref(session)}
                          </a>
                          {session.phoneSafeOriginConfigured ? null : (
                            <p className="mt-2 text-sm text-amber-700">
                              Configure PHONE_SAFE_HTTPS_ORIGIN with your HTTPS tunnel
                              origin before opening this on an iPhone.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                      <button
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-gray-900 px-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        disabled={savingId === session.id}
                        onClick={() => void openManualEntry(session.id)}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Manual
                      </button>
                      <a
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 font-semibold !text-white hover:bg-teal-800"
                        href={captureHref(session)}
                      >
                        <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                        Resume
                      </a>
                      {editingId === session.id ? null : (
                        <button
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#475467] hover:bg-[#f2f4f7] hover:text-[#101828] disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={savingId === session.id}
                          onClick={() => setEditingId(session.id)}
                          aria-label={`Rename ${session.name}`}
                          title="Rename"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#475467] hover:bg-[#f2f4f7] hover:text-[#101828] disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        disabled={savingId === session.id}
                        onClick={() =>
                          void setArchived(session.id, !session.archivedAt)
                        }
                        aria-label={
                          session.archivedAt
                            ? `Unarchive ${session.name}`
                            : `Archive ${session.name}`
                        }
                        title={session.archivedAt ? "Unarchive" : "Archive"}
                      >
                        {session.archivedAt ? (
                          <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Archive className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                      {deletePendingId === session.id ? (
                        <>
                          <button
                            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-700 px-3 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            disabled={savingId === session.id}
                            onClick={() => void deleteSession(session.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Confirm delete
                          </button>
                          <button
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-[#475467] hover:bg-[#f2f4f7] hover:text-[#101828]"
                            type="button"
                            onClick={() => setDeletePendingId(null)}
                            aria-label="Cancel delete"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <button
                          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={savingId === session.id}
                          onClick={() => setDeletePendingId(session.id)}
                          aria-label={`Delete ${session.name}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  {manualSessionId === session.id ? (
                    <div className="mt-4 overflow-hidden rounded-md border border-[#cbd5e1] bg-[#f8fafc]">
                      <div className="flex items-start justify-between gap-3 border-b border-[#e2e8f0] bg-white px-4 py-3">
                        <div>
                          <h4 className="text-base font-bold text-[#101828]">
                            Manual entry
                          </h4>
                          <p className="text-sm text-[#667085]">
                            Search selects metadata. The fields below stay editable.
                          </p>
                        </div>
                        <button
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#475467] hover:bg-[#f2f4f7]"
                          type="button"
                          onClick={() => setManualSessionId(null)}
                          aria-label="Close manual entry"
                          title="Close"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="grid gap-4 p-4">
                        <section
                          className="relative max-w-2xl"
                          aria-labelledby={`manual-search-title-${session.id}`}
                        >
                          <h5
                            className="mb-2 text-sm font-bold text-[#344054]"
                            id={`manual-search-title-${session.id}`}
                          >
                            Find card
                          </h5>
                          <label
                            className="sr-only"
                            htmlFor={`manual-search-${session.id}`}
                          >
                            Search card metadata for manual entry
                          </label>
                          <div className="relative">
                            <Search
                              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]"
                              aria-hidden="true"
                            />
                            <input
                              className="min-h-10 w-full rounded-md border border-[#b8c2d2] pl-9 pr-3 text-base outline-none focus:border-[#667085]"
                              id={`manual-search-${session.id}`}
                              value={manualQuery}
                              onChange={(event) => {
                                setManualQuery(event.target.value);
                                setManualSuggestionsOpen(true);
                              }}
                              onFocus={() => setManualSuggestionsOpen(true)}
                              placeholder="Type card, Set Code, or Passcode"
                              autoComplete="off"
                            />
                          </div>
                          <div
                            className={`absolute left-0 right-0 top-[72px] z-30 rounded-md border border-[#d9dee7] bg-white p-2 shadow-lg ${
                              manualSuggestionsOpen &&
                              (manualSearching ||
                                manualResults.length > 0 ||
                                manualQuery.trim().length > 0)
                                ? ""
                                : "hidden"
                            }`}
                          >
                            {manualQuery.trim().length > 0 &&
                            !shouldSuggestMetadata(manualQuery) ? (
                              <p className="px-2 py-1.5 text-sm text-[#667085]">
                                Keep typing for suggestions.
                              </p>
                            ) : manualSearching ? (
                              <p className="px-2 py-1.5 text-sm text-[#667085]">
                                Searching...
                              </p>
                            ) : manualResults.length > 0 ? (
                              <ul className="grid max-h-72 gap-1 overflow-auto p-0">
                                {manualResults.map((result) => (
                                  <li key={`${result.passcode}-${result.setCode ?? "card"}`}>
                                    <button
                                      className="block w-full rounded-md px-3 py-2 text-left hover:bg-teal-50"
                                      type="button"
                                      onClick={() => selectManualCandidate(result)}
                                    >
                                      <span className="block truncate text-sm font-bold text-[#101828]">
                                        {result.name}
                                      </span>
                                      <span className="mt-1 block text-sm text-[#667085]">
                                        {result.setCode ?? "No Set Code"} ·{" "}
                                        {result.rarity ?? "Unknown rarity"}
                                      </span>
                                      <span className="mt-1 block text-xs text-[#667085]">
                                        Passcode {result.passcode}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : shouldSuggestMetadata(manualQuery) ? (
                              <p className="px-2 py-1.5 text-sm text-[#667085]">
                                No metadata matches yet.
                              </p>
                            ) : (
                              <p className="px-2 py-1.5 text-sm text-[#667085]">
                                Suggestions appear as you type.
                              </p>
                            )}
                          </div>
                        </section>

                        <form
                          className="grid gap-4"
                          onSubmit={(event) => void addManualItem(event, session.id)}
                        >
                          <section
                            className="rounded-md border border-[#d9dee7] bg-white p-4"
                            aria-label="Manual card fields"
                          >
                            <div className="grid gap-3 md:grid-cols-6">
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-4">
                                Card name
                                <input
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  required
                                  value={manualForm.cardName}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      cardName: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
                                Quantity
                                <input
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  min={1}
                                  max={999}
                                  required
                                  type="number"
                                  value={manualForm.quantity}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      quantity: Number(event.target.value),
                                    }))
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
                                Set Code
                                <input
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  required
                                  value={manualForm.setCode}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      setCode: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
                                Passcode
                                <input
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  required
                                  value={manualForm.passcode}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      passcode: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <div className="relative grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
                                <label htmlFor={`manual-rarity-${session.id}`}>
                                  Rarity
                                </label>
                                <input
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  id={`manual-rarity-${session.id}`}
                                  required
                                  value={manualForm.rarity}
                                  autoComplete="off"
                                  onFocus={() => setRaritySuggestionsOpen(true)}
                                  onChange={(event) =>
                                    {
                                      setManualForm((current) => ({
                                        ...current,
                                        rarity: event.target.value,
                                      }));
                                      setRaritySuggestionsOpen(true);
                                    }
                                  }
                                />
                                {raritySuggestionsOpen &&
                                manualRarityOptions.length > 0 ? (
                                  <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border border-[#d9dee7] bg-white p-1 shadow-lg">
                                    {manualRarityOptions.map((option) => (
                                      <button
                                        className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium text-[#344054] hover:bg-teal-50"
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                          setManualForm((current) => ({
                                            ...current,
                                            rarity: option.value,
                                          }));
                                          setRaritySuggestionsOpen(false);
                                        }}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
                                Edition
                                <select
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  value={manualForm.edition}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      edition: event.target
                                        .value as ManualEntryForm["edition"],
                                    }))
                                  }
                                >
                                  {CARD_EDITIONS.map((edition) => (
                                    <option key={edition}>{edition}</option>
                                  ))}
                                </select>
                              </label>
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
                                Language
                                <input
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  required
                                  value={manualForm.language}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      language: event.target.value,
                                    }))
                                  }
                                />
                              </label>
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
                                Condition
                                <select
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  value={manualForm.condition}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      condition: event.target
                                        .value as ManualEntryForm["condition"],
                                    }))
                                  }
                                >
                                  {CARD_CONDITIONS.map((condition) => (
                                    <option key={condition}>{condition}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </section>
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <button
                              className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-md bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                              type="submit"
                              disabled={manualSaving}
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              Add card
                            </button>
                            <p className="text-sm text-[#667085]">
                              Added here without Best Frame evidence.
                            </p>
                          </div>
                        </form>
                      </div>
                    </div>
                  ) : null}

                  {sessionItems[session.id] !== undefined ? (
                        <div className="mt-4 grid gap-5 rounded-md border border-[#e2e8f0] bg-white px-4 py-4">
                          {(() => {
                            const items = sessionItems[session.id] ?? [];
                            const reviewItems = items.filter(
                              (item) => item.reviewStatus === "requires_review",
                            );
                            const successItems = items.filter(
                              (item) => item.reviewStatus === "success",
                            );
                            const bulkSelection = selectedSimilarRarityItems(session.id);

                            const renderItemForm = (item: SessionItem) => (
                              <li
                                className="rounded-md border border-[#e4e7ec] bg-white p-3"
                                key={item.id}
                              >
                                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {item.reviewReason === "Rarity Review" ? (
                                        <label className="flex items-center gap-2 text-sm font-semibold text-[#344054]">
                                          <input
                                            className="h-4 w-4 accent-teal-700"
                                            type="checkbox"
                                            checked={(selectedReviewItemIds[session.id] ?? []).includes(
                                              item.id,
                                            )}
                                            onChange={() =>
                                              toggleReviewSelection(session.id, item.id)
                                            }
                                          />
                                          Select
                                        </label>
                                      ) : null}
                                      <span className="font-bold text-[#101828]">
                                        {item.quantity}x {item.cardName}
                                      </span>
                                      {item.reviewReason ? (
                                        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                                          {item.reviewReason}
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                                          Successfully Scanned
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-sm text-[#667085]">
                                      {item.setCode} · {item.rarity} · {item.edition} ·{" "}
                                      {item.condition} · {item.language}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                    {formatSnapshotAmount(item) ? (
                                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                                        {formatSnapshotAmount(item)}
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                                        {item.pricingIssue ?? "No price found"}
                                      </span>
                                    )}
                                    {item.reviewReason === "Rarity Review" ? (
                                      <button
                                        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-teal-700 px-2.5 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                                        type="button"
                                        disabled={itemSavingId === item.id}
                                        onClick={() =>
                                          void confirmItemRarity(session.id, item.id)
                                        }
                                      >
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        Confirm rarity
                                      </button>
                                    ) : null}
                                    <button
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#475467] hover:bg-[#f2f4f7] disabled:cursor-not-allowed disabled:opacity-60"
                                      type="button"
                                      disabled={pricingRefreshingId === item.id}
                                      onClick={() =>
                                        void refreshItemPricing(session.id, item.id)
                                      }
                                      aria-label={`Refresh pricing for ${item.cardName}`}
                                      title="Refresh pricing"
                                    >
                                      <RefreshCw
                                        className={`h-4 w-4 ${
                                          pricingRefreshingId === item.id
                                            ? "animate-spin"
                                            : ""
                                        }`}
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </div>
                                </div>
                                <form
                                  className="grid gap-3 md:grid-cols-12"
                                  onSubmit={(event) =>
                                    void updateSessionItem(event, session.id, item)
                                  }
                                >
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-4">
                                    Card name
                                    <input className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="cardName" defaultValue={item.cardName} required />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-2">
                                    Quantity
                                    <input className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="quantity" defaultValue={item.quantity} min={1} max={999} type="number" required />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-2">
                                    Set Code
                                    <input className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="setCode" defaultValue={item.setCode} required />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-2">
                                    Passcode
                                    <input className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="passcode" defaultValue={item.passcode} required />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-2">
                                    Rarity
                                    <input className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="rarity" defaultValue={item.rarity} required />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-2">
                                    Edition
                                    <select className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="edition" defaultValue={item.edition}>
                                      {CARD_EDITIONS.map((edition) => (
                                        <option key={edition}>{edition}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-2">
                                    Language
                                    <input className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="language" defaultValue={item.language} required />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-[#344054] md:col-span-2">
                                    Condition
                                    <select className="min-h-9 rounded-md border border-[#b8c2d2] px-2 text-sm font-normal text-[#101828]" name="condition" defaultValue={item.condition}>
                                      {CARD_CONDITIONS.map((condition) => (
                                        <option key={condition}>{condition}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="flex flex-wrap items-end gap-3 md:col-span-4">
                                    <label className="flex min-h-9 items-center gap-2 text-xs font-bold text-[#344054]">
                                      <input className="h-4 w-4 accent-teal-700" name="printingIdentityTrusted" type="checkbox" defaultChecked={item.printingIdentityTrusted} />
                                      Trusted identity
                                    </label>
                                    <label className="flex min-h-9 items-center gap-2 text-xs font-bold text-[#344054]">
                                      <input className="h-4 w-4 accent-teal-700" name="rarityConfirmed" type="checkbox" defaultChecked={Boolean(item.rarityConfirmedAt)} />
                                      Rarity confirmed
                                    </label>
                                    <button
                                      className="inline-flex min-h-9 items-center justify-center rounded-md bg-gray-900 px-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                                      type="submit"
                                      disabled={itemSavingId === item.id}
                                    >
                                      Save correction
                                    </button>
                                  </div>
                                </form>
                              </li>
                            );

                            return (
                              <>
                                <section aria-labelledby={`review-items-${session.id}`}>
                                  <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <h5
                                        className="text-sm font-bold text-[#344054]"
                                        id={`review-items-${session.id}`}
                                      >
                                        Requires Review
                                      </h5>
                                      <p className="text-sm text-[#667085]">
                                        Confirm rarity or correct trusted identity fields.
                                      </p>
                                    </div>
                                    <button
                                      className="inline-flex min-h-9 w-fit items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                                      type="button"
                                      disabled={
                                        !bulkSelection.allowed ||
                                        bulkSelection.items.length === 0 ||
                                        bulkConfirmingSessionId === session.id
                                      }
                                      onClick={() =>
                                        void bulkConfirmSelectedRarities(session.id)
                                      }
                                    >
                                      <Check className="h-4 w-4" aria-hidden="true" />
                                      Confirm selected similar rarities
                                    </button>
                                  </div>
                                  {reviewItems.length > 0 ? (
                                    <ul className="grid gap-3 p-0">
                                      {reviewItems.map(renderItemForm)}
                                    </ul>
                                  ) : (
                                    <p className="rounded-md border border-[#e4e7ec] px-3 py-4 text-sm text-[#667085]">
                                      No items require review.
                                    </p>
                                  )}
                                </section>
                                <section aria-labelledby={`success-items-${session.id}`}>
                                  <h5
                                    className="mb-3 text-sm font-bold text-[#344054]"
                                    id={`success-items-${session.id}`}
                                  >
                                    Successfully Scanned
                                  </h5>
                                  {successItems.length > 0 ? (
                                    <ul className="grid gap-3 p-0">
                                      {successItems.map(renderItemForm)}
                                    </ul>
                                  ) : (
                                    <p className="rounded-md border border-[#e4e7ec] px-3 py-4 text-sm text-[#667085]">
                                      Confirm required review fields to move items here.
                                    </p>
                                  )}
                                </section>
                              </>
                            );
                          })()}
                        </div>
                      ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
