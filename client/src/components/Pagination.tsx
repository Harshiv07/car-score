import { Icon } from "./Icon";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const nums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);

  const btn =
    "nums grid h-10 min-w-10 place-items-center rounded-lg px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35";
  const idle = "text-muted hover:bg-surface hover:text-text";
  const active = "bg-text text-bg";
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between" aria-label="Pagination">
      <p className="nums text-[13px] text-faint">
        Showing {from.toLocaleString("en-CA")}-{to.toLocaleString("en-CA")} of {total.toLocaleString("en-CA")}
      </p>
      <div className="flex items-center gap-1">
        <button className={`${btn} ${idle}`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevron-left" />
        </button>
        {nums[0] > 1 && (
          <>
            <button className={`${btn} ${idle}`} onClick={() => onPage(1)}>
              1
            </button>
            {nums[0] > 2 && <span className="px-1 text-faint">…</span>}
          </>
        )}
        {nums.map((p) => (
          <button
            key={p}
            className={`${btn} ${p === page ? active : idle}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        {nums[nums.length - 1] < pages && (
          <>
            {nums[nums.length - 1] < pages - 1 && <span className="px-1 text-faint">…</span>}
            <button className={`${btn} ${idle}`} onClick={() => onPage(pages)}>
              {pages}
            </button>
          </>
        )}
        <button className={`${btn} ${idle}`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevron-left" className="rotate-180" />
        </button>
      </div>
    </nav>
  );
}
