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
    "nums min-w-9 rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
  const idle = "border-line text-muted hover:bg-surface-2 hover:text-text";
  const active = "border-brand bg-brand text-black";

  return (
    <nav className="mt-6 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button className={`${btn} ${idle}`} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
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
      <button className={`${btn} ${idle}`} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </nav>
  );
}
