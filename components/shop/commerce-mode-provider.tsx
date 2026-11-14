"use client";

import { createContext, useContext } from "react";

/**
 * The deployment's COMMERCE_MODE, as the client sees it (lib/commerce-mode.ts).
 *
 * Set once in the root layout from `orderingOpen()`. Purchase controls read it
 * to offer "Enquire" instead of "Add to cart" in catalogue mode. It only decides
 * what is shown: the server refuses the cart add, checkout, payment and reorder
 * itself, so a stale page or a missing provider cannot open ordering.
 *
 * The default is `true` so a component rendered without the provider (tests,
 * stories) behaves as it did before catalogue mode existed.
 */
const OrderingOpenContext = createContext(true);

export function CommerceModeProvider({ orderingOpen, children }: { orderingOpen: boolean; children: React.ReactNode }) {
  return <OrderingOpenContext.Provider value={orderingOpen}>{children}</OrderingOpenContext.Provider>;
}

/** May the customer add to a cart and check out on this deployment? */
export function useOrderingOpen(): boolean {
  return useContext(OrderingOpenContext);
}
