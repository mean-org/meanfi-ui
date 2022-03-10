import React from 'react';
import { useContext } from 'react';
import { Modal, Button, Spin } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { getTokenByMintAddress } from '../../utils/tokens';
import { getTokenAmountAndSymbolByTokenAddress, makeDecimal, shortenAddress } from '../../utils/utils';
import { TransactionStatus } from '../../models/enums';
import { isError } from '../../utils/transactions';
import { MultisigVault } from '../../models/multisig';
import { FALLBACK_COIN_IMAGE } from '../../constants';
import { Identicon } from '../Identicon';
import { consoleOut, getTransactionOperationDescription } from '../../utils/ui';
import { InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigVaultDeleteModal = (props: {
  handleOk: any;
  handleClose: any;
  handleAfterClose: any;
  isVisible: boolean;
  isBusy: boolean;
  selectedVault: MultisigVault | undefined;
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
  } = useContext(AppStateContext);

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    props.handleClose();
  }

  const onAcceptDeleteVault = () => {
    props.handleOk();
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
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

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.multisig-vaults.delete-vault.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptDeleteVault}
      onCancel={onCloseModal}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {(props.selectedVault && props.selectedVault.amount.toNumber() > 0) && (
              <h3>{t('multisig.multisig-vaults.delete-vault.warning-message')}</h3>
            )}
            {props.selectedVault && (
              <div className="mb-3">
                <div className="form-label">{t('multisig.multisig-vaults.delete-vault.selected-vault-label')}</div>
                <div className="well">
                  {renderVault(props.selectedVault)}
                </div>
              </div>
            )}

            {/* explanatory paragraph */}
            <p>{t('multisig.multisig-vaults.delete-vault.explanatory-paragraph')}</p>
          </>
        ) : (
          <>
            <div className="transaction-progress">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold mb-3">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
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
              ? onAcceptDeleteVault()
              : onCloseModal()}>
            {isError(transactionStatus.currentOperation)
              ? t('general.retry')
              : t('general.cta-close')
            }
          </Button>
        </div>
        <div className="col-6">
          <Button
            className={`extra-height ${props.isBusy ? 'inactive' : ''}`}
            block
            type="primary"
            shape="round"
            size="middle"
            disabled={props.selectedVault && props.selectedVault.amount.toNumber() > 0 }
            onClick={() => {
              if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                onAcceptDeleteVault();
              } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                onCloseModal();
              } else {
                refreshPage();
              }
            }}>
            {props.isBusy
              ? t('multisig.transfer-tokens.main-cta-busy')
              : transactionStatus.currentOperation === TransactionStatus.Iddle
                ? t('multisig.multisig-vaults.delete-vault.main-cta')
                : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                  ? t('general.cta-finish')
                  : t('general.refresh')
            }
          </Button>
        </div>
      </div>
    </Modal>
  )
};