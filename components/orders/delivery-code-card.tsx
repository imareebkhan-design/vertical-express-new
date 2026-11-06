import Link from "next/link";
import { Truck } from "lucide-react";

export interface DeliveryCodeShipment {
  sequence: number;
  /** Set by `getShipmentsForOrder` only while the shipment is out for delivery. */
  deliveryCode: string | null;
}

/**
 * The delivery code on the order page itself, with the way to live tracking.
 *
 * The code was only on `/account/orders/<no>/tracking`, and nothing on the web
 * linked there, so a customer on the website had no way to find the code the
 * driver asks for at the gate (staging acceptance B6, 1 Nov 2026). The app
 * already shows it on its order screen.
 *
 * Nothing here decides who may see the code or when: `getShipmentsForOrder`
 * returns it only to the order's owner and only while the goods are on the road.
 */
export function DeliveryCodeCard({ orderNo, shipments }: { orderNo: string; shipments: readonly DeliveryCodeShipment[] }) {
  const onTheRoad = shipments.filter((s): s is DeliveryCodeShipment & { deliveryCode: string } => !!s.deliveryCode);
  if (onTheRoad.length === 0) return null;
  const several = shipments.length > 1;

  return (
    <section aria-label="Delivery code" className="rounded-2xl border border-brand/40 bg-brand/10 p-4 text-ink">
      {onTheRoad.map((s) => (
        <div key={s.sequence} className="mb-3 last:mb-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink/60">
            Delivery code{several ? ` · shipment ${s.sequence}` : ""}
          </p>
          <p className="mt-1 font-mono text-2xl font-extrabold tracking-[0.3em]" aria-label={`Delivery code ${s.deliveryCode.split("").join(" ")}`}>
            {s.deliveryCode}
          </p>
        </div>
      ))}
      <p className="mt-2 text-xs font-semibold text-ink/70">Share it only when the material is at your gate.</p>
      <Link
        href={`/account/orders/${orderNo}/tracking`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-extrabold text-white"
      >
        <Truck className="size-4" aria-hidden />
        Track delivery
      </Link>
    </section>
  );
}
