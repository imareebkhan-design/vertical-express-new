"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { submitBooking } from "@/actions/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROPERTY_TYPES = ["apartment", "house", "plot", "commercial"] as const;

export function BookingModal({
  open,
  onClose,
  serviceSlug,
  serviceName,
}: {
  open: boolean;
  onClose: () => void;
  serviceSlug: string;
  serviceName: string;
}) {
  const [values, setValues] = useState({
    name: "",
    phone: "",
    propertyType: "house" as (typeof PROPERTY_TYPES)[number],
    scope: "",
    preferredDate: "",
    pincode: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [bookingNo, setBookingNo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitBooking({ serviceSlug, ...values });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setBookingNo(res.data.bookingNo);
    });
  };

  const close = () => {
    setBookingNo(null);
    setError(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Book ${serviceName}`}
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card-lg bg-white p-6 shadow-card-hover sm:p-8"
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-full hover:bg-surface"
            >
              <X className="size-5" />
            </button>

            {bookingNo ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto size-14 text-success" strokeWidth={1.5} />
                <h2 className="mt-3 text-xl font-extrabold">Request received!</h2>
                <p className="mt-1 text-sm font-semibold text-neutral-500">
                  Booking <span className="font-extrabold text-ink">{bookingNo}</span> for {serviceName}.
                  Our team will call you within 24 hours to schedule a free consultation.
                </p>
                <Button className="mt-6" onClick={close}>Done</Button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2 className="text-xl font-extrabold">Book {serviceName}</h2>
                <p className="mt-1 text-sm font-semibold text-neutral-500">
                  Free consultation · No obligation
                </p>

                <div className="mt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Your name">
                      <Input value={values.name} onChange={(e) => set("name", e.target.value)} required />
                    </Field>
                    <Field label="Phone">
                      <Input
                        inputMode="numeric"
                        maxLength={10}
                        value={values.phone}
                        onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
                        required
                      />
                    </Field>
                  </div>

                  <Field label="Property type">
                    <div className="flex flex-wrap gap-2">
                      {PROPERTY_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => set("propertyType", t)}
                          className={`rounded-full border-2 px-3 py-1.5 text-xs font-extrabold uppercase capitalize transition-colors ${
                            values.propertyType === t ? "border-ink bg-ink text-white" : "border-neutral-200 hover:border-ink"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="What do you need?">
                    <textarea
                      value={values.scope}
                      onChange={(e) => set("scope", e.target.value)}
                      rows={3}
                      required
                      placeholder="e.g. 3BHK full interior, or waterproofing for a 1200 sq ft terrace"
                      className="w-full rounded-field border border-neutral-300 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-neutral-400 focus:border-ink focus:outline-none"
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Preferred date (optional)">
                      <Input type="date" value={values.preferredDate} onChange={(e) => set("preferredDate", e.target.value)} />
                    </Field>
                    <Field label="Pincode (optional)">
                      <Input
                        inputMode="numeric"
                        maxLength={6}
                        value={values.pincode}
                        onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
                      />
                    </Field>
                  </div>
                </div>

                {error && <p className="mt-3 text-sm font-bold text-danger">{error}</p>}

                <Button type="submit" size="lg" className="mt-5 w-full" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : "Request free consultation"}
                </Button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
