import { handleSearchClosest } from "@/lib/api/v1";
export const GET = (request: Request) => handleSearchClosest(request);
