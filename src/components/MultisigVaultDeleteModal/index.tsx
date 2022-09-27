import React, { useState } from 'react';
import { useContext } from 'react';
import { Modal, Button, Spin } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { getAmountWithSymbol, shortenAddress } from '../../middleware/utils';
import { TransactionStatus } from '../../models/enums';
import { isError } from '../../middleware/transactions';
import { CUSTOM_TOKEN_NAME, FALLBACK_COIN_IMAGE } from '../../constants';
import { Identicon } from '../Identicon';
import { consoleOut, getTransactionOperationDescription } from '../../middleware/ui';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from '@ant-design/icons';
import { UserTokenAccount } from "../../models/accounts";
import { InputMean } from '../InputMean';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigVaultDeleteModal = (props: {
  handleOk: any;
  handleClose: any;
  handleAfterClose: any;
  isVisible: boolean;
  isBusy: boolean;
  selectedVault: UserTokenAccount | undefined;
  selectedMultisig: MultisigInfo | undefined;
}) => {
  const { t } = useTranslation('common');
  const {
    theme,
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

  const getTransactionStartButtonLabel = () => {
    return !proposalTitle
      ? 'Add a proposal title'
      : "Sign delete proposal"
  }

  const renderVault = (item: UserTokenAccount) => {
    if (!item || !item.publicAddress) {
      return null;
    }

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
          <div className="title text-truncate">{token ? token.symbol : `${CUSTOM_TOKEN_NAME} [${shortenAddress(item.address, 6)}]`}</div>
          <div className="subtitle text-truncate">{shortenAddress(item.publicAddress, 8)}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">
            {getAmountWithSymbol(
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
      title={<div className="modal-title">Propose asset deletion</div>}
      maskClosable={false}
      footer={null}
      open={props.isVisible}
      onOk={onAcceptDeleteVault}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Warning icon and message */}
            <div className="text-center">
              {theme === 'light' ? (
                <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
              ) : (
                <WarningOutlined style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
              )}

              {/* <h3 className="mb-3 fg-warning">{`Closing this account will remove this asset completely from the list of assets of this multisig ${props.selectedMultisig?.label}`}</h3> */}
              <div className="mb-3 fg-warning">
                <span>{`Closing this account will remove this asset completely from the list of assets of this multisig ${props.selectedMultisig?.label}`}</span>
              </div>
            </div>

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

            {!isError(transactionStatus.currentOperation) && (
              <div className="col-12 p-0 mt-3">
                <Button
                  className={`center-text-in-btn ${props.isBusy ? 'inactive' : ''}`}
                  block
                  type="primary"
                  shape="round"
                  size="large"
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
                      ?  getTransactionStartButtonLabel()
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
              <h4 className="font-bold">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold mb-3">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>

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
                        ? onAcceptDeleteVault()
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
          <Spin indicator={bigLoadingIcon} className="icon mt-0 mb-2" />
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
  )
};