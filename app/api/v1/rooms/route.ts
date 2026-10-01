import { handleListRooms } from "@/lib/api/v1";
export const GET = (request: Request) => handleListRooms(request);
