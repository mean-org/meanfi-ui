import React, { useCallback, useContext } from 'react';
import { useEffect, useState } from 'react';
import { Modal, Button, Spin, Select } from 'antd';
import { CheckOutlined, ExclamationCircleOutlined, InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from "@ant-design/icons";
import { getTransactionOperationDescription } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { isError } from '../../utils/transactions';
import { TransactionStatus } from '../../models/enums';
import { formatThousands, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { Treasury, TreasuryType } from '@mean-dao/msp';
import { AppStateContext } from '../../contexts/appstate';
import { useSearchParams } from 'react-router-dom';
import { InputMean } from '../InputMean';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { Identicon } from '../Identicon';
import { FALLBACK_COIN_IMAGE } from '../../constants';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  tokenBalance: number;
  nativeBalance: number;
  content: JSX.Element;
  isVisible: boolean;
  treasuryDetails: TreasuryInfo | Treasury | undefined
  transactionFees: TransactionFees;
  transactionStatus: TransactionStatus | undefined;
  isBusy: boolean;
  selectedMultisig: MultisigInfo | undefined;
}) => {
  const { t } = useTranslation('common');
  const [searchParams] = useSearchParams();
  const {
    theme,
    transactionStatus,
    getTokenByMintAddress
  } = useContext(AppStateContext);
  // const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [proposalTitle, setProposalTitle] = useState("");

  // const isUserTreasurer = (): boolean => {
  //   if (publicKey && props.treasuryDetails) {
  //     const me = publicKey.toBase58();
  //     const treasurer = props.treasuryDetails.treasurerAddress as string;
  //     return treasurer === me ? true : false;
  //   }
  //   return false;
  // }
  
  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = "error";
  };

  const getStreamingAccountIcon = (item: Treasury | TreasuryInfo | undefined) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    const token = isV2Treasury
      ? v2.associatedToken
        ? getTokenByMintAddress(v2.associatedToken as string)
        : undefined
      : v1.associatedTokenAddress
        ? getTokenByMintAddress(v1.associatedTokenAddress as string)
        : undefined;
    return (
      <div className="token-icon">
        {(isV2Treasury ? v2.associatedToken : v1.associatedTokenAddress) ? (
          <>
            {token ? (
              <img alt={`${token.name}`} width={20} height={20} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={(isV2Treasury ? v2.associatedToken : v1.associatedTokenAddress)} style={{ width: "20", display: "inline-flex" }} />
            )}
          </>
        ) : (
          <Identicon address={item.id} style={{ width: "20", display: "inline-flex" }} />
        )}
      </div>
    );
  }

  const getStreamingAccountDescription = (item: Treasury | TreasuryInfo | undefined) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    return (
      <>
        {(isV2Treasury && item ? v2.name : v1.label) ? (
          <>
            <div className="title text-truncate">
              {isV2Treasury ? v2.name : v1.label}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {isV2Treasury
                  ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                  : v1.type === TreasuryType.Open ? 'Open' : 'Locked'
                }
              </span>
            </div>
            <div className="subtitle text-truncate">{shortenAddress(item.id as string, 8)}</div>
          </>
        ) : (
          <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
        )}
      </>
    );
  }

  const getStreamingAccountStreamCount = (item: Treasury | TreasuryInfo | undefined) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    return (
      <>
        {!isV2Treasury && v1.upgradeRequired ? (
          <span>&nbsp;</span>
        ) : (
          <>
          <div className="rate-amount">
            {formatThousands(isV2Treasury ? v2.totalStreams : v1.streamsAmount)}
          </div>
          <div className="interval">streams</div>
          </>
        )}
      </>
    );
  }

  const isValidForm = (): boolean => {
    return proposalTitle
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = () => {
    return !proposalTitle
      ? 'Add a proposal title'
      : "Sign proposal"
  }

  const onAcceptModal = () => {
    props.handleOk(proposalTitle);
    setTimeout(() => {
      setProposalTitle('');
    }, 50);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  // Preset fee amount
  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(props.transactionFees.mspFlatFee);
    }
  }, [
    feeAmount,
    props.transactionFees
  ]);

  const getQueryAccountType = useCallback(() => {
    let accountTypeInQuery: string | null = null;
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        return accountTypeInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const param = getQueryAccountType();

  const v1 = props.treasuryDetails as TreasuryInfo;
  const v2 = props.treasuryDetails  as Treasury;
  const isNewTreasury = props.treasuryDetails  && props.treasuryDetails.version >= 2 ? true : false;

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{param === "multisig" ? "Propose close account" : t('treasuries.close-account.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onCancel={props.handleClose}
      width={380}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
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
                <div className="operation">{`Closing streaming account ${isNewTreasury ? v2.name : v1.label} will remove it completely from the multisig safe ${props.selectedMultisig?.label}`}</div>
              )}

              {/* Proposal title */}
              {param === "multisig" && (
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
              )}

              <div className="mb-3">
                <div className="form-label icon-label">
                  {t('treasuries.add-funds.select-streaming-account-label')}
                </div>
                <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                  <div className="text-left">
                    {props.treasuryDetails && (
                        <div className="transaction-list-row no-pointer">
                          <div className="icon-cell">{getStreamingAccountIcon(props.treasuryDetails)}</div>
                          <div className="description-cell">
                            {getStreamingAccountDescription(props.treasuryDetails)}
                          </div>
                          <div className="rate-cell">
                            {getStreamingAccountStreamCount(props.treasuryDetails)}
                          </div>
                        </div>
                    )}
                  </div>
                </div>
              </div>

              {!isError(transactionStatus.currentOperation) && (
                <div className="col-12 p-0 mt-3">
                  <Button
                    className={`center-text-in-btn ${props.isBusy ? 'inactive' : ''}`}
                    block
                    type="primary"
                    shape="round"
                    size="large"
                    disabled={param === "multisig" && !isValidForm()}
                    onClick={() => onAcceptModal()}>
                    {props.isBusy && (
                      <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                    )}
                    {props.isBusy
                      ? t('treasuries.close-account.cta-close-busy')
                      : isError(transactionStatus.currentOperation)
                        ? t('general.retry')
                        : (param === "multisig" ? getTransactionStartButtonLabel() : t('treasuries.close-account.cta-close'))
                    }
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('treasuries.create-treasury.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {/**
               * NOTE: CTAs block may be required or not when Tx status is Finished!
               * I choose to set transactionStatus.currentOperation to TransactionStatus.TransactionFinished
               * and auto-close the modal after 1s. If we chose to NOT auto-close the modal
               * Uncommenting the commented lines below will do it!
               */}
              {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
                <div className="row two-col-ctas mt-3 transaction-progress p-2">
                  <div className="col-12">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      className={`center-text-in-btn thin-stroke ${props.isBusy ? 'inactive' : ''}`}
                      onClick={() => isError(transactionStatus.currentOperation)
                        ? transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure
                          ? onCloseModal()
                          : onAcceptModal()
                        : onCloseModal()}>
                      {(isError(transactionStatus.currentOperation) && transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure)
                        ? t('general.retry')
                        : t('general.cta-close')
                      }
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className={props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
        {props.isBusy && transactionStatus !== TransactionStatus.Iddle && (
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
    </Modal>
  );
};
