import React, { useCallback, useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Divider, Input, Spin } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { NATIVE_SOL } from '../../constants/tokens';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { getAmountWithSymbol, shortenAddress } from '../../middleware/utils';
import { IconCheckedBox } from '../../Icons';
import { consoleOut, getTransactionOperationDescription, isProd, isValidAddress } from '../../middleware/ui';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { TransactionStatus } from '../../models/enums';
import { useWallet } from '../../contexts/wallet';
import { NATIVE_SOL_MINT } from '../../middleware/ids';
import { isError } from '../../middleware/transactions';
import { useConnection } from '../../contexts/connection';
import { openNotification } from '../Notifications';
import { CUSTOM_TOKEN_NAME } from '../../constants';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigCreateAssetModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  // tokens: any[]
}) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const {
    tokenList,
    splTokenList,
    transactionStatus,
    setTransactionStatus,
    getTokenByMintAddress,
  } = useContext(AppStateContext);
  const [token, setToken] = useState<TokenInfo>();
  const [customToken, setCustomToken] = useState("");

  /////////////////
  //   Getters   //
  /////////////////

  const getTransactionStartButtonLabel = (): string => {
    return !token
      ? t('multisig.create-asset.no-token')
      : t('multisig.create-asset.main-cta');
  }

  /////////////////////
  // Data management //
  /////////////////////

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  useEffect(() => {

    if (!connection || !publicKey || !tokenList.length || !splTokenList.length) {
      return;
    }

    const timeout = setTimeout(() => {
      const token = isProd()
        ? splTokenList[0]
        : tokenList[0]
      consoleOut('token:', token, 'blue');
      setToken(token);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    tokenList,
    publicKey,
    connection,
    splTokenList
  ]);

  ////////////////
  //   Events   //
  ////////////////

  const onAcceptModal = () => {
    props.handleOk({ token });
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {

    setTimeout(() => {
      setToken(tokenList[0]);

    }, 50);

    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onSetCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
      const unkToken: TokenInfo = {
        address: address,
        name: CUSTOM_TOKEN_NAME,
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
    } else {
      openNotification({
        title: t('notifications.error-title'),
        description: t('transactions.validation.invalid-solana-address'),
        type: "error"
      });
    }
  }, [
    setToken,
    t,
  ]);

  const onTokenChange = useCallback((e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setToken(token as TokenInfo);
      // toggleOverflowEllipsisMiddle(false);
    }

  },[getTokenByMintAddress]);

  const onCustomTokenChange = useCallback((e: any) => {
    setCustomToken(e.target.value);
  },[]);

  //////////////////
  //  Validation  //
  //////////////////

  const isValidInput = (): boolean => {
    return token ? true : false;
  }

  const isCreateVaultFormValid = () => {
    return publicKey && isValidInput() ? true : false;
  }

  /////////////////
  //  Rendering  //
  /////////////////

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.create-asset.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      open={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      {/* sdsssd */}
      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Token mint */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.create-asset.token-label')}</div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-left">
                  <div className="left">
                    <span className="add-on">
                      {(token && tokenList) && (
                        <Select className={`token-selector-dropdown`} value={token.address}
                            onChange={onTokenChange} bordered={false} showArrow={false}
                            dropdownRender={menu => (
                            <div>
                              {menu}
                              <Divider style={{ margin: '4px 0' }} />
                              <div style={{ display: 'flex', flexWrap: 'nowrap', padding: 8 }}>
                                <Input placeholder="Enter token address" style={{ flex: 'auto' }} value={customToken} onChange={onCustomTokenChange} />
                                <div style={{ flex: '0 0 auto' }} className="flex-row align-items-center">
                                  <span className="flat-button icon-button ml-1" onClick={() => onSetCustomToken(customToken)}><IconCheckedBox className="normal"/></span>
                                </div>
                              </div>
                            </div>
                          )}>
                          {tokenList.map((option: TokenInfo) => {
                            if (option.address === NATIVE_SOL.address) {
                              return null;
                            }
                            return (
                              <Option key={option.address} value={option.address}>
                                <div className="option-container">
                                  <TokenDisplay onClick={() => {}}
                                    mintAddress={option.address}
                                    name={option.name}
                                    showCaretDown={true}
                                  />
                                </div>
                              </Option>
                            );
                          })}
                        </Select>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.create-asset.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getAmountWithSymbol(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getAmountWithSymbol(
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

      {/**
       * NOTE: CTAs block may be required or not when Tx status is Finished!
       * I choose to set transactionStatus.currentOperation to TransactionStatus.TransactionFinished
       * and auto-close the modal after 1s. If we chose to NOT auto-close the modal
       * Uncommenting the commented lines below will do it!
       */}
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
                ? onAcceptModal()
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
                className={props.isBusy ? 'inactive' : ''}
                block
                type="primary"
                shape="round"
                size="middle"
                disabled={!isCreateVaultFormValid()}
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
                  ? t('multisig.create-asset.main-cta-busy')
                  : transactionStatus.currentOperation === TransactionStatus.Iddle
                  ? getTransactionStartButtonLabel()
                  : t('general.refresh')
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
