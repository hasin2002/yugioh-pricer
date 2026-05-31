"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CARD_CONDITIONS,
  CARD_EDITIONS,
  DEFAULT_CARD_LANGUAGE,
  searchRarities,
} from "@/lib/printing-options";
import { shouldSuggestMetadata } from "@/lib/search-suggestions";
import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Session = NonNullable<RouterOutputs["sessions"]["get"]>;
type SessionItem = RouterOutputs["sessions"]["items"][number];
type CardMetadataResult = RouterOutputs["cards"]["searchMetadata"][number];

type EditorForm = {
  cardName: string;
  setCode: string;
  serialNumber: string;
  rarity: string;
  edition: (typeof CARD_EDITIONS)[number];
  language: string;
  condition: (typeof CARD_CONDITIONS)[number];
  quantity: number;
  printingIdentityTrusted: boolean;
  rarityConfirmed: boolean;
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const SEARCH_DEBOUNCE_MS = 250;

function emptyEditorForm(): EditorForm {
  return {
    cardName: "",
    setCode: "",
    serialNumber: "",
    rarity: "",
    edition: "1st Edition",
    language: DEFAULT_CARD_LANGUAGE,
    condition: "Mint",
    quantity: 1,
    printingIdentityTrusted: true,
    rarityConfirmed: false,
  };
}

function formForItem(item: SessionItem): EditorForm {
  return {
    cardName: item.cardName,
    setCode: item.setCode,
    serialNumber: item.serialNumber,
    rarity: item.rarity,
    edition: item.edition as EditorForm["edition"],
    language: item.language,
    condition: item.condition as EditorForm["condition"],
    quantity: item.quantity,
    printingIdentityTrusted: item.printingIdentityTrusted,
    rarityConfirmed: Boolean(item.rarityConfirmedAt),
  };
}

function captureHref(session: Pick<Session, "joinCode" | "joinUrl">) {
  return session.joinUrl ?? `/capture?join=${encodeURIComponent(session.joinCode)}`;
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

function itemLabel(item: SessionItem) {
  return item.cardName.trim() || `Session Item ${item.id}`;
}

export function SessionWorkspace({ sessionId }: { sessionId: number }) {
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | "new">("new");
  const [form, setForm] = useState<EditorForm>(emptyEditorForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pricingRefreshingId, setPricingRefreshingId] = useState<number | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardMetadataResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [raritySuggestionsOpen, setRaritySuggestionsOpen] = useState(false);
  const searchRequestRef = useRef(0);

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

  const selectedItem = useMemo(
    () =>
      selectedItemId === "new"
        ? null
        : items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const reviewItems = items.filter(
    (item) => item.reviewStatus === "requires_review",
  );
  const successItems = items.filter((item) => item.reviewStatus === "success");
  const orderedIds = items.map((item) => item.id);
  const rarityOptions = form.rarity.trim() ? searchRarities(form.rarity) : [];

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    const [nextSession, nextItems] = await Promise.all([
      trpc.sessions.get.query({ id: sessionId }),
      trpc.sessions.items.query({ id: sessionId }),
    ]);

    setSession(nextSession);
    setItems(nextItems);
    setSelectedItemId((current) => {
      if (current === "new" || nextItems.some((item) => item.id === current)) {
        return current;
      }

      return nextItems[0]?.id ?? "new";
    });
    setLoading(false);
  }, [sessionId, trpc]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    setForm(selectedItem ? formForItem(selectedItem) : emptyEditorForm());
    setQuery(selectedItem?.cardName ?? "");
    setSuggestionsOpen(false);
    setRaritySuggestionsOpen(false);
  }, [selectedItem]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    if (!shouldSuggestMetadata(trimmedQuery)) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeoutId = window.setTimeout(() => {
      void trpc.cards.searchMetadata
        .query({ query: trimmedQuery })
        .then((nextResults) => {
          if (searchRequestRef.current === requestId) {
            setResults(nextResults);
          }
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query, trpc]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectAdjacentItem(-1);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectAdjacentItem(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function updateForm<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      rarityConfirmed: key === "rarity" ? false : current.rarityConfirmed,
    }));
  }

  function selectAdjacentItem(direction: -1 | 1) {
    if (orderedIds.length === 0) {
      setSelectedItemId("new");
      return;
    }

    if (selectedItemId === "new") {
      setSelectedItemId(direction > 0 ? orderedIds[0]! : orderedIds.at(-1)!);
      return;
    }

    const currentIndex = orderedIds.indexOf(selectedItemId);
    const nextIndex = Math.min(
      Math.max(currentIndex + direction, 0),
      orderedIds.length - 1,
    );

    setSelectedItemId(orderedIds[nextIndex]!);
  }

  function selectCandidate(result: CardMetadataResult) {
    setForm((current) => ({
      ...current,
      cardName: result.name,
      setCode: result.setCode ?? current.setCode,
      serialNumber: result.passcode,
      rarity: result.rarity ?? current.rarity,
      rarityConfirmed: false,
    }));
    setQuery(result.name);
    setSuggestionsOpen(false);
  }

  async function saveEditor() {
    setSaving(true);
    try {
      if (selectedItem) {
        await trpc.sessions.updateItem.mutate({
          id: selectedItem.id,
          ...form,
          quantity: Number(form.quantity),
        });
      } else {
        const created = await trpc.sessions.addManualItem.mutate({
          id: sessionId,
          ...form,
          quantity: Number(form.quantity),
        });

        if (created) {
          setSelectedItemId(created.id);
        }
      }

      await loadWorkspace();
    } finally {
      setSaving(false);
    }
  }

  async function confirmSelectedRarity() {
    setSaving(true);
    try {
      const itemToConfirm =
        selectedItem ??
        (await trpc.sessions.addManualItem.mutate({
          id: sessionId,
          ...form,
          quantity: Number(form.quantity),
        }));

      if (itemToConfirm) {
        await trpc.sessions.confirmItemRarity.mutate({ id: itemToConfirm.id });
        setSelectedItemId(itemToConfirm.id);
      }

      await loadWorkspace();
    } finally {
      setSaving(false);
    }
  }

  async function refreshItemPricing(item: SessionItem) {
    setPricingRefreshingId(item.id);
    try {
      await trpc.sessions.refreshItemPricing.mutate({ id: item.id });
      await loadWorkspace();
    } finally {
      setPricingRefreshingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-muted/40 p-6 text-muted-foreground">
        Loading session workspace...
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-muted/40 p-6">
        <Button asChild variant="ghost">
          <a href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </a>
        </Button>
        <p className="mt-6 text-lg font-semibold">Session not found.</p>
      </main>
    );
  }

  const pricedAmount = selectedItem ? formatSnapshotAmount(selectedItem) : null;

  return (
    <main className="min-h-screen bg-muted/40 text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r bg-background p-4 lg:p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm">
              <a href="/">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Home
              </a>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setSelectedItemId("new")}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New
            </Button>
          </div>

          <section aria-labelledby="navigator-title">
            <h2 className="text-sm font-bold" id="navigator-title">
              Session Item Navigator
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {reviewItems.length} requires review, {successItems.length} scanned
            </p>

            <div className="mt-4 grid gap-5">
              <NavigatorSection
                currentId={selectedItemId}
                items={reviewItems}
                title="Requires Review"
                onSelect={setSelectedItemId}
              />
              <NavigatorSection
                currentId={selectedItemId}
                items={successItems}
                title="Successfully Scanned"
                onSelect={setSelectedItemId}
              />
            </div>
          </section>
        </aside>

        <section className="min-w-0 p-4 md:p-6 lg:p-8">
          <header className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold leading-tight md:text-3xl">
                  {session.name}
                </h1>
                {session.archivedAt ? (
                  <Badge variant="secondary">Archived</Badge>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{session.sessionEstimatedValue} estimated</span>
                <span>{session.reviewCount} reviews</span>
                <span>{session.unpricedItemCount} unpriced</span>
                <span>Updated {formatter.format(new Date(session.updatedAt))}</span>
              </div>
            </div>

            <Card className="rounded-lg">
              <CardContent className="grid grid-cols-[82px_minmax(0,1fr)] gap-3 p-3">
                <div className="flex h-20 w-20 items-center justify-center rounded-md border bg-background p-1">
                  {session.joinQrSvg ? (
                    <div
                      className="h-full w-full"
                      aria-label={`QR code for ${session.name}`}
                      dangerouslySetInnerHTML={{ __html: session.joinQrSvg }}
                    />
                  ) : (
                    <QrCode
                      className="h-8 w-8 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold">Capture join</p>
                  <a
                    className="mt-1 block break-all text-sm font-medium text-primary underline-offset-4 hover:underline"
                    href={captureHref(session)}
                  >
                    {session.joinUrl ?? captureHref(session)}
                  </a>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Code {session.joinCode}
                  </p>
                </div>
              </CardContent>
            </Card>
          </header>

          <div className="grid gap-6 xl:grid-cols-[minmax(340px,460px)_minmax(0,1fr)] xl:items-start">
            <section aria-label="Card-shaped Session Item Editor">
              <div className="mx-auto aspect-[59/86] w-full max-w-[430px] rounded-[18px] border border-slate-500 bg-gradient-to-br from-stone-200 via-slate-100 to-stone-300 p-[4.5%] shadow-xl">
                <div className="grid h-full grid-rows-[9%_4%_42%_5%_24%_6%] gap-[1.2%] rounded-[10px] border border-slate-400 bg-stone-100 p-[3%] shadow-inner">
                  <div className="flex items-center justify-between gap-2 border-b-2 border-slate-400 px-2">
                    <Input
                      className="h-9 min-w-0 border-0 bg-transparent px-0 text-xl font-bold uppercase shadow-none focus-visible:ring-0"
                      aria-label="Card name"
                      value={form.cardName}
                      onChange={(event) =>
                        updateForm("cardName", event.target.value)
                      }
                      placeholder="Card Name"
                    />
                    <Badge className="shrink-0" variant="outline">
                      {form.condition}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-end px-2">
                    <Badge variant="secondary">{form.rarity || "Rarity"}</Badge>
                  </div>

                  <div className="flex items-center justify-center overflow-hidden border-[6px] border-slate-500 bg-slate-200 text-center">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Picture</p>
                      <p className="mt-1 px-5 text-xs text-slate-500">
                        Reference art appears here when cached.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_130px] items-center gap-2 border-y border-slate-300 px-2">
                    <Select
                      value={form.edition}
                      onValueChange={(value) =>
                        updateForm("edition", value as EditorForm["edition"])
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-full border-0 bg-transparent px-0 text-xs font-bold shadow-none"
                        aria-label="Edition"
                      >
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
                    <Input
                      className="h-8 border-sky-500 bg-sky-50 px-2 text-right text-xs font-bold shadow-none"
                      aria-label="Set Code"
                      value={form.setCode}
                      onChange={(event) =>
                        updateForm("setCode", event.target.value)
                      }
                      placeholder="SET-000"
                    />
                  </div>

                  <div className="grid gap-2 border-2 border-amber-700 bg-white/80 p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Label className="grid gap-1 text-xs font-bold">
                        Rarity
                        <Input
                          className="h-8 bg-background font-normal"
                          value={form.rarity}
                          onFocus={() => setRaritySuggestionsOpen(true)}
                          onChange={(event) => {
                            updateForm("rarity", event.target.value);
                            setRaritySuggestionsOpen(true);
                          }}
                          required
                        />
                      </Label>
                      <Label className="grid gap-1 text-xs font-bold">
                        Quantity
                        <Input
                          className="h-8 bg-background font-normal"
                          min={1}
                          max={999}
                          type="number"
                          value={form.quantity}
                          onChange={(event) =>
                            updateForm("quantity", Number(event.target.value))
                          }
                          required
                        />
                      </Label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Label className="grid gap-1 text-xs font-bold">
                        Language
                        <Input
                          className="h-8 bg-background font-normal"
                          value={form.language}
                          onChange={(event) =>
                            updateForm("language", event.target.value)
                          }
                          required
                        />
                      </Label>
                      <Label className="grid gap-1 text-xs font-bold">
                        Condition
                        <Select
                          value={form.condition}
                          onValueChange={(value) =>
                            updateForm(
                              "condition",
                              value as EditorForm["condition"],
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-full bg-background font-normal">
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
                  </div>

                  <div className="grid grid-cols-[120px_1fr] items-end gap-2">
                    <Input
                      className="h-8 border-emerald-500 bg-emerald-50 px-2 text-xs font-bold shadow-none"
                      aria-label="Serial Number"
                      value={form.serialNumber}
                      onChange={(event) =>
                        updateForm("serialNumber", event.target.value)
                      }
                      placeholder="00000000"
                    />
                    <div className="text-right text-xs font-bold text-slate-600">
                      Session Item Editor
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4" aria-label="Session Item actions">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {selectedItem ? itemLabel(selectedItem) : "New Session Item"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="relative">
                    <Label className="mb-1 block text-sm font-semibold">
                      Find card
                    </Label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        className="h-10 pl-9"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setSuggestionsOpen(true);
                        }}
                        onFocus={() => setSuggestionsOpen(true)}
                        placeholder="Type card, Set Code, or Serial Number"
                      />
                    </div>
                    {suggestionsOpen ? (
                      <div className="absolute left-0 right-0 top-[70px] z-30 rounded-lg border bg-popover p-2 shadow-lg">
                        {!shouldSuggestMetadata(query) ? (
                          <p className="px-2 py-1.5 text-sm text-muted-foreground">
                            Keep typing for suggestions.
                          </p>
                        ) : searching ? (
                          <p className="px-2 py-1.5 text-sm text-muted-foreground">
                            Searching...
                          </p>
                        ) : results.length > 0 ? (
                          <ul className="grid max-h-72 gap-1 overflow-auto p-0">
                            {results.map((result) => (
                              <li
                                key={`${result.passcode}-${result.setCode ?? "card"}`}
                              >
                                <button
                                  className="block w-full rounded-md px-3 py-2 text-left hover:bg-accent"
                                  type="button"
                                  onClick={() => selectCandidate(result)}
                                >
                                  <span className="block truncate text-sm font-bold">
                                    {result.name}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {result.setCode ?? "No Set Code"} ·{" "}
                                    {result.rarity ?? "Unknown rarity"} · Serial
                                    Number {result.passcode}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="px-2 py-1.5 text-sm text-muted-foreground">
                            No metadata matches yet.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {raritySuggestionsOpen && rarityOptions.length > 0 ? (
                    <div className="rounded-lg border bg-background p-2">
                      <p className="mb-1 text-xs font-bold text-muted-foreground">
                        Rarity suggestions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {rarityOptions.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              updateForm("rarity", option.value);
                              setRaritySuggestionsOpen(false);
                            }}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm md:grid-cols-3">
                    <div>
                      <p className="font-bold">Review state</p>
                      <p className="text-muted-foreground">
                        {selectedItem?.reviewReason ?? "Successfully Scanned"}
                      </p>
                    </div>
                    <div>
                      <p className="font-bold">Price</p>
                      <p className="text-muted-foreground">
                        {pricedAmount ?? selectedItem?.pricingIssue ?? "Not priced yet"}
                      </p>
                    </div>
                    <div>
                      <p className="font-bold">Source</p>
                      <p className="text-muted-foreground">
                        {selectedItem?.entrySource ?? "manual"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={saveEditor} disabled={saving}>
                      {selectedItem ? (
                        <Save className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      )}
                      {selectedItem ? "Save correction" : "Create Session Item"}
                    </Button>
                    <Button
                      type="button"
                      variant={form.rarityConfirmed ? "secondary" : "default"}
                      onClick={confirmSelectedRarity}
                      disabled={saving || (!selectedItem && !form.rarity)}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      {form.rarityConfirmed
                        ? "Rarity confirmed"
                        : "Confirm rarity"}
                    </Button>
                    {selectedItem ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pricingRefreshingId === selectedItem.id}
                        onClick={() => void refreshItemPricing(selectedItem)}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${
                            pricingRefreshingId === selectedItem.id
                              ? "animate-spin"
                              : ""
                          }`}
                          aria-hidden="true"
                        />
                        Refresh pricing
                      </Button>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => selectAdjacentItem(-1)}
                      disabled={orderedIds.length === 0}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => selectAdjacentItem(1)}
                      disabled={orderedIds.length === 0}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function NavigatorSection({
  currentId,
  items,
  title,
  onSelect,
}: {
  currentId: number | "new";
  items: SessionItem[];
  title: string;
  onSelect: (id: number) => void;
}) {
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-xs font-bold uppercase text-muted-foreground">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No items.
        </p>
      ) : (
        <ul className="grid gap-2 p-0">
          {items.map((item) => (
            <li key={item.id}>
              <button
                className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                  currentId === item.id
                    ? "border-primary bg-primary/10"
                    : "bg-background hover:bg-muted"
                }`}
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <span className="block truncate font-bold">
                  {item.quantity}x {itemLabel(item)}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {item.setCode || "No Set Code"} ·{" "}
                  {item.reviewReason ?? "Scanned"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
