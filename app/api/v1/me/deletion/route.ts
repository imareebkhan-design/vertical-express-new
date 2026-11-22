import { handleDeleteAccount, handleGetDeletionStatus } from "@/lib/api/account-deletion";

export const GET = (request: Request) => handleGetDeletionStatus(request);
export const POST = (request: Request) => handleDeleteAccount(request);
