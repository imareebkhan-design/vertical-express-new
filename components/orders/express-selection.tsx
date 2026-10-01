/** Saved checkout choice, not a delivery-time or payment-status claim. */
export function ExpressRunBadge({ expressRun }: { expressRun: boolean }) {
  if (!expressRun) return null;
  return <span className="inline-flex rounded-full bg-brand/15 px-2 py-1 text-xs font-bold text-ink">Express selected</span>;
}

export interface DeliverySelectionShipment {
  sequence: number;
  expressRun: boolean;
}

export function OrderExpressSelection({ expressFeePaise, shipments }: {
  expressFeePaise: number | null | undefined;
  shipments: readonly DeliverySelectionShipment[];
}) {
  // Null predates express selection or means standard. Zero is a valid selection.
  if (expressFeePaise == null) return null;
  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3 text-xs text-ink">
      <p className="font-bold">Express selected at checkout</p>
      {shipments.length > 0 && (
        <ul className="mt-1 space-y-1 font-medium">
          {shipments.map((shipment) => (
            <li key={shipment.sequence}>
              Shipment {shipment.sequence} · {shipment.expressRun ? "Express delivery" : "Standard delivery"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
