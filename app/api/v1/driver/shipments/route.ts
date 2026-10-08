import { handleDriverShipments } from "@/lib/api/tracking";
export const GET = (request: Request) => handleDriverShipments(request);
