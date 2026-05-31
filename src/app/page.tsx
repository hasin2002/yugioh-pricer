import { ApiHealth } from "@/components/api-health";

export default function Home() {
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

      <section
        className="min-w-0 p-5 md:p-8"
        aria-labelledby="home-title"
      >
        <header className="mb-7 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1
              className="mb-1.5 text-[28px] font-bold leading-tight"
              id="home-title"
            >
              Desktop review dashboard
            </h1>
            <p className="text-[#667085]">
              Local workspace for scanned cards, pricing, and review.
            </p>
          </div>
          <button
            className="min-h-[42px] whitespace-nowrap rounded-md bg-teal-700 px-4 font-bold text-white hover:bg-teal-800"
            type="button"
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
            <p className="text-3xl font-extrabold leading-none">£0.00</p>
          </article>
          <article className="rounded-lg border border-[#d9dee7] bg-white p-[18px]">
            <p className="mb-2.5 text-[13px] font-bold text-[#667085]">
              Review queue
            </p>
            <p className="text-3xl font-extrabold leading-none">0</p>
          </article>
          <article className="rounded-lg border border-[#d9dee7] bg-white p-[18px]">
            <p className="mb-2.5 text-[13px] font-bold text-[#667085]">
              Recent sessions
            </p>
            <p className="text-3xl font-extrabold leading-none">0</p>
          </article>
        </section>

        <section
          className="rounded-lg border border-[#d9dee7] bg-white p-5"
          aria-labelledby="recent-sessions-title"
        >
          <h2 className="mb-4 text-[17px] font-bold" id="recent-sessions-title">
            Recent pricing sessions
          </h2>
          <div className="rounded-lg border border-dashed border-[#d9dee7] p-[22px] text-[#667085]">
            No pricing sessions yet. The next slice can attach session creation
            to this shell.
          </div>
          <ApiHealth />
        </section>
      </section>
    </main>
  );
}
