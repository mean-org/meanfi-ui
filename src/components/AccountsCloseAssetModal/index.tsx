import { LoadingOutlined } from '@ant-design/icons';
import type { TransactionFees } from '@mean-dao/payment-streaming';
import { type Connection, PublicKey } from '@solana/web3.js';
import { Button, Checkbox, Modal } from 'antd';
import type { CheckboxChangeEvent } from 'antd/lib/checkbox';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WRAPPED_SOL_MINT_ADDRESS } from 'src/app-constants/common';
import { InputMean } from 'src/components/InputMean';
import { TokenListItem } from 'src/components/TokenListItem';
import { useNativeAccount } from 'src/contexts/accounts';
import { useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import useTransaction from 'src/hooks/useTransaction';
import { createCloseTokenAccountTx } from 'src/middleware/createCloseTokenAccountTx';
import { getAmountFromLamports } from 'src/middleware/utils';
import type { UserTokenAccount } from 'src/models/accounts';
import { OperationType } from 'src/models/enums';

export const AccountsCloseAssetModal = (props: {
  connection: Connection;
  handleOk: () => void;
  handleClose: () => void;
  isVisible: boolean;
  asset: UserTokenAccount;
}) => {
  const { isVisible, handleClose, handleOk, asset } = props;
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [isBusy, setIsBusy] = useState(false);
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [transactionFees] = useState<TransactionFees>({
    blockchainFee: 0.015,
    mspFlatFee: 0,
    mspPercentFee: 0,
  });
  const [feeAmount] = useState<number>(transactionFees.blockchainFee + transactionFees.mspFlatFee);
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState<boolean>(false);
  const [enterYesWord, setEnterYesWord] = useState('');

  // Callbacks

  // Effects

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance]);

  // Events and actions

  const onIsVerifiedRecipientChange = (e: CheckboxChangeEvent) => {
    setIsDisclaimerAccepted(e.target.checked);
  };

  const onYesInputValueChange = (value: string) => {
    setEnterYesWord(value);
  };

  const { onExecute } = useTransaction();

  const onStartTransaction = async () => {
    if (!publicKey) return;

    const payload = () => {
      if (!asset.publicAddress) return;
      return {
        tokenPubkey: asset.publicAddress,
        owner: publicKey.toBase58(),
      };
    };

    await onExecute({
      name: 'Close Token Account',
      loadingMessage: () => `Close Token Account for ${asset.symbol}`,
      completedMessage: () => `Successfully closed account for ${asset.symbol}`,
      operationType: OperationType.CloseTokenAccount,
      payload,
      setIsBusy,
      nativeBalance,
      generateTransaction: async ({ data }) => {
        return createCloseTokenAccountTx(
          connection, // connection
          new PublicKey(data.tokenPubkey), // tokenPubkey
          publicKey, // owner
        );
      },
    });
    handleOk();
  };

  // Validation
  const isEnterYesWordValid = (): boolean => {
    return !!(enterYesWord && enterYesWord.toLocaleLowerCase() === 'yes');
  };

  const isOperationValidIfWrapSol = (): boolean => {
    return !!(
      publicKey &&
      nativeBalance &&
      nativeBalance > feeAmount &&
      asset &&
      isEnterYesWordValid() &&
      isDisclaimerAccepted
    );
  };

  const isOperationValid = (): boolean => {
    return !!(publicKey && nativeBalance && nativeBalance > feeAmount && asset && isDisclaimerAccepted);
  };

  const getCtaLabelIfWrapSol = () => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (nativeBalance < feeAmount) {
      return t('transactions.validation.amount-sol-low');
    }
    if (!asset) {
      return 'No token selected';
    }
    if (!isEnterYesWordValid()) {
      return 'Confirm account closure';
    }
    if (!isDisclaimerAccepted) {
      return 'Accept disclaimer';
    }

    return 'Close account';
  };

  const getCtaLabel = () => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (nativeBalance < feeAmount) {
      return t('transactions.validation.amount-sol-low');
    }
    if (!asset) {
      return 'No token selected';
    }
    if (!isDisclaimerAccepted) {
      return 'Accept disclaimer';
    }

    return 'Close account';
  };

  const renderMessages = () => {
    if (asset.address === WRAPPED_SOL_MINT_ADDRESS && asset.balance) {
      return (
        <p>
          Your Wrapped SOL token account has funds, therefore the balance will be unwrapped to Native SOL and the token
          account will be closed.
        </p>
      );
    }
    if (asset.address !== WRAPPED_SOL_MINT_ADDRESS && asset.balance) {
      return (
        <p>
          Your token account has funds, therefore it will be sent to the trash and the funds will be lost unless you
          transfer the funds to another account.
        </p>
      );
    }

    return (
      <p>Your token account is empty so it can be closed. Click Close account to remove the asset from your wallet.</p>
    );
  };

  const renderMainCtaLabel = () => {
    const isWrappedSol = () => {
      return !!(asset.balance && asset.balance > 0 && asset.address === WRAPPED_SOL_MINT_ADDRESS);
    };

    if (isBusy) {
      return 'Closing account';
    }
    if (isWrappedSol()) {
      return getCtaLabelIfWrapSol();
    }

    return getCtaLabel();
  };

  // Rendering
  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>Close Token Account</div>}
      footer={null}
      open={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={370}
    >
      <div className='shift-up-1'>
        <div className='mb-2 text-center'>{renderMessages()}</div>

        <div className='form-label'>Token account to close</div>
        <div className='well-group token-list mb-3'>
          <TokenListItem
            key={asset.address}
            name={asset.name}
            mintAddress={asset.address}
            token={asset}
            className='click-disabled'
            onClick={() => {
              // Nothing
            }}
            balance={asset.balance || 0}
          />
        </div>

        {asset.balance && asset.balance > 0 && asset.name !== 'Wrapped SOL' ? (
          <>
            <div className='mb-2 text-center'>
              <p>
                Enter <strong>YES</strong> to confirm you wish to close the account and burn the remaining tokens. This
                can not be undone so be sure you wish to proceed.
              </p>
            </div>

            <InputMean
              id='confirm-close-account-input'
              maxLength={3}
              placeholder='Type YES to confirm'
              onChange={onYesInputValueChange}
              value={enterYesWord}
            />
          </>
        ) : null}

        <div className='mb-3'>
          <Checkbox checked={isDisclaimerAccepted} onChange={onIsVerifiedRecipientChange}>
            I agree to remove this asset from my wallet
          </Checkbox>
        </div>

        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type='primary'
          shape='round'
          size='large'
          disabled={
            (asset.balance && asset.balance > 0 && asset.name !== 'Wrapped SOL'
              ? !isOperationValidIfWrapSol()
              : !isOperationValid()) || isBusy
          }
          onClick={onStartTransaction}
        >
          {isBusy && (
            <span className='mr-1'>
              <LoadingOutlined style={{ fontSize: '16px' }} />
            </span>
          )}
          {renderMainCtaLabel()}
        </Button>
      </div>
    </Modal>
  );
};
