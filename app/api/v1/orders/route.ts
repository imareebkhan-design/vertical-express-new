import { handleListOrders } from "@/lib/api/v1";
export const GET = (request: Request) => handleListOrders(request);
