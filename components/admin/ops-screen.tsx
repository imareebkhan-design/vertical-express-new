import type { ReactNode } from "react";

/**
 * The frame every operations screen sits in, and the honest state for one that
 * is designed but not yet built.
 *
 * The ops canvas specifies twenty-five screens. Ten of them have a sidebar entry
 * and nothing behind it, and a console where a third of the navigation 404s is
 * worse than one that admits what is missing — a dispatcher who clicks Returns
 * mid-shift and gets an error page learns not to trust the tool.
 *
 * So an unbuilt screen says what it will do, what it needs before it can, and
 * where to go meanwhile. That is a design element in its own right: the artboard
 * set is the plan, and this makes the plan legible from inside the product.
 */
export function OpsScreen({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.022em] text-ink">{title}</h1>
      {intro && (
        <p className="mt-1.5 max-w-[680px] text-[13px] font-medium leading-[19px] text-ink-700">
          {intro}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </div>
  );
}

/**
 * A screen the canvas defines and the system cannot yet serve.
 *
 * `needs` is the specific reason, not a shrug — "there is no Shipment status
 * board" tells the next engineer where to start, and tells whoever is running
 * the warehouse today why they are still using paper.
 */
export function OpsNotBuilt({
  does,
  needs,
}: {
  does: string;
  needs: string[];
}) {
  return (
    <div className="rounded-[18px] border border-line bg-paper p-6 shadow-card">
      <p className="text-[13px] font-bold text-ink">What this screen will do</p>
      <p className="mt-1.5 text-[13px] font-medium leading-[19px] text-ink-700">{does}</p>

      <p className="mt-5 text-[13px] font-bold text-ink">What it needs first</p>
      <ul className="mt-1.5 space-y-1">
        {needs.map((n) => (
          <li key={n} className="text-[13px] font-medium leading-[19px] text-ink-700">
            · {n}
          </li>
        ))}
      </ul>

      <p className="mt-5 rounded-[12px] bg-ops-warn-tint px-3.5 py-2.5 text-[12px] font-semibold text-ops-warn">
        Not built yet. This screen is designed in the operations canvas and is not
        wired to anything — nothing here reflects live data.
      </p>
    </div>
  );
}
