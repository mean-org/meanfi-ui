import { type AccountInfo, type Connection, type ParsedAccountData, SystemProgram } from '@solana/web3.js';
import {
  getMintAddress,
  isProgramAccount,
  isProgramDataAccount,
  isTokenAccount,
  isTokenMint,
} from 'middleware/accountInfoGetters';
import getAccountInfoByAddress from 'middleware/getAccountInfoByAddress';
import { isValidAddress as isValidSolanaAddress } from 'middleware/ui';
import { type ValidationStatus, ValidationStatusCode } from 'models/ValidationStatus';
import { useCallback, useState } from 'react';

const DEFAULT_VALIDATION_STATUS: ValidationStatus = {
  code: ValidationStatusCode.PRISTINE,
  severity: 'info',
};

const useRecipientAddressValidation = ({ connection }: { connection: Connection }) => {
  const [isFetching, setIsFetching] = useState(false);
  const [isValidAddress, setIsValidAddress] = useState(false);
  const [parsedAccountInfo, setParsedAccountInfo] = useState<AccountInfo<ParsedAccountData> | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo<Buffer> | null>(null);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>(DEFAULT_VALIDATION_STATUS);
  const [isTransferDisabled, setIsTransferDisabled] = useState(false);

  const validateAddress = useCallback(
    async (address: string, destinationMintAddress: string) => {
      const validAddress = isValidSolanaAddress(address);

      if (!validAddress) {
        setValidationStatus({
          ...validationStatus,
          code: ValidationStatusCode.RECIPIENT_INVALID_ADDRESS,
          severity: 'info',
        });
        setIsValidAddress(validAddress);
        setIsTransferDisabled(true);
        return;
      }

      let accInfo: AccountInfo<Buffer> | null = null;
      let parsedAccInfo: AccountInfo<ParsedAccountData> | null = null;
      let transferDisabled = false;

      // Fetch account info
      setIsFetching(true);
      const result = await getAccountInfoByAddress(connection, address);
      console.log('getAccountInfoByAddress -> result:', result);
      setIsFetching(false);

      if (!result) {
        setValidationStatus({
          ...validationStatus,
          code: ValidationStatusCode.RECIPIENT_NO_ACCOUNT_INFO,
          severity: 'info',
        });
        setIsTransferDisabled(false);
        return;
      }

      accInfo = result.accountInfo;
      parsedAccInfo = result.parsedAccountInfo;
      console.log('accInfo:', accInfo);
      console.log('parsedAccInfo:', parsedAccInfo);

      // const nativeAccountBalance = accInfo?.lamports ?? 0
      const accountOwner = accInfo?.owner ?? parsedAccInfo?.owner;
      const isSystemOwnedAccount = !!accountOwner?.equals(SystemProgram.programId);
      const addressIsTokenAccount = isTokenAccount(parsedAccInfo);
      const addressIsTokenMint = isTokenMint(parsedAccInfo);
      const sourceMintAddress = getMintAddress(parsedAccInfo);
      console.log('isAta:', addressIsTokenAccount);
      console.log('isMint:', addressIsTokenMint);
      console.log('mint:', sourceMintAddress);
      console.log('owner:', accountOwner?.toString());

      if (addressIsTokenAccount) {
        if (sourceMintAddress === destinationMintAddress) {
          setValidationStatus({
            ...validationStatus,
            code: ValidationStatusCode.RECIPIENT_IS_TOKEN_ACCOUNT,
            severity: 'warning',
          });
        } else {
          transferDisabled = true;
          setValidationStatus({
            ...validationStatus,
            code: ValidationStatusCode.RECIPIENT_TOKEN_ACCOUNT_MINT_MISSMATCH,
            severity: 'error',
          });
        }
      } else if (addressIsTokenMint) {
        transferDisabled = true;
        setValidationStatus({
          ...validationStatus,
          code: ValidationStatusCode.RECIPIENT_IS_TOKEN_MINT,
          severity: 'error',
        });
      } else if (isSystemOwnedAccount) {
        setValidationStatus({
          ...validationStatus,
          code: ValidationStatusCode.RECIPIENT_IS_SYSTEM_ACCOUNT,
          severity: 'info',
        });
      } else if (isProgramAccount(parsedAccInfo) || isProgramDataAccount(parsedAccInfo)) {
        setValidationStatus({
          ...validationStatus,
          code: ValidationStatusCode.RECIPIENT_IS_PROGRAM_ACCOUNT,
          severity: 'warning',
        });
      } else {
        setValidationStatus({
          ...validationStatus,
          code: ValidationStatusCode.RECIPIENT_IS_SYSTEM_ACCOUNT,
          severity: 'warning',
        });
      }

      setIsTransferDisabled(transferDisabled);
      setParsedAccountInfo(parsedAccInfo);
      setAccountInfo(accInfo);
    },
    [connection, validationStatus],
  );

  return {
    isFetching,
    isValidAddress,
    isTransferDisabled,
    accountInfo,
    parsedAccountInfo,
    validationStatus,
    validateAddress,
  };
};

export default useRecipientAddressValidation;
