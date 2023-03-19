import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from '@ant-design/icons';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { AccountType, PaymentStreamingAccount } from '@mean-dao/payment-streaming';
import { Button, Modal, Spin } from 'antd';
import { Identicon } from 'components/Identicon';
import { InputMean } from 'components/InputMean';
import { FALLBACK_COIN_IMAGE } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from 'contexts/wallet';
import { getStreamingAccountMint } from 'middleware/getStreamingAccountMint';
import { getStreamingAccountType } from 'middleware/getStreamingAccountType';
import { SOL_MINT } from 'middleware/ids';
import { isError } from 'middleware/transactions';
import { getTransactionOperationDescription } from 'middleware/ui';
import { getAmountWithSymbol, shortenAddress } from 'middleware/utils';
import { TransactionStatus } from 'models/enums';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  tokenBalance: number;
  nativeBalance: number;
  content: JSX.Element;
  isVisible: boolean;
  treasuryDetails?: TreasuryInfo | PaymentStreamingAccount;
  transactionFees: TransactionFees;
  transactionStatus: TransactionStatus | undefined;
  isBusy: boolean;
  selectedMultisig: MultisigInfo | undefined;
}) => {
  const { t } = useTranslation('common');
  const { theme, selectedAccount, transactionStatus, getTokenByMintAddress } = useContext(AppStateContext);
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [proposalTitle, setProposalTitle] = useState('');

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  const getStreamingAccountIcon = (item?: PaymentStreamingAccount | TreasuryInfo) => {
    if (!item) {
      return null;
    }

    const treasuryAssociatedToken = getStreamingAccountMint(item);
    const token = treasuryAssociatedToken ? getTokenByMintAddress(treasuryAssociatedToken) : undefined;

    return (
      <div className="token-icon">
        {treasuryAssociatedToken ? (
          <>
            {token && token.logoURI ? (
              <img alt={`${token.name}`} width={20} height={20} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={treasuryAssociatedToken} style={{ width: '20', display: 'inline-flex' }} />
            )}
          </>
        ) : (
          <Identicon address={item.id} style={{ width: '20', display: 'inline-flex' }} />
        )}
      </div>
    );
  };

  const getStreamingAccountDescription = (item: PaymentStreamingAccount | TreasuryInfo | undefined) => {
    if (!item) {
      return null;
    }
    const treasuryType = getStreamingAccountType(item);
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as PaymentStreamingAccount;
    const name = isV2Treasury ? v2.name : v1.label;
    return (
      <>
        {name ? (
          <>
            <div className="title text-truncate">
              {name}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {treasuryType === AccountType.Open ? 'Open' : 'Locked'}
              </span>
            </div>
            <div className="subtitle text-truncate">{shortenAddress(item.id as string, 8)}</div>
          </>
        ) : (
          <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
        )}
      </>
    );
  };

  const isValidForm = (): boolean => {
    return proposalTitle ? true : false;
  };

  const getTransactionStartButtonLabel = () => {
    if (props.isBusy) {
      return t('treasuries.close-account.cta-close-busy');
    } else if (isError(transactionStatus.currentOperation)) {
      return t('general.retry');
    } else if (isMultisigContext) {
      if (!proposalTitle) {
        return 'Add a proposal title';
      } else {
        return 'Sign proposal';
      }
    } else {
      return t('treasuries.close-account.cta-close');
    }
  };

  const getRetryCloseButtonLabel = () => {
    if (
      isError(transactionStatus.currentOperation) &&
      transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure
    ) {
      return t('general.retry');
    } else {
      return t('general.cta-close');
    }
  };

  const onAcceptModal = () => {
    props.handleOk(proposalTitle);
    setTimeout(() => {
      setProposalTitle('');
    }, 50);
  };

  const onCloseModal = () => {
    props.handleClose();
  };

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  };

  function onRetryCloseClick() {
    if (isError(transactionStatus.currentOperation)) {
      if (transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure) {
        onCloseModal();
      } else {
        onAcceptModal();
      }
    } else {
      onCloseModal();
    }
  }

  // Preset fee amount
  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(props.transactionFees.mspFlatFee);
    }
  }, [feeAmount, props.transactionFees]);

  const v1 = props.treasuryDetails as TreasuryInfo;
  const v2 = props.treasuryDetails as PaymentStreamingAccount;
  const isNewTreasury = props.treasuryDetails && props.treasuryDetails.version >= 2 ? true : false;

  const getMultisigProposalTitleField = () => {
    if (!isMultisigContext) {
      return null;
    }

    return (
      <div className="mb-3 mt-3">
        <div className="form-label text-left">{t('multisig.proposal-modal.title')}</div>
        <InputMean
          id="proposal-title-field"
          name="Title"
          className="w-100 general-text-input"
          onChange={onTitleInputValueChange}
          placeholder="Add a proposal title (required)"
          value={proposalTitle}
        />
      </div>
    );
  };

  const getStreamingAccountSummary = () => {
    return (
      <div className="text-left mb-3">
        {props.treasuryDetails ? (
          <>
            <div className="form-label icon-label">{t('treasuries.add-funds.select-streaming-account-label')}</div>
            <div className="transaction-list-row no-pointer">
              <div className="icon-cell">{getStreamingAccountIcon(props.treasuryDetails)}</div>
              <div className="description-cell">{getStreamingAccountDescription(props.treasuryDetails)}</div>
            </div>
          </>
        ) : null}
      </div>
    );
  };

  const getNonBusyOptions = () => {
    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
      return (
        <>
          <div className="mb-3 text-center">
            {/* <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0 mb-3" /> */}
            {theme === 'light' ? (
              <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
            ) : (
              <WarningOutlined style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
            )}
            <div className="mb-3 fg-warning operation">
              <span>{props.content}</span>
            </div>

            {props.selectedMultisig && (
              <div className="operation">{`Closing streaming account ${
                isNewTreasury ? v2.name : v1.label
              } will remove it completely from the multisig safe ${props.selectedMultisig?.label}`}</div>
            )}

            {/* Proposal title */}
            {getMultisigProposalTitleField()}

            {/* Streaming account */}
            {getStreamingAccountSummary()}

            {!isError(transactionStatus.currentOperation) && (
              <div className="col-12 p-0 mt-3">
                <Button
                  className={`center-text-in-btn ${props.isBusy ? 'inactive' : ''}`}
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  disabled={isMultisigContext && !isValidForm()}
                  onClick={() => onAcceptModal()}
                >
                  {props.isBusy && (
                    <span className="mr-1">
                      <LoadingOutlined style={{ fontSize: '16px' }} />
                    </span>
                  )}
                  {getTransactionStartButtonLabel()}
                </Button>
              </div>
            )}
          </div>
        </>
      );
    }
  };

  const renderConditionalContent = () => {
    switch (transactionStatus.currentOperation) {
      case TransactionStatus.Iddle:
        return getNonBusyOptions();
      case TransactionStatus.TransactionFinished:
        return (
          <div className="transaction-progress">
            <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
            <h4 className="font-bold">{t('treasuries.create-treasury.success-message')}</h4>
          </div>
        );
      default:
        return (
          <div className="transaction-progress p-0">
            <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
            {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
              <h4 className="mb-4">
                {t('transactions.status.tx-start-failure', {
                  accountBalance: getAmountWithSymbol(props.nativeBalance, SOL_MINT.toBase58()),
                  feeAmount: getAmountWithSymbol(
                    props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
                    SOL_MINT.toBase58(),
                  ),
                })}
              </h4>
            ) : (
              <h4 className="font-bold mb-3">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
            )}
          </div>
        );
    }
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={
        <div className="modal-title">
          {isMultisigContext ? 'Propose close account' : t('treasuries.close-account.modal-title')}
        </div>
      }
      maskClosable={false}
      footer={null}
      open={props.isVisible}
      onCancel={props.handleClose}
      width={380}
    >
      <div className={!props.isBusy ? 'panel1 show' : 'panel1 hide'}>{renderConditionalContent()}</div>

      <div
        className={
          props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle && (
          <div className="transaction-progress">
            <Spin indicator={bigLoadingIcon} className="icon mt-0" />
            <h4 className="font-bold mb-1">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className="indication">{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>

      {!(props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle) && (
        <div className="row two-col-ctas mt-3 transaction-progress p-2">
          <div className="col-12">
            <Button
              block
              type="text"
              shape="round"
              size="middle"
              className={`center-text-in-btn thin-stroke ${props.isBusy ? 'inactive' : ''}`}
              onClick={onRetryCloseClick}
            >
              {getRetryCloseButtonLabel()}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
