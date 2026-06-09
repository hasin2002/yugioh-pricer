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
  Wifi,
  WifiOff,
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
import { cardFramePalette } from "@/lib/card-frame-palette";
import { shouldSuggestMetadata } from "@/lib/search-suggestions";
import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Session = NonNullable<RouterOutputs["sessions"]["get"]>;
type SessionItem = RouterOutputs["sessions"]["items"][number];
type CardMetadataResult = RouterOutputs["cards"]["searchMetadata"][number];
type SessionEvent = {
  sessionId: number;
  type: string;
  occurredAt: string;
};

type EditorForm = {
  cardName: string;
  setCode: string;
  serialNumber: string;
  cardImageUrl: string | null;
  cardType: string | null;
  frameType: string | null;
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
    cardImageUrl: null,
    cardType: null,
    frameType: null,
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
    cardImageUrl: item.cardImageUrl,
    cardType: item.cardType,
    frameType: item.frameType,
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

function croppedCardArtUrl(serialNumber: string, imageUrl: string | null) {
  const trimmedSerialNumber = serialNumber.trim();

  if (trimmedSerialNumber) {
    return `https://images.ygoprodeck.com/images/cards_cropped/${encodeURIComponent(
      trimmedSerialNumber,
    )}.jpg`;
  }

  if (!imageUrl) {
    return null;
  }

  return imageUrl
    .replace("/images/cards_small/", "/images/cards_cropped/")
    .replace("/images/cards/", "/images/cards_cropped/");
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
  const [failedArtUrl, setFailedArtUrl] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<
    "connecting" | "connected" | "reconnecting" | "unavailable"
  >("connecting");
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
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimeout: number | null = null;

    function scheduleReconnect() {
      if (cancelled) {
        return;
      }

      setLiveStatus("reconnecting");
      reconnectTimeout = window.setTimeout(() => {
        void connect();
      }, 1500);
    }

    async function connect() {
      try {
        const response = await fetch("/api/session-events", {
          cache: "no-store",
        });
        const body = (await response.json()) as { url: string };

        if (cancelled) {
          return;
        }

        const url = new URL(body.url);
        url.searchParams.set("sessionId", String(sessionId));
        socket = new WebSocket(url);

        socket.addEventListener("open", () => {
          setLiveStatus("connected");
          void loadWorkspace();
        });

        socket.addEventListener("message", (event) => {
          const sessionEvent = JSON.parse(String(event.data)) as SessionEvent;

          if (sessionEvent.sessionId === sessionId) {
            void loadWorkspace();
          }
        });

        socket.addEventListener("close", scheduleReconnect);
        socket.addEventListener("error", () => {
          setLiveStatus("unavailable");
          socket?.close();
        });
      } catch {
        setLiveStatus("unavailable");
        scheduleReconnect();
      }
    }

    setLiveStatus("connecting");
    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
      }
      socket?.close();
    };
  }, [loadWorkspace, sessionId]);

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
      cardImageUrl: result.imageUrl,
      cardType: result.cardType,
      frameType: result.frameType,
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
  const candidateArtUrl = croppedCardArtUrl(form.serialNumber, form.cardImageUrl);
  const artUrl = candidateArtUrl === failedArtUrl ? null : candidateArtUrl;
  const palette = cardFramePalette(form.frameType, form.cardType);
  const editorTitle =
    form.cardName.trim() ||
    (selectedItem ? itemLabel(selectedItem) : "New Session Item");
  const liveStatusCopy = {
    connected: {
      title: "Live updates active",
      detail: "This workspace refreshes when the session changes.",
      className: "border-emerald-300 bg-emerald-50 text-emerald-950",
      iconClassName: "text-emerald-700",
    },
    connecting: {
      title: "Connecting live updates",
      detail: "Waiting for the session event channel.",
      className: "border-amber-300 bg-amber-50 text-amber-950",
      iconClassName: "text-amber-700",
    },
    reconnecting: {
      title: "Reconnecting live updates",
      detail: "Changes may appear after the connection returns.",
      className: "border-amber-300 bg-amber-50 text-amber-950",
      iconClassName: "text-amber-700",
    },
    unavailable: {
      title: "Live updates unavailable",
      detail: "Refresh manually while the event channel reconnects.",
      className: "border-destructive/40 bg-destructive/10 text-destructive",
      iconClassName: "text-destructive",
    },
  }[liveStatus];
  const cardTextStyle = {
    fontFamily: '"Times New Roman", Georgia, serif',
  };
  const cardNameLength = Math.max(form.cardName.trim().length, 16);
  const cardNameStyle = {
    ...cardTextStyle,
    fontSize: `${Math.max(
      11,
      Math.min(21, 350 / cardNameLength),
    )}px`,
    fontStretch: "condensed",
    color: palette.titleText,
  };

  return (
    <main className="min-h-screen bg-slate-50 text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-w-0 overflow-hidden border-r bg-white p-4 lg:p-5">
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

          <section className="min-w-0" aria-labelledby="navigator-title">
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
          <header className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_270px_340px]">
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

            <div
              className={`flex min-w-0 items-start gap-3 rounded-lg border px-3 py-2 shadow-sm ${liveStatusCopy.className}`}
            >
              {liveStatus === "connected" ? (
                <Wifi
                  className={`mt-0.5 h-5 w-5 shrink-0 ${liveStatusCopy.iconClassName}`}
                  aria-hidden="true"
                />
              ) : (
                <WifiOff
                  className={`mt-0.5 h-5 w-5 shrink-0 ${liveStatusCopy.iconClassName}`}
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">
                  {liveStatusCopy.title}
                </p>
                <p className="mt-0.5 text-xs leading-snug">
                  {liveStatusCopy.detail}
                </p>
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

          <div className="grid gap-8 xl:grid-cols-[minmax(330px,450px)_minmax(0,1fr)] xl:items-start">
            <section aria-label="Card-shaped Session Item Editor">
              <div className="mx-auto aspect-[59/86] w-full max-w-[405px] rounded-[7px] border-[5px] border-[#273342] bg-[#273342] p-[2.1%] shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
                <div
                  className="grid h-full grid-rows-[8%_56%_5%_22%_4%] gap-[1%] rounded-[2px] border p-[3.2%] shadow-inner"
                  style={{
                    background: palette.background,
                    borderColor: palette.border,
                  }}
                >
                  <div
                    className="mx-auto flex w-[88%] min-w-0 items-center overflow-hidden border-[2px] px-2 shadow-[inset_0_1px_3px_rgba(255,255,255,0.55),inset_0_-2px_4px_rgba(61,32,19,0.26)]"
                    style={{
                      background: palette.titleBackground,
                      borderColor: palette.titleBorder,
                    }}
                  >
                    <Input
                      className="h-full min-w-0 border-0 bg-transparent px-0 py-0 font-normal uppercase leading-none tracking-normal shadow-none placeholder:text-[#6f472d]/70 focus-visible:ring-0"
                      style={cardNameStyle}
                      aria-label="Card name"
                      value={form.cardName}
                      onChange={(event) =>
                        updateForm("cardName", event.target.value)
                      }
                      placeholder="Card Name"
                    />
                  </div>

                  <div className="flex min-h-0 items-start justify-center pt-[2%]">
                    <div className="aspect-square w-[88%] overflow-hidden border-[5px] border-[#56626b] bg-[#252c32] shadow-[0_3px_8px_rgba(38,20,12,0.38),inset_0_0_0_1px_rgba(255,255,255,0.2)]">
                      {artUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="h-full w-full scale-[1.045] object-cover"
                          src={artUrl}
                          alt=""
                          onError={(event) => {
                            setFailedArtUrl(event.currentTarget.src);
                          }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#efe7c8_0%,#caa86f_48%,#775038_100%)] text-center">
                          <div>
                            <p className="font-serif text-base font-semibold text-[#2c1b11]">
                              Picture
                            </p>
                            <p className="mt-1 max-w-44 text-xs text-[#4f3524]">
                              Search or enter a Serial Number to preview card art.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mx-auto grid w-[88%] grid-cols-[1fr_minmax(96px,132px)] items-center gap-2">
                    <Select
                      value={form.edition}
                      onValueChange={(value) =>
                        updateForm("edition", value as EditorForm["edition"])
                      }
                    >
                      <SelectTrigger
                        className="h-6 w-full border-0 bg-transparent px-0 py-0 text-[14px] font-normal leading-none shadow-none focus-visible:ring-0 [&>svg]:hidden"
                        style={{ ...cardTextStyle, color: palette.text }}
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
                      className="h-6 border-0 bg-transparent px-0 py-0 text-right text-[14px] font-normal leading-none shadow-none placeholder:text-[#6f472d]/70 focus-visible:ring-0"
                      style={{ ...cardTextStyle, color: palette.text }}
                      aria-label="Set Code"
                      value={form.setCode}
                      onChange={(event) =>
                        updateForm("setCode", event.target.value)
                      }
                      placeholder="SET-000"
                    />
                  </div>

                  <div
                    className="mx-auto w-[88%] border-[2px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_1px_3px_rgba(50,24,12,0.24)]"
                    style={{
                      backgroundColor: palette.effectBackground,
                      borderColor: palette.effectBorder,
                    }}
                  />

                  <div className="mx-auto grid w-[88%] grid-cols-[112px_1fr] items-end gap-2">
                    <Input
                      className="h-6 border-0 bg-transparent px-0 py-0 text-[15px] font-normal leading-none shadow-none placeholder:text-[#6f472d]/70 focus-visible:ring-0"
                      style={{ ...cardTextStyle, color: palette.text }}
                      aria-label="Serial Number"
                      value={form.serialNumber}
                      onChange={(event) =>
                        updateForm("serialNumber", event.target.value)
                      }
                      placeholder="00000000"
                    />
                    <div
                      className="whitespace-nowrap text-right text-[11px] font-normal leading-none text-[#3f2a1c]"
                      style={{ ...cardTextStyle, color: palette.text }}
                    >
                      ©1996 KAZUKI TAKAHASHI
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4" aria-label="Session Item actions">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="text-lg">{editorTitle}</CardTitle>
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

                  <div className="grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-2">
                    <Label className="grid gap-1 text-sm font-semibold">
                      Rarity
                      <Input
                        className="h-10 font-normal"
                        value={form.rarity}
                        onFocus={() => setRaritySuggestionsOpen(true)}
                        onChange={(event) => {
                          updateForm("rarity", event.target.value);
                          setRaritySuggestionsOpen(true);
                        }}
                        required
                      />
                    </Label>
                    <Label className="grid gap-1 text-sm font-semibold">
                      Quantity
                      <Input
                        className="h-10 font-normal"
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
                    <Label className="grid gap-1 text-sm font-semibold">
                      Language
                      <Input
                        className="h-10 font-normal"
                        value={form.language}
                        onChange={(event) =>
                          updateForm("language", event.target.value)
                        }
                        required
                      />
                    </Label>
                    <Label className="grid gap-1 text-sm font-semibold">
                      Condition
                      <Select
                        value={form.condition}
                        onValueChange={(value) =>
                          updateForm("condition", value as EditorForm["condition"])
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
        <p className="max-w-full rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          No items.
        </p>
      ) : (
        <ul className="grid min-w-0 gap-2 p-0">
          {items.map((item) => (
            <li className="min-w-0" key={item.id}>
              <button
                className={`block w-full max-w-full overflow-hidden rounded-md border px-3 py-2 text-left text-sm ${
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
