"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import {
  Archive,
  ArchiveRestore,
  Check,
  FolderOpen,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Session = RouterOutputs["sessions"]["list"][number];
type Summary = RouterOutputs["sessions"]["summary"];
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

function workspaceHref(session: Pick<Session, "id">) {
  return `/sessions/${session.id}`;
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
    <main className="grid min-h-screen grid-cols-1 bg-muted/40 text-foreground md:grid-cols-[260px_minmax(0,1fr)]">
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
                className="block rounded-lg px-3 py-2.5 text-gray-300 hover:bg-gray-800 hover:text-white"
                href="/capture"
              >
                Capture Client
              </a>
            </li>
            <li>
              <a
                className="block rounded-lg bg-gray-800 px-3 py-2.5 text-white"
                href="/"
              >
                Home
              </a>
            </li>
            <li>
              <span className="block rounded-lg px-3 py-2.5 text-gray-300">
                Pricing Sessions
              </span>
            </li>
            <li>
              <span className="block rounded-lg px-3 py-2.5 text-gray-300">
                Review Queue
              </span>
            </li>
            <li>
              <span className="block rounded-lg px-3 py-2.5 text-gray-300">
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
            <p className="text-muted-foreground">
              Durable review workspaces for scanned cards and pricing decisions.
            </p>
          </div>
          <Button
            className="h-10 whitespace-nowrap"
            type="button"
            size="lg"
            disabled={savingId !== null}
            onClick={createSession}
          >
            New session
          </Button>
        </header>

        <section
          className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3"
          aria-label="Collection summary"
        >
          <Card className="gap-2 rounded-lg p-[18px]">
            <p className="text-[13px] font-bold text-muted-foreground">
              Collection estimated value
            </p>
            <p className="text-3xl font-extrabold leading-none">
              {summary?.collectionEstimatedValue ?? "£0.00"}
            </p>
            <p className="text-xs text-muted-foreground">Active sessions only</p>
          </Card>
          <Card className="gap-2 rounded-lg p-[18px]">
            <p className="text-[13px] font-bold text-muted-foreground">
              Review queue
            </p>
            <p className="text-3xl font-extrabold leading-none">
              {summary?.activeReviewCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Across active sessions</p>
          </Card>
          <Card className="gap-2 rounded-lg p-[18px]">
            <p className="text-[13px] font-bold text-muted-foreground">
              Recent sessions
            </p>
            <p className="text-3xl font-extrabold leading-none">
              {summary?.activeSessionCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary?.archivedSessionCount ?? 0} archived
            </p>
          </Card>
        </section>

        <Card
          className="mb-6 rounded-lg"
          aria-labelledby="continue-session-title"
        >
          <CardHeader>
            <div>
              <CardTitle
                className="text-[17px]"
                id="continue-session-title"
              >
                Continue last session
              </CardTitle>
              <CardDescription>
                {continueSession
                  ? `${continueSession.name} · updated ${formatDate(
                      continueSession.updatedAt,
                    )}`
                  : "No active pricing session yet."}
              </CardDescription>
            </div>
            <CardAction>
            {continueSession ? (
              <Button
                asChild
                className="h-10 !text-primary-foreground hover:!text-primary-foreground"
                size="lg"
              >
                <a href={workspaceHref(continueSession)}>Continue</a>
              </Button>
            ) : (
              <Button
                className="h-10"
                type="button"
                size="lg"
                disabled={savingId !== null}
                onClick={createSession}
              >
                Start session
              </Button>
            )}
            </CardAction>
          </CardHeader>
        </Card>

        <Card
          className="rounded-lg"
          aria-labelledby="recent-sessions-title"
        >
          <CardHeader>
            <CardTitle className="text-[17px]" id="recent-sessions-title">
              Recent pricing sessions
            </CardTitle>
            <CardAction>
            <Label className="flex items-center gap-2 text-sm font-semibold">
              <Checkbox
                checked={includeArchived}
                onCheckedChange={(checked) => setIncludeArchived(checked === true)}
              />
              Show archived
            </Label>
            </CardAction>
          </CardHeader>
          <CardContent>

          {loading ? (
            <div className="border-t py-8 text-muted-foreground">
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="border-t py-8 text-muted-foreground">
              No pricing sessions yet.
            </div>
          ) : (
            <ul className="divide-y border-t p-0">
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
                          <Input
                            className="h-10 min-w-0 flex-1 font-semibold"
                            defaultValue={session.name}
                            name="name"
                            aria-label={`Session name for ${session.name}`}
                            autoFocus
                          />
                          <Button
                            className="h-10"
                            type="submit"
                            disabled={savingId === session.id}
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-10"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <h3 className="truncate text-lg font-bold leading-tight">
                            {session.name}
                          </h3>
                          {session.archivedAt ? (
                            <Badge variant="secondary">
                              Archived
                            </Badge>
                          ) : null}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{session.reviewCount} reviews</span>
                        <span>{session.sessionEstimatedValue} estimated</span>
                        <span>{session.unpricedItemCount} unpriced</span>
                        <span>Updated {formatDate(session.updatedAt)}</span>
                        <span>Join code {session.joinCode}</span>
                        {session.activeCaptureClientId ? (
                          <span>Capture client connected</span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3 rounded-lg border bg-muted/40 p-3 md:grid-cols-[96px_minmax(0,1fr)]">
                        <div className="flex h-24 w-24 items-center justify-center rounded-lg border bg-background p-1">
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
                              className="h-9 w-9 text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            Capture join link
                          </p>
                          <a
                            className="mt-1 block break-all text-sm font-medium text-primary underline-offset-4 hover:underline"
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
                      <Button asChild className="h-10">
                        <a href={workspaceHref(session)}>
                          <FolderOpen className="h-4 w-4" aria-hidden="true" />
                          Workspace
                        </a>
                      </Button>
                      <Button asChild className="h-10" variant="secondary">
                        <a href={captureHref(session)}>
                          <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                          Resume
                        </a>
                      </Button>
                      {editingId === session.id ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          disabled={savingId === session.id}
                          onClick={() => setEditingId(session.id)}
                          aria-label={`Rename ${session.name}`}
                          title="Rename"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
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
                      </Button>
                      {deletePendingId === session.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            className="h-10"
                            disabled={savingId === session.id}
                            onClick={() => void deleteSession(session.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Confirm delete
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            onClick={() => setDeletePendingId(null)}
                            aria-label="Cancel delete"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-lg"
                          disabled={savingId === session.id}
                          onClick={() => setDeletePendingId(session.id)}
                          aria-label={`Delete ${session.name}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {manualSessionId === session.id ? (
                    <div className="mt-4 overflow-hidden rounded-lg border bg-muted/40">
                      <div className="flex items-start justify-between gap-3 border-b bg-background px-4 py-3">
                        <div>
                          <h4 className="text-base font-bold">
                            Manual entry
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Search selects metadata. The fields below stay editable.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          onClick={() => setManualSessionId(null)}
                          aria-label="Close manual entry"
                          title="Close"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>

                      <div className="grid gap-4 p-4">
                        <section
                          className="relative max-w-2xl"
                          aria-labelledby={`manual-search-title-${session.id}`}
                        >
                          <h5
                            className="mb-2 text-sm font-bold"
                            id={`manual-search-title-${session.id}`}
                          >
                            Find card
                          </h5>
                          <Label
                            className="sr-only"
                            htmlFor={`manual-search-${session.id}`}
                          >
                            Search card metadata for manual entry
                          </Label>
                          <div className="relative">
                            <Search
                              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]"
                              aria-hidden="true"
                            />
                            <Input
                              className="h-10 pl-9"
                              id={`manual-search-${session.id}`}
                              value={manualQuery}
                              onChange={(event) => {
                                setManualQuery(event.target.value);
                                setManualSuggestionsOpen(true);
                              }}
                              onFocus={() => setManualSuggestionsOpen(true)}
                              placeholder="Type card, Set Code, or Serial Number"
                              autoComplete="off"
                            />
                          </div>
                          <div
                            className={`absolute left-0 right-0 top-[72px] z-30 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg ${
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
                              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                Keep typing for suggestions.
                              </p>
                            ) : manualSearching ? (
                              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                Searching...
                              </p>
                            ) : manualResults.length > 0 ? (
                              <ul className="grid max-h-72 gap-1 overflow-auto p-0">
                                {manualResults.map((result) => (
                                  <li key={`${result.passcode}-${result.setCode ?? "card"}`}>
                                    <button
                                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-accent"
                                      type="button"
                                      onClick={() => selectManualCandidate(result)}
                                    >
                                      <span className="block truncate text-sm font-bold">
                                        {result.name}
                                      </span>
                                      <span className="mt-1 block text-sm text-muted-foreground">
                                        {result.setCode ?? "No Set Code"} ·{" "}
                                        {result.rarity ?? "Unknown rarity"}
                                      </span>
                                      <span className="mt-1 block text-xs text-muted-foreground">
                                        Serial Number {result.passcode}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : shouldSuggestMetadata(manualQuery) ? (
                              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                No metadata matches yet.
                              </p>
                            ) : (
                              <p className="px-2 py-1.5 text-sm text-muted-foreground">
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
                            className="rounded-lg border bg-background p-4"
                            aria-label="Manual card fields"
                          >
                            <div className="grid gap-3 md:grid-cols-6">
                              <Label className="grid gap-1 text-sm font-semibold md:col-span-4">
                                Card name
                                <Input
                                  className="h-10 font-normal"
                                  required
                                  value={manualForm.cardName}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      cardName: event.target.value,
                                    }))
                                  }
                                />
                              </Label>
                              <Label className="grid gap-1 text-sm font-semibold md:col-span-2">
                                Quantity
                                <Input
                                  className="h-10 font-normal"
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
                              </Label>
                              <Label className="grid gap-1 text-sm font-semibold md:col-span-2">
                                Set Code
                                <Input
                                  className="h-10 font-normal"
                                  required
                                  value={manualForm.setCode}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      setCode: event.target.value,
                                    }))
                                  }
                                />
                              </Label>
                              <Label className="grid gap-1 text-sm font-semibold md:col-span-2">
                                Serial Number
                                <Input
                                  className="h-10 font-normal"
                                  required
                                  value={manualForm.passcode}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      passcode: event.target.value,
                                    }))
                                  }
                                />
                              </Label>
                              <div className="relative grid gap-1 text-sm font-semibold md:col-span-2">
                                <Label htmlFor={`manual-rarity-${session.id}`}>
                                  Rarity
                                </Label>
                                <Input
                                  className="h-10 font-normal"
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
                                  <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
                                    {manualRarityOptions.map((option) => (
                                      <button
                                        className="block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
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
                              <Label className="grid gap-1 text-sm font-semibold md:col-span-2">
                                Edition
                                <Select
                                  value={manualForm.edition}
                                  onValueChange={(value) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      edition: value as ManualEntryForm["edition"],
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-10 w-full font-normal">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                  {CARD_EDITIONS.map((edition) => (
                                    <SelectItem key={edition} value={edition}>
                                      {edition}
                                    </SelectItem>
                                  ))}
                                  </SelectContent>
                                </Select>
                              </Label>
                              <Label className="grid gap-1 text-sm font-semibold md:col-span-2">
                                Language
                                <Input
                                  className="h-10 font-normal"
                                  required
                                  value={manualForm.language}
                                  onChange={(event) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      language: event.target.value,
                                    }))
                                  }
                                />
                              </Label>
                              <Label className="grid gap-1 text-sm font-semibold md:col-span-2">
                                Condition
                                <Select
                                  value={manualForm.condition}
                                  onValueChange={(value) =>
                                    setManualForm((current) => ({
                                      ...current,
                                      condition: value as ManualEntryForm["condition"],
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-10 w-full font-normal">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                  {CARD_CONDITIONS.map((condition) => (
                                    <SelectItem key={condition} value={condition}>
                                      {condition}
                                    </SelectItem>
                                  ))}
                                  </SelectContent>
                                </Select>
                              </Label>
                            </div>
                          </section>
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <Button
                              className="h-10 w-fit"
                              type="submit"
                              disabled={manualSaving}
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                              Add card
                            </Button>
                            <p className="text-sm text-muted-foreground">
                              Added here without Best Frame evidence.
                            </p>
                          </div>
                        </form>
                      </div>
                    </div>
                  ) : null}

                  {sessionItems[session.id] !== undefined ? (
                        <div className="mt-4 grid gap-5 rounded-lg border bg-background px-4 py-4">
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
                                className="rounded-lg border bg-background p-3"
                                key={item.id}
                              >
                                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {item.reviewReason === "Rarity Review" ? (
                                        <Label className="flex items-center gap-2 text-sm font-semibold">
                                          <Checkbox
                                            checked={(selectedReviewItemIds[session.id] ?? []).includes(
                                              item.id,
                                            )}
                                            onCheckedChange={() =>
                                              toggleReviewSelection(session.id, item.id)
                                            }
                                          />
                                          Select
                                        </Label>
                                      ) : null}
                                      <span className="font-bold">
                                        {item.quantity}x {item.cardName}
                                      </span>
                                      {item.reviewReason ? (
                                        <Badge variant="secondary">
                                          {item.reviewReason}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline">
                                          Successfully Scanned
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {item.setCode} · {item.rarity} · {item.edition} ·{" "}
                                      {item.condition} · {item.language}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                    {formatSnapshotAmount(item) ? (
                                      <Badge variant="outline">
                                        {formatSnapshotAmount(item)}
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary">
                                        {item.pricingIssue ?? "No price found"}
                                      </Badge>
                                    )}
                                    {item.reviewReason === "Rarity Review" ? (
                                      <Button
                                        className="h-8"
                                        type="button"
                                        size="sm"
                                        disabled={itemSavingId === item.id}
                                        onClick={() =>
                                          void confirmItemRarity(session.id, item.id)
                                        }
                                      >
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        Confirm rarity
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
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
                                    </Button>
                                  </div>
                                </div>
                                <form
                                  className="grid gap-3 md:grid-cols-12"
                                  onSubmit={(event) =>
                                    void updateSessionItem(event, session.id, item)
                                  }
                                >
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-4">
                                    Card name
                                    <Input className="h-9 font-normal" name="cardName" defaultValue={item.cardName} required />
                                  </Label>
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-2">
                                    Quantity
                                    <Input className="h-9 font-normal" name="quantity" defaultValue={item.quantity} min={1} max={999} type="number" required />
                                  </Label>
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-2">
                                    Set Code
                                    <Input className="h-9 font-normal" name="setCode" defaultValue={item.setCode} required />
                                  </Label>
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-2">
                                    Serial Number
                                    <Input className="h-9 font-normal" name="passcode" defaultValue={item.passcode} required />
                                  </Label>
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-2">
                                    Rarity
                                    <Input className="h-9 font-normal" name="rarity" defaultValue={item.rarity} required />
                                  </Label>
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-2">
                                    Edition
                                    <Select name="edition" defaultValue={item.edition}>
                                      <SelectTrigger className="h-9 w-full font-normal">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                      {CARD_EDITIONS.map((edition) => (
                                        <SelectItem key={edition} value={edition}>
                                          {edition}
                                        </SelectItem>
                                      ))}
                                      </SelectContent>
                                    </Select>
                                  </Label>
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-2">
                                    Language
                                    <Input className="h-9 font-normal" name="language" defaultValue={item.language} required />
                                  </Label>
                                  <Label className="grid gap-1 text-xs font-bold md:col-span-2">
                                    Condition
                                    <Select name="condition" defaultValue={item.condition}>
                                      <SelectTrigger className="h-9 w-full font-normal">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                      {CARD_CONDITIONS.map((condition) => (
                                        <SelectItem key={condition} value={condition}>
                                          {condition}
                                        </SelectItem>
                                      ))}
                                      </SelectContent>
                                    </Select>
                                  </Label>
                                  <div className="flex flex-wrap items-end gap-3 md:col-span-4">
                                    <Label className="flex min-h-9 items-center gap-2 text-xs font-bold">
                                      <Checkbox name="printingIdentityTrusted" defaultChecked={item.printingIdentityTrusted} />
                                      Trusted identity
                                    </Label>
                                    <Label className="flex min-h-9 items-center gap-2 text-xs font-bold">
                                      <Checkbox name="rarityConfirmed" defaultChecked={Boolean(item.rarityConfirmedAt)} />
                                      Rarity confirmed
                                    </Label>
                                    <Button
                                      className="h-9"
                                      type="submit"
                                      disabled={itemSavingId === item.id}
                                    >
                                      Save correction
                                    </Button>
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
                                        className="text-sm font-bold"
                                        id={`review-items-${session.id}`}
                                      >
                                        Requires Review
                                      </h5>
                                      <p className="text-sm text-muted-foreground">
                                        Confirm rarity or correct trusted identity fields.
                                      </p>
                                    </div>
                                    <Button
                                      className="h-9 w-fit"
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
                                    </Button>
                                  </div>
                                  {reviewItems.length > 0 ? (
                                    <ul className="grid gap-3 p-0">
                                      {reviewItems.map(renderItemForm)}
                                    </ul>
                                  ) : (
                                    <p className="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
                                      No items require review.
                                    </p>
                                  )}
                                </section>
                                <section aria-labelledby={`success-items-${session.id}`}>
                                  <h5
                                    className="mb-3 text-sm font-bold"
                                    id={`success-items-${session.id}`}
                                  >
                                    Successfully Scanned
                                  </h5>
                                  {successItems.length > 0 ? (
                                    <ul className="grid gap-3 p-0">
                                      {successItems.map(renderItemForm)}
                                    </ul>
                                  ) : (
                                    <p className="rounded-lg border px-3 py-4 text-sm text-muted-foreground">
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
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export default SessionDashboard;
