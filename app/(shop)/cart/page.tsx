import type { Metadata } from "next";
import { CartSwitcher } from "@/components/mobile/cart/cart-switcher";

export const metadata: Metadata = {
  title: "Your Cart",
  robots: { index: false },
};

export default function CartPage() {
  return (
    <CartSwitcher />
  );
}
