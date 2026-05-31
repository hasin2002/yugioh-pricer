"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type Session = RouterOutputs["sessions"]["list"][number];
type Summary = RouterOutputs["sessions"]["summary"];

const formatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(date: string) {
  return formatter.format(new Date(date));
}

export function SessionDashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<number | null>(null);

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
                className="inline-flex min-h-[42px] items-center justify-center rounded-md bg-gray-900 px-4 font-bold text-white hover:bg-gray-800"
                href={`/capture?sessionId=${continueSession.id}`}
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
          className="rounded-lg border border-[#d9dee7] bg-white p-5"
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
            <div className="rounded-lg border border-dashed border-[#d9dee7] p-[22px] text-[#667085]">
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#d9dee7] p-[22px] text-[#667085]">
              No pricing sessions yet.
            </div>
          ) : (
            <ul className="grid list-none gap-3 p-0">
              {sessions.map((session) => (
                <li
                  className="rounded-lg border border-[#d9dee7] bg-white p-4"
                  key={session.id}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <form
                        className="mb-2 flex max-w-xl gap-2"
                        onSubmit={(event) => void submitRename(event, session.id)}
                      >
                        <input
                          className="min-h-10 min-w-0 flex-1 rounded-md border border-[#d9dee7] px-2 text-lg font-bold outline-none focus:border-[#98a2b3]"
                          defaultValue={session.name}
                          name="name"
                          aria-label={`Session name for ${session.name}`}
                        />
                        <button
                          className="min-h-10 rounded-md border border-[#b8c2d2] px-3 text-sm font-semibold text-[#344054] hover:bg-[#f2f4f7] disabled:cursor-not-allowed disabled:opacity-60"
                          type="submit"
                          disabled={savingId === session.id}
                        >
                          Save
                        </button>
                      </form>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#667085]">
                        <span>{session.reviewCount} reviews</span>
                        <span>Updated {formatDate(session.updatedAt)}</span>
                        {session.archivedAt ? (
                          <span className="font-semibold text-amber-700">
                            Archived
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#b8c2d2] px-3 font-semibold text-[#344054] hover:bg-[#f2f4f7]"
                        href={`/capture?sessionId=${session.id}`}
                      >
                        Resume
                      </a>
                      <button
                        className="min-h-10 rounded-md border border-[#b8c2d2] px-3 font-semibold text-[#344054] hover:bg-[#f2f4f7] disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        disabled={savingId === session.id}
                        onClick={() =>
                          void setArchived(session.id, !session.archivedAt)
                        }
                      >
                        {session.archivedAt ? "Unarchive" : "Archive"}
                      </button>
                      {deletePendingId === session.id ? (
                        <>
                          <button
                            className="min-h-10 rounded-md border border-red-700 bg-red-700 px-3 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            disabled={savingId === session.id}
                            onClick={() => void deleteSession(session.id)}
                          >
                            Confirm delete
                          </button>
                          <button
                            className="min-h-10 rounded-md border border-[#b8c2d2] px-3 font-semibold text-[#344054] hover:bg-[#f2f4f7]"
                            type="button"
                            onClick={() => setDeletePendingId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="min-h-10 rounded-md border border-red-200 px-3 font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={savingId === session.id}
                          onClick={() => setDeletePendingId(session.id)}
                        >
                          Delete
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
