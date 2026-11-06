import { handleReverseGeocode } from "@/lib/api/v1";
export const GET = (request: Request) => handleReverseGeocode(request);
