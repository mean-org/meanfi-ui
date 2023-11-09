export interface ValidationStatus {
  code: ValidationStatusCode
  severity: 'info' | 'success' | 'warning' | 'error'
}

export enum ValidationStatusCode {
  PRISTINE = 0,
  // Recipiend field validation status
  RECIPIENT_INVALID_ADDRESS = 1,
  RECIPIENT_ATA_MINT_MATCH = 2,
  RECIPIENT_ATA_MINT_MISSMATCH = 3,
  RECIPIENT_MINT = 4,
  RECIPIENT_SYSTEM_ACCOUNT = 5,
  RECIPIENT_NO_ACCOUNT_INFO = 6
}
