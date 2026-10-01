import { handlePlaces } from "@/lib/api/places";
export const POST = (request: Request) => handlePlaces(request);
