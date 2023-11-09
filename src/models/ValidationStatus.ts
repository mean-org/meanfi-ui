export interface ValidationStatus {
  code: ValidationStatusCode
  severity: 'info' | 'success' | 'warning' | 'error' | 'none'
}

export enum ValidationStatusCode {
  PRISTINE = 0,
  // Recipiend field validation status
  RECIPIENT_INVALID_ADDRESS = 1,
  RECIPIENT_IS_TOKEN_ACCOUNT = 2,
  RECIPIENT_TOKEN_ACCOUNT_MINT_MISSMATCH = 3,
  RECIPIENT_IS_TOKEN_MINT = 4,
  RECIPIENT_IS_SYSTEM_ACCOUNT = 5,
  RECIPIENT_IS_PROGRAM_ACCOUNT = 6,
  RECIPIENT_NO_ACCOUNT_INFO = 7
}
