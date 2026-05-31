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
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AppRouter } from "@/server/api/root";
import {
  CARD_CONDITIONS,
  CARD_EDITIONS,
  DEFAULT_CARD_LANGUAGE,
  searchRarities,
} from "@/lib/printing-options";

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

function formatDate(date: string) {
  return formatter.format(new Date(date));
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
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState<ManualEntryForm>(
    emptyManualEntryForm,
  );
  const [sessionItems, setSessionItems] = useState<Record<number, SessionItem[]>>(
    {},
  );

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

  const refreshMetadataStatus = useCallback(async () => {
    setMetadataStatus(await trpc.cards.metadataStatus.query());
  }, [trpc]);

  useEffect(() => {
    void refreshMetadataStatus();
  }, [refreshMetadataStatus]);

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
  }

  async function openManualEntry(sessionId: number) {
    if (manualSessionId === sessionId) {
      setManualSessionId(null);
      return;
    }

    setManualSessionId(sessionId);
    setManualQuery("");
    setManualResults([]);
    setManualForm(emptyManualEntryForm());
    await loadSessionItems(sessionId);
  }

  async function searchManualMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = manualQuery.trim();

    if (!query) {
      setManualResults([]);
      return;
    }

    setManualSearching(true);
    try {
      const results = await trpc.cards.searchMetadata.query({ query });
      setManualResults(results);
      await refreshMetadataStatus();
    } finally {
      setManualSearching(false);
    }
  }

  function selectManualCandidate(result: CardMetadataResult) {
    setManualForm((current) => ({
      ...current,
      cardName: result.name,
      setCode: result.setCode ?? current.setCode,
      passcode: result.passcode,
      rarity: result.rarity ?? current.rarity,
    }));
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
                      {manualSessionId === session.id ? (
                        <div className="mt-3 rounded-md border border-[#d9dee7] bg-white p-4">
                          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <h4 className="text-sm font-bold text-[#101828]">
                                Manual entry
                              </h4>
                              <p className="text-sm text-[#667085]">
                                Metadata-backed card details
                              </p>
                            </div>
                            <button
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-[#475467] hover:bg-[#f2f4f7]"
                              type="button"
                              onClick={() => setManualSessionId(null)}
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                              Close
                            </button>
                          </div>

                          <form
                            className="mb-3 flex flex-col gap-2 md:flex-row"
                            onSubmit={(event) => void searchManualMetadata(event)}
                          >
                            <label
                              className="sr-only"
                              htmlFor={`manual-search-${session.id}`}
                            >
                              Search card metadata for manual entry
                            </label>
                            <input
                              className="min-h-10 min-w-0 flex-1 rounded-md border border-[#b8c2d2] px-3 text-base outline-none focus:border-[#667085]"
                              id={`manual-search-${session.id}`}
                              value={manualQuery}
                              onChange={(event) => setManualQuery(event.target.value)}
                              placeholder="Search card name, Set Code, or Passcode"
                            />
                            <button
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-gray-900 px-4 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                              type="submit"
                              disabled={manualSearching}
                            >
                              <Search className="h-4 w-4" aria-hidden="true" />
                              Search
                            </button>
                          </form>

                          {manualSearching ? (
                            <p className="mb-3 text-sm text-[#667085]">
                              Searching metadata...
                            </p>
                          ) : manualResults.length > 0 ? (
                            <ul className="mb-3 max-h-52 divide-y divide-[#eaecf0] overflow-auto rounded-md border border-[#d9dee7] p-0">
                              {manualResults.map((result) => (
                                <li
                                  className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
                                  key={`${result.passcode}-${result.setCode ?? "card"}`}
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold">
                                      {result.name}
                                    </p>
                                    <p className="text-sm text-[#667085]">
                                      {result.setCode ?? "No Set Code"} ·{" "}
                                      {result.rarity ?? "Unknown rarity"} · Passcode{" "}
                                      {result.passcode}
                                    </p>
                                  </div>
                                  <button
                                    className="inline-flex min-h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
                                    type="button"
                                    onClick={() => selectManualCandidate(result)}
                                  >
                                    Select
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          <form
                            className="grid gap-3"
                            onSubmit={(event) => void addManualItem(event, session.id)}
                          >
                            <div className="grid gap-3 md:grid-cols-3">
                              <label className="grid gap-1 text-sm font-semibold text-[#344054] md:col-span-2">
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
                              <label className="grid gap-1 text-sm font-semibold text-[#344054]">
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
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <label className="grid gap-1 text-sm font-semibold text-[#344054]">
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
                              <label className="grid gap-1 text-sm font-semibold text-[#344054]">
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
                              <label className="relative grid gap-1 text-sm font-semibold text-[#344054]">
                                Rarity
                                <input
                                  className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-base font-normal text-[#101828] outline-none focus:border-[#667085]"
                                  required
                                  value={manualForm.rarity}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      rarity: event.target.value,
                                    }))
                                  }
                                />
                                {manualForm.rarity.trim().length > 0 &&
                                searchRarities(manualForm.rarity).length > 0 ? (
                                  <div className="rounded-md border border-[#d9dee7] bg-[#f8fafc] p-1">
                                    {searchRarities(manualForm.rarity).map(
                                      (option) => (
                                        <button
                                          className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium text-[#344054] hover:bg-white"
                                          key={option.value}
                                          type="button"
                                          onClick={() =>
                                            setManualForm((current) => ({
                                              ...current,
                                              rarity: option.value,
                                            }))
                                          }
                                        >
                                          {option.label}
                                        </button>
                                      ),
                                    )}
                                  </div>
                                ) : null}
                              </label>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <label className="grid gap-1 text-sm font-semibold text-[#344054]">
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
                              <label className="grid gap-1 text-sm font-semibold text-[#344054]">
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
                              <label className="grid gap-1 text-sm font-semibold text-[#344054]">
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
                            <button
                              className="inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-md bg-teal-700 px-4 font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                              type="submit"
                              disabled={manualSaving}
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              Add card
                            </button>
                          </form>

                          {(sessionItems[session.id] ?? []).length > 0 ? (
                            <ul className="mt-4 divide-y divide-[#eaecf0] border-t border-[#eaecf0] p-0">
                              {(sessionItems[session.id] ?? []).map((item) => (
                                <li className="py-2 text-sm" key={item.id}>
                                  <span className="font-semibold">
                                    {item.quantity}x {item.cardName}
                                  </span>{" "}
                                  <span className="text-[#667085]">
                                    {item.setCode} · {item.rarity} · {item.edition} ·{" "}
                                    {item.condition} · {item.language}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
