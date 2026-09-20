import { handleCheckoutTotals } from "@/lib/api/v1";
export const POST = (request: Request) => handleCheckoutTotals(request);
