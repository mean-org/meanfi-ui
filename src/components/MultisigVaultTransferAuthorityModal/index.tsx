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
import { getTokenAmountAndSymbolByTokenAddress, getTokenByMintAddress, makeDecimal, shortenAddress } from '../../utils/utils';
import { MultisigV2, MultisigVault } from '../../models/multisig';
import { Identicon } from '../Identicon';
import { FALLBACK_COIN_IMAGE } from '../../constants';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigVaultTransferAuthorityModal = (props: {
  handleClose: any;
  handleOk: any;
  handleAfterClose: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  selectedMultisig: MultisigV2 | undefined;
  multisigAccounts: MultisigV2[];
  selectedVault: MultisigVault | undefined;
  assets: MultisigVault[]
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
  } = useContext(AppStateContext);

  const [selectedAuthority, setSelectedAuthority] = useState('');
  const [destinationAddressDisclaimerAccepted, setDestinationAddressDisclaimerAccepted] = useState(false);

  const onAcceptModal = () => {
    props.handleOk(selectedAuthority);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {
    props.handleAfterClose();
  }

  const isValidForm = (): boolean => {
    return selectedAuthority &&
            isValidAddress(selectedAuthority) &&
            (!props.selectedMultisig || (props.selectedMultisig && selectedAuthority !== props.selectedMultisig.authority.toBase58()))
      ? true
      : false;
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onMultisigSelected = (e: any) => {
    consoleOut('selectedAuthority:', e, 'blue');
    setSelectedAuthority(e);
  }

  const renderVault = (item: MultisigVault) => {
    const token = getTokenByMintAddress(item.mint.toBase58());
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
              <Identicon address={item.mint.toBase58()} style={{
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
          <div className="title text-truncate">{token ? token.symbol : `Unknown token [${shortenAddress(item.mint.toBase58(), 6)}]`}</div>
          <div className="subtitle text-truncate">{shortenAddress(item.address.toBase58(), 8)}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {getTokenAmountAndSymbolByTokenAddress(
              makeDecimal(item.amount, token?.decimals || 6),
              token ? token.address as string : '',
              true
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderMultisigSelectItem = (item: MultisigV2) => ({
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
    const options = props.multisigAccounts.map((multisig: MultisigV2, index: number) => {
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
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>

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
                          return i.authority.toBase58() === option!.key ? true : false;
                        });
                        return option!.value.indexOf(inputValue) !== -1 || originalItem?.authority.toBase58().indexOf(inputValue) !== -1
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
            <div className="transaction-progress">
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

      <div className="row two-col-ctas mt-3 transaction-progress">
        <div className="col-6">
          <Button
            block
            type="text"
            shape="round"
            size="middle"
            className={props.isBusy ? 'inactive' : ''}
            onClick={() => isError(transactionStatus.currentOperation)
              ? onAcceptModal()
              : onCloseModal()}>
            {isError(transactionStatus.currentOperation)
              ? t('general.retry')
              : t('general.cta-close')
            }
          </Button>
        </div>
        <div className="col-6">
          <Button
            className={props.isBusy ? 'inactive' : ''}
            block
            type="primary"
            shape="round"
            size="middle"
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
                ? t('multisig.transfer-authority.main-cta')
                : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                  ? t('general.cta-finish')
                  : t('general.refresh')
            }
          </Button>
        </div>
      </div>

    </Modal>
  );
};
