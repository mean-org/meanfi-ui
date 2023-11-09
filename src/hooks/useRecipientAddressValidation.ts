import { useCallback, useState } from "react"
import { AccountInfo, Connection, ParsedAccountData } from "@solana/web3.js"
import getAccountInfoByAddress from "middleware/getAccountInfoByAddress"
import { isValidAddress as isValidSolanaAddress } from "middleware/ui"
import { ValidationStatus, ValidationStatusCode } from "models/ValidationStatus"
import { getMintAddress, isTokenAccount, isTokenMint } from "middleware/accountInfoGetters"

const DEFAULT_VALIDATION_STATUS: ValidationStatus = {
  code: ValidationStatusCode.PRISTINE,
  severity: 'info'
}

const useRecipientAddressValidation = ({ connection }: { connection: Connection }) => {
  const [isFetching, setIsFetching] = useState(false)
  const [isValidAddress, setIsValidAddress] = useState(false)
  const [parsedAccountInfo, setParsedAccountInfo] = useState<AccountInfo<ParsedAccountData> | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo<Buffer> | null>(null);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>(DEFAULT_VALIDATION_STATUS)
  const [isTransferDisabled, setIsTransferDisabled] = useState(false)

  const validateAddress = useCallback(async (address: string, forMint: string) => {
    const validAddress = isValidSolanaAddress(address)

    if (!validAddress) {
      setValidationStatus({ ...validationStatus, code: ValidationStatusCode.RECIPIENT_INVALID_ADDRESS, severity: 'info' })
      setIsValidAddress(validAddress)
      setIsTransferDisabled(true)
      return
    }

    let accInfo: AccountInfo<Buffer> | null = null
    let parsedAccInfo: AccountInfo<ParsedAccountData> | null = null
    let transferDisabled = false

    // Fetch account info
    setIsFetching(true)
    const result = await getAccountInfoByAddress(connection, address)
    console.log('getAccountInfoByAddress -> result:', result)
    setIsFetching(false)

    if (!result) {
      setValidationStatus({ ...validationStatus, code: ValidationStatusCode.RECIPIENT_NO_ACCOUNT_INFO, severity: 'warning' })
      setIsTransferDisabled(true)
      return
    }

    accInfo = result.accountInfo
    parsedAccInfo = result.parsedAccountInfo
    console.log('accInfo:', accInfo)
    console.log('parsedAccInfo:', parsedAccInfo)

    // const nativeAccountBalance = accInfo?.lamports ?? 0
    // const accountOwner = accInfo?.owner ?? parsedAccInfo?.owner
    const isAta = isTokenAccount(parsedAccInfo)
    const isMint = isTokenMint(parsedAccInfo)
    const mint = getMintAddress(parsedAccInfo)
    console.log('isAta:', isAta)
    console.log('isMint:', isMint)
    console.log('mint:', mint)

    if (isAta) {
      if (mint === forMint) {
        setValidationStatus({ ...validationStatus, code: ValidationStatusCode.RECIPIENT_ATA_MINT_MATCH, severity: 'warning' })
      } else {
        transferDisabled = true
        setValidationStatus({ ...validationStatus, code: ValidationStatusCode.RECIPIENT_ATA_MINT_MISSMATCH, severity: 'error' })
      }
    } else if (isMint) {
      transferDisabled = true
      setValidationStatus({ ...validationStatus, code: ValidationStatusCode.RECIPIENT_MINT, severity: 'error' })
    } else {
      setValidationStatus({ ...validationStatus, code: ValidationStatusCode.RECIPIENT_SYSTEM_ACCOUNT, severity: 'warning' })
    }

    setIsTransferDisabled(transferDisabled)
    setParsedAccountInfo(parsedAccInfo)
    setAccountInfo(accInfo)

  }, [connection, validationStatus])

  return { isFetching, isValidAddress, isTransferDisabled, accountInfo, parsedAccountInfo, validationStatus, validateAddress }
}

export default useRecipientAddressValidation