// Result<T, AppError> — the shared return shape for every module-api function that can fail in
// an expected way (design.md §"Interfaces/Contracts"). Callers branch on `ok` instead of
// try/catch, so PG error codes never leak past the module boundary as raw exceptions.

export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_A_MEMBER"
  | "NOT_FOUND"
  | "ACCOUNT_DETAIL_REQUIRED"
  | "INVALID_ACCOUNT_TYPE"
  | "TRANSFER_LEG_NOT_MOVABLE"
  | "INVALID_DESTINATION_ACCOUNT"
  | "VOID_TRANSACTION_NOT_EDITABLE"
  | "INVALID_SUBTYPE_FOR_TYPE"
  | "CATEGORY_NAME_TAKEN"
  | "RECURRING_INVALID_STATE"
  | "INSTALLMENT_INVALID_INPUT"
  | "UNKNOWN_ERROR";

export type AppError = {
  code: AppErrorCode;
  message: string;
  cause?: unknown;
};

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}
