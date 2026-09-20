import { handleListProducts } from "@/lib/api/v1";
export const GET = (request: Request) => handleListProducts(request);
