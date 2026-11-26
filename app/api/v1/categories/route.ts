import { handleListCategories } from "@/lib/api/v1";
export const GET = (request: Request) => handleListCategories(request);
