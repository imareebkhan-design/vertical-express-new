import type { ReactNode } from "react";

/**
 * The table shape most operations screens share.
 *
 * Returns, the stock ledger, purchasing, suppliers, support, COD cash and
 * invoices are all the same object in the artboards: a filter row, a set of
 * columns, and rows that carry one action. Writing that seven times would mean
 * seven slightly different paddings and seven empty states that each say
 * nothing in their own way.
 *
 * The empty state is the part worth getting right. Several of these screens
 * have no model behind them yet, and "no rows" reads as "nothing happened
 * today" — a dispatcher seeing an empty Returns table concludes there are no
 * returns, not that returns are unrecorded. So `emptyTitle` states the absence
 * and `emptyNote` names what is missing.
 */
export function OpsTable({
  columns,
  rows,
  emptyTitle,
  emptyNote,
}: {
  columns: string[];
  rows: ReactNode[][];
  emptyTitle: string;
  emptyNote: string;
}) {
  return (
    <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
      {rows.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[13px] font-bold text-ink">{emptyTitle}</p>
          <p className="mx-auto mt-1.5 max-w-[480px] text-[12px] font-medium leading-[17px] text-ink-700">
            {emptyNote}
          </p>
        </div>
      ) : (
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              {columns.map((c) => (
                <th key={c} className="px-3 pb-2.5">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-t border-line">
                {cells.map((cell, j) => (
                  <td key={j} className="px-3 py-3 text-[12.5px] font-semibold">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * The filter chips these screens carry.
 *
 * Rendered inert while a screen has no model — a filter that cannot change
 * anything should not look like it can, so the active one is marked and the
 * rest are plainly unavailable rather than clickable and silent.
 */
export function OpsFilters({
  filters,
  active,
  disabled,
}: {
  filters: string[];
  active: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((f) => (
        <span
          key={f}
          aria-disabled={disabled || undefined}
          className={
            "rounded-full px-3.5 py-2 text-[12px] font-bold " +
            (f === active
              ? "bg-ink text-white"
              : disabled
                ? "bg-chip-soft text-ink-300"
                : "bg-chip text-ink-700")
          }
        >
          {f}
        </span>
      ))}
    </div>
  );
}
