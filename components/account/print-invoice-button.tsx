"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Print control for the tax invoice.
 *
 * The invoice page is a Server Component, so it cannot carry an `onClick` of its
 * own — it previously shipped a `<script dangerouslySetInnerHTML>` that attached
 * `window.print()` to the button by id, alongside a dead `onClick={() => undefined}`.
 *
 * That inline script was the only executable inline script in the application and
 * the single thing standing between us and a Content Security Policy that does not
 * need `'unsafe-inline'` for its own code (ISS-022). A three-line client component
 * replaces it and makes the button actually work as written.
 */
export function PrintInvoiceButton({ className }: { className?: string }) {
  return (
    <Button onClick={() => window.print()} className={className}>
      <Printer className="size-4" /> Print / Download PDF
    </Button>
  );
}
