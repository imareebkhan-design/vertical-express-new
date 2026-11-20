import { handleGetCart } from "@/lib/api/v1";
export const GET = (request: Request) => handleGetCart(request);
