export type ImportErrorCode = "VALIDATION_ERROR" | "DUPLICATE_USER" | "ACCOUNT_INVITE_FAILED" | "ACCOUNT_PROVISIONING_FAILED" | "DATABASE_WRITE_FAILED" | "NOT_AUTHORIZED" | "UNKNOWN_IMPORT_ERROR";

export class ImportProvisioningError extends Error {
  constructor(readonly code: ImportErrorCode, readonly internalDetail?: string) { super(code); }
}

const messages: Record<ImportErrorCode, string> = {
  VALIDATION_ERROR: "This row contains invalid information.",
  DUPLICATE_USER: "A user with this school identifier already exists.",
  ACCOUNT_INVITE_FAILED: "Account invitation could not be sent. Please try again.",
  ACCOUNT_PROVISIONING_FAILED: "We couldn't create this account. Please try again.",
  DATABASE_WRITE_FAILED: "We couldn't save this user. Please try again.",
  NOT_AUTHORIZED: "You are not authorized to import users for this school.",
  UNKNOWN_IMPORT_ERROR: "We couldn't import this user. Please try again.",
};

export function classifyImportError(error: unknown): { code: ImportErrorCode; message: string } {
  const code = error instanceof ImportProvisioningError ? error.code : "DATABASE_WRITE_FAILED";
  return { code, message: messages[code] };
}
