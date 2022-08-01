import React, { useContext, useState } from 'react';
import { Modal, Button, Spin, AutoComplete, Checkbox } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { Identicon } from '../Identicon';
import { CUSTOM_TOKEN_NAME, FALLBACK_COIN_IMAGE } from '../../constants';

import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { UserTokenAccount } from '../../models/transactions';
import { InputMean } from '../InputMean';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigVaultTransferAuthorityModal = (props: {
  handleClose: any;
  handleOk: any;
  handleAfterClose: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  selectedMultisig: MultisigInfo | undefined;
  multisigAccounts: MultisigInfo[];
  selectedVault: UserTokenAccount | undefined;
  assets: UserTokenAccount[];
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
    getTokenByMintAddress,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const [proposalTitle, setProposalTitle] = useState("");
  const [selectedAuthority, setSelectedAuthority] = useState('');
  const [destinationAddressDisclaimerAccepted, setDestinationAddressDisclaimerAccepted] = useState(false);

  const onAcceptModal = () => {
    props.handleOk({
      title: proposalTitle,
      selectedAuthority: selectedAuthority
    });
  }

  const onCloseModal = () => {
    props.handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    props.handleAfterClose();

    setTimeout(() => {
      setProposalTitle("");
      setSelectedAuthority("");
      setDestinationAddressDisclaimerAccepted(false);
    });

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  const isValidForm = (): boolean => {
    return proposalTitle &&
           selectedAuthority &&
           isValidAddress(selectedAuthority) &&
           (!props.selectedMultisig || (props.selectedMultisig && selectedAuthority !== props.selectedMultisig.authority.toBase58()))
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = () => {
    return !proposalTitle
      ? "Add a proposal title"
      : !selectedAuthority
        ? 'Enter an authority address'
        : selectedAuthority && !isValidAddress(selectedAuthority)
          ? 'Invalid address'
          : !destinationAddressDisclaimerAccepted
            ? "Accept disclaimer"
            : "Sign proposal"
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onMultisigSelected = (e: any) => {
    consoleOut('selectedAuthority:', e, 'blue');
    setSelectedAuthority(e);
  }

  const renderVault = (item: UserTokenAccount) => {
    const token = getTokenByMintAddress(item.address as string);
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };

    return (
      <div className="transaction-list-row no-pointer">
        <div className="icon-cell">
          <div className="token-icon">
            {token && token.logoURI ? (
              <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={item.address as string} style={{
                width: "28px",
                display: "inline-flex",
                height: "26px",
                overflow: "hidden",
                borderRadius: "50%"
              }} />
            )}
          </div>
        </div>
        <div className="description-cell">
          <div className="title text-truncate">{token ? token.symbol : `${CUSTOM_TOKEN_NAME} [${shortenAddress(item.address as string, 6)}]`}</div>
          <div className="subtitle text-truncate">{shortenAddress(item.publicAddress as string, 8)}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {getTokenAmountAndSymbolByTokenAddress(
              item.balance || 0,
              token ? token.address as string : '',
              true
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderMultisigSelectItem = (item: MultisigInfo) => ({
    key: item.authority.toBase58(),
    value: item.authority.toBase58(),
    label: (
      <div className={`transaction-list-row`}>
        <div className="icon-cell">
          <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
        </div>
        <div className="description-cell">
          {item.label ? (
            <div className="title text-truncate">{item.label}</div>
          ) : (
            <div className="title text-truncate">{shortenAddress(item.id.toBase58(), 8)}</div>
          )}
          {
            <div className="subtitle text-truncate">{shortenAddress(item.id.toBase58(), 8)}</div>
          }
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {
              t('multisig.multisig-accounts.pending-transactions', {
                txs: item.pendingTxsAmount
              })
            }
          </div>
        </div>
      </div>
    ),
  });

  const renderMultisigSelectOptions = () => {
    const options = props.multisigAccounts.map((multisig: MultisigInfo, index: number) => {
      return renderMultisigSelectItem(multisig);
    });
    return options;
  }

  const onDestinationAddressDisclaimerAcceptanceChange = (e: any) => {
    setDestinationAddressDisclaimerAccepted(e.target.checked);
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.transfer-authority.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Proposal title */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.proposal-modal.title')}</div>
              <InputMean
                id="proposal-title-field"
                name="Title"
                className="w-100 general-text-input"
                onChange={onTitleInputValueChange}
                placeholder="Add a proposal title (required)"
                value={proposalTitle}
              />
            </div>

            {props.selectedVault && (
              <div className="mb-3">
                <div className="form-label">{t('multisig.transfer-authority.selected-asset-label')}</div>
                <div className="well">
                  {renderVault(props.selectedVault)}
                </div>
              </div>
            )}

            <div className="mb-3">
              <div className="form-label">{t('multisig.transfer-authority.multisig-selector-label')}</div>
              <div className="well">
                <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                  <div className="left mr-0">
                    <AutoComplete
                      bordered={false}
                      style={{ width: '100%' }}
                      dropdownClassName="stream-select-dropdown"
                      options={renderMultisigSelectOptions()}
                      placeholder={t('multisig.transfer-authority.multisig-selector-placeholder')}
                      onChange={(inputValue, option) => {
                        setSelectedAuthority(inputValue);
                      }}
                      filterOption={(inputValue, option) => {
                        const originalItem = props.multisigAccounts.find(i => {
                          return option && i.authority.toBase58() === option.key ? true : false;
                        });
                        return (option && option.value.indexOf(inputValue) !== -1) || originalItem?.authority.toBase58().indexOf(inputValue) !== -1
                      }}
                      onSelect={onMultisigSelected}
                    />
                  </div>
                </div>
                {props.selectedMultisig && selectedAuthority === props.selectedMultisig.authority.toBase58() ? (
                  <span className="form-field-error">
                    {t('multisig.transfer-authority.multisig-already-owns-the-asset')}
                  </span>
                ) : selectedAuthority && !isValidAddress(selectedAuthority) ? (
                  <span className="form-field-error">
                    {t('transactions.validation.address-validation')}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mb-3 ml-1">
              <Checkbox
                checked={destinationAddressDisclaimerAccepted}
                onChange={onDestinationAddressDisclaimerAcceptanceChange}>
                {t('multisig.transfer-authority.asset-auth-destination-address-disclaimer')}
              </Checkbox>
            </div>

            {!isError(transactionStatus.currentOperation) && (
              <div className="col-12 p-0 mt-3">
                <Button
                  className={`center-text-in-btn ${props.isBusy ? 'inactive' : ''}`}
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  disabled={!isValidForm() || !destinationAddressDisclaimerAccepted}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                      onAcceptModal();
                    } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                      onCloseModal();
                    } else {
                      refreshPage();
                    }
                  }}>
                  {props.isBusy
                    ? t('multisig.transfer-authority.main-cta-busy')
                    : transactionStatus.currentOperation === TransactionStatus.Iddle
                      ? getTransactionStartButtonLabel()
                      : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                        ? t('general.cta-finish')
                        : t('general.refresh')
                  }
                </Button>
              </div>
            )}
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.transfer-authority.success-message')}</h4>
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
                        ? onAcceptModal()
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

      <div 
        className={
          props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
          }>          
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
