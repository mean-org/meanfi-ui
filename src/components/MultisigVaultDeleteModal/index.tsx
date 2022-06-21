import React, { useEffect, useState } from 'react';
import { useContext } from 'react';
import { Modal, Button, Spin } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { TransactionStatus } from '../../models/enums';
import { isError } from '../../utils/transactions';
import { FALLBACK_COIN_IMAGE } from '../../constants';
import { Identicon } from '../Identicon';
import { consoleOut, getTransactionOperationDescription } from '../../utils/ui';
import { InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { UserTokenAccount } from '../../models/transactions';
import { InputMean } from '../InputMean';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigVaultDeleteModal = (props: {
  handleOk: any;
  handleClose: any;
  handleAfterClose: any;
  isVisible: boolean;
  isBusy: boolean;
  selectedVault: UserTokenAccount | undefined;
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
    getTokenByMintAddress,
    setTransactionStatus
  } = useContext(AppStateContext);

  const [proposalTitle, setProposalTitle] = useState("");

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    props.handleClose();
    onAfterClose();
  }

  const onAcceptDeleteVault = () => {
    props.handleOk({
      title: proposalTitle
    });
  }

  const onAfterClose = () => {
    props.handleAfterClose();

    setTimeout(() => {
      setProposalTitle("");
    });

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const isValidForm = (): boolean => {
    return proposalTitle && 
          props.selectedVault &&
          props.selectedVault.balance as number === 0
      ? true
      : false;
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
          <div className="title text-truncate">{token ? token.symbol : `Unknown token [${shortenAddress(item.address as string, 6)}]`}</div>
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

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.multisig-assets.delete-asset.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptDeleteVault}
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

            {(props.selectedVault && props.selectedVault.balance as number > 0) && (
              <h3>{t('multisig.multisig-assets.delete-asset.warning-message')}</h3>
            )}
            {props.selectedVault && (
              <div className="mb-3">
                <div className="form-label">{t('multisig.multisig-assets.delete-asset.selected-asset-label')}</div>
                <div className="well">
                  {renderVault(props.selectedVault)}
                </div>
              </div>
            )}

            {/* explanatory paragraph */}
            <p>{t('multisig.multisig-assets.delete-asset.explanatory-paragraph')}</p>
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
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

      {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
        <div className="row two-col-ctas mt-3 transaction-progress p-0">
          <div className={!isError(transactionStatus.currentOperation) ? "col-6" : "col-12"}>
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
          {!isError(transactionStatus.currentOperation) && (
            <div className="col-6">
              <Button
                className={`extra-height ${props.isBusy ? 'inactive' : ''}`}
                block
                type="primary"
                shape="round"
                size="middle"
                disabled={!isValidForm()}
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
                    ? t('multisig.multisig-assets.delete-asset.main-cta')
                    : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                      ? t('general.cta-finish')
                      : t('general.refresh')
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
};