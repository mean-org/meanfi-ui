import {
  CheckOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  WarningFilled,
  WarningOutlined,
} from '@ant-design/icons';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { Treasury } from '@mean-dao/msp';
import { Button, Modal, Spin } from 'antd';
import BN from 'bn.js';
import { InputMean } from 'components/InputMean';
import { WRAPPED_SOL_MINT_ADDRESS } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { isError } from 'middleware/transactions';
import { getTransactionOperationDescription } from 'middleware/ui';
import { displayAmountWithSymbol, getAmountWithSymbol } from 'middleware/utils';
import { TransactionStatus } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const VestingContractCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  transactionFees: TransactionFees;
  treasuryBalance: number;
  vestingContract: Treasury | undefined;
}) => {
  const {
    handleClose,
    handleOk,
    isBusy,
    isVisible,
    nativeBalance,
    selectedMultisig,
    transactionFees,
    treasuryBalance,
    vestingContract,
  } = props;
  const { t } = useTranslation('common');
  const { theme, splTokenList, transactionStatus, getTokenByMintAddress } =
    useContext(AppStateContext);
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(
    undefined,
  );
  const [proposalTitle, setProposalTitle] = useState('');

  const getAvailableStreamingBalance = useCallback((item: Treasury) => {
    const getUnallocatedBalance = (details: Treasury) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    };

    if (item) {
      const unallocated = getUnallocatedBalance(item);
      return unallocated;
    }
    return new BN(0);
  }, []);

  const canClose = () => {
    if (vestingContract && vestingContract.totalStreams === 0) {
      return true;
    }

    return false;
  };

  // Preset fee amount
  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(transactionFees.mspFlatFee);
    }
  }, [feeAmount, transactionFees]);

  // Set a working token based on the Vesting Contract's Associated Token
  useEffect(() => {
    if (vestingContract) {
      let token = getTokenByMintAddress(
        vestingContract.associatedToken as string,
      );
      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL',
        }) as TokenInfo;
      }
      setSelectedToken(token);
    }

    return () => {};
  }, [getTokenByMintAddress, vestingContract]);

  const onAcceptModal = () => {
    handleOk(proposalTitle || '');
  };

  const onTitleInputValueChange = (e: any) => {
    const value = e.target.value;
    setProposalTitle(value);
  };

  const isValidForm = (): boolean => {
    return !selectedMultisig || (selectedMultisig && proposalTitle)
      ? true
      : false;
  };

  const getTransactionStartButtonLabel = () => {
    if (isBusy) {
      return t('vesting.close-account.close-cta-busy');
    } else if (isError(transactionStatus.currentOperation)) {
      return t('general.retry');
    } else if (selectedMultisig) {
      if (!proposalTitle) {
        return 'Add a proposal title';
      } else {
        return 'Sign proposal';
      }
    } else {
      return t('vesting.close-account.close-cta');
    }
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">
          {t('vesting.close-account.modal-title')}
        </div>
      }
      maskClosable={false}
      footer={null}
      open={isVisible}
      onCancel={handleClose}
      width={360}
    >
      <div className="scrollable-content">
        <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
          {transactionStatus.currentOperation === TransactionStatus.Iddle && (
            <>
              <div className="text-center">
                {theme === 'light' ? (
                  <WarningFilled
                    style={{ fontSize: 48 }}
                    className="icon mt-0 mb-3 fg-warning"
                  />
                ) : (
                  <WarningOutlined
                    style={{ fontSize: 48 }}
                    className="icon mt-0 mb-3 fg-warning"
                  />
                )}
                {!canClose() && (
                  <h2 className="mb-3 fg-warning">
                    {t('vesting.close-account.cannot-close-warn')}
                  </h2>
                )}
                <div className="mb-2">
                  {canClose() ? (
                    <span>
                      {t('vesting.close-account.can-close-explanation')}
                    </span>
                  ) : (
                    <span>
                      {vestingContract?.totalStreams &&
                      vestingContract.totalStreams > 1
                        ? t('vesting.close-account.cannot-close-explanation', {
                            numItems: vestingContract?.totalStreams,
                          })
                        : t(
                            'vesting.close-account.cannot-close-single-explanation',
                          )}
                    </span>
                  )}
                </div>
                {canClose() && vestingContract && selectedToken && (
                  <>
                    <div className="text-center">
                      {t('vesting.close-account.funds-left-in-contract')}
                    </div>
                    <div className="mt-2 two-column-layout px-5">
                      <div className="left text-right font-extrabold">
                        {displayAmountWithSymbol(
                          getAvailableStreamingBalance(vestingContract),
                          selectedToken.address,
                          selectedToken.decimals,
                          splTokenList,
                        )}
                      </div>
                      <div className="right text-left font-extrabold">
                        {getAmountWithSymbol(
                          treasuryBalance,
                          WRAPPED_SOL_MINT_ADDRESS,
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Proposal title */}
              {canClose() && selectedMultisig && (
                <div className="mb-3 mt-3">
                  <div className="form-label text-left">
                    {t('multisig.proposal-modal.title')}
                  </div>
                  <InputMean
                    id="proposal-title-field"
                    name="Title"
                    className="w-100 general-text-input"
                    onChange={onTitleInputValueChange}
                    placeholder="Title for the multisig proposal"
                    value={proposalTitle}
                  />
                </div>
              )}
            </>
          )}
          {transactionStatus.currentOperation ===
            TransactionStatus.TransactionFinished && (
            <>
              <div className="transaction-progress">
                <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                <h4 className="font-bold">
                  {t('treasuries.create-treasury.success-message')}
                </h4>
              </div>
            </>
          )}
          {transactionStatus.currentOperation !== TransactionStatus.Iddle &&
            transactionStatus.currentOperation !==
              TransactionStatus.TransactionFinished && (
              <>
                <div className="transaction-progress p-0">
                  <InfoCircleOutlined
                    style={{ fontSize: 48 }}
                    className="icon mt-0"
                  />
                  {transactionStatus.currentOperation ===
                  TransactionStatus.TransactionStartFailure ? (
                    <h4 className="mb-4">
                      {t('transactions.status.tx-start-failure', {
                        accountBalance: getAmountWithSymbol(
                          nativeBalance,
                          NATIVE_SOL_MINT.toBase58(),
                        ),
                        feeAmount: getAmountWithSymbol(
                          transactionFees.blockchainFee +
                            transactionFees.mspFlatFee,
                          NATIVE_SOL_MINT.toBase58(),
                        ),
                      })}
                    </h4>
                  ) : (
                    <h4 className="font-bold mb-3">
                      {getTransactionOperationDescription(
                        transactionStatus.currentOperation,
                        t,
                      )}
                    </h4>
                  )}
                </div>
              </>
            )}
        </div>

        <div
          className={
            isBusy &&
            transactionStatus.currentOperation !== TransactionStatus.Iddle
              ? 'panel2 show'
              : 'panel2 hide'
          }
        >
          {isBusy && transactionStatus !== TransactionStatus.Iddle && (
            <div className="transaction-progress">
              <Spin indicator={bigLoadingIcon} className="icon mt-0" />
              <h4 className="font-bold mb-1">
                {getTransactionOperationDescription(
                  transactionStatus.currentOperation,
                  t,
                )}
              </h4>
              {transactionStatus.currentOperation ===
                TransactionStatus.SignTransaction && (
                <div className="indication">
                  {t('transactions.status.instructions')}
                </div>
              )}
            </div>
          )}
        </div>

        {canClose() && (
          <div className="mb-2">
            <Button
              block
              type="primary"
              shape="round"
              size="large"
              disabled={isBusy || !isValidForm()}
              onClick={onAcceptModal}
            >
              {isBusy && (
                <span className="mr-1">
                  <LoadingOutlined style={{ fontSize: '16px' }} />
                </span>
              )}
              {getTransactionStartButtonLabel()}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
