import { handlePopularProducts } from "@/lib/api/v1";
export const GET = (request: Request) => handlePopularProducts(request);
