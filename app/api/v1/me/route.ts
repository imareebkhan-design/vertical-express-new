import { handleGetMe, handleUpdateMe } from "@/lib/api/v1";
export const GET = (request: Request) => handleGetMe(request);
export const PATCH = (request: Request) => handleUpdateMe(request);
