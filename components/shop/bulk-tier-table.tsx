import { formatPaise } from "@/lib/money";

interface Tier {
  minQty: number;
  pricePaise: number;
}

/** Trade-pricing ladder shown on the PDP; highlights the tier active for `qty`. */
export function BulkTierTable({
  basePaise,
  tiers,
  unitLabel,
  activeQty,
}: {
  basePaise: number;
  tiers: Tier[];
  unitLabel: string;
  activeQty: number;
}) {
  if (tiers.length === 0) return null;

  const rows = [{ minQty: 1, pricePaise: basePaise }, ...tiers];
  const activeMin = [...rows]
    .reverse()
    .find((r) => activeQty >= r.minQty)?.minQty;

  return (
    <div className="rounded-card border border-neutral-200 p-4">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-brand-deep">
        Bulk prices — buy more, save more
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            <th className="pb-2">Quantity</th>
            <th className="pb-2 text-right">Price {unitLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isActive = r.minQty === activeMin;
            return (
              <tr
                key={r.minQty}
                className={isActive ? "font-extrabold text-ink" : "font-semibold text-neutral-600"}
              >
                <td className="py-1">
                  {r.minQty === 1 ? "1+" : `${r.minQty}+`}
                  {isActive && (
                    <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                      Your price
                    </span>
                  )}
                </td>
                <td className="py-1 text-right">{formatPaise(r.pricePaise)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
