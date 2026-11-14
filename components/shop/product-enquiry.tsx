"use client";

import { submitProductEnquiryAction } from "@/actions/product-enquiry";
import { ProductEnquiryForm } from "@/components/shop/product-enquiry-form";

/** "Enquire about this product", bound to the server action. */
export function ProductEnquiry(props: { productId: string; productTitle: string }) {
  return <ProductEnquiryForm {...props} submit={submitProductEnquiryAction} />;
}
