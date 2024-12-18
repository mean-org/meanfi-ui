import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { Button, Divider, Input, Modal, Select, Spin } from 'antd';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheckedBox } from 'src/Icons';
import { CUSTOM_TOKEN_NAME } from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { AppStateContext } from 'src/contexts/appstate';
import { useWallet } from 'src/contexts/wallet';
import { SOL_MINT } from 'src/middleware/ids';
import { isError } from 'src/middleware/transactions';
import { consoleOut, getTransactionOperationDescription, isProd, isValidAddress } from 'src/middleware/ui';
import { getAmountWithSymbol, shortenAddress } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { TransactionStatus } from 'src/models/enums';
import { openNotification } from '../Notifications';
import { TokenDisplay } from '../TokenDisplay';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface MultisigCreateAssetModalProps {
  handleClose: () => void;
  handleOk: (token: TokenInfo) => void;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
}

export const MultisigCreateAssetModal = ({
  handleClose,
  handleOk,
  isBusy,
  isVisible,
  nativeBalance,
  transactionFees,
}: MultisigCreateAssetModalProps) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const { splTokenList, transactionStatus, setTransactionStatus, getTokenByMintAddress } = useContext(AppStateContext);
  const [token, setToken] = useState<TokenInfo>();
  const [customToken, setCustomToken] = useState('');

  /////////////////
  //   Getters   //
  /////////////////

  const getTransactionStartButtonLabel = (): string => {
    return token ? t('multisig.create-asset.main-cta') : t('multisig.create-asset.no-token');
  };

  /////////////////////
  // Data management //
  /////////////////////

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll('.overflow-ellipsis-middle');
      for (const element of ellipsisElements) {
        const e = element as HTMLElement;
        if (e.offsetWidth < e.scrollWidth) {
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
    };
  }, []);

  // Set the first token in the list as the default token
  useEffect(() => {
    if (!splTokenList.length) {
      return;
    }

    const token = splTokenList[0];
    consoleOut('token:', token, 'blue');
    setToken(token);
  }, [splTokenList]);

  ////////////////
  //   Events   //
  ////////////////

  const onAcceptModal = () => {
    if (!token) {
      return;
    }
    handleOk(token);
  };

  const onCloseModal = () => {
    handleClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setToken(splTokenList[0]);
    }, 50);

    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  const onSetCustomToken = useCallback(
    (address: string) => {
      if (address && isValidAddress(address)) {
        const unkToken: TokenInfo = {
          address: address,
          name: CUSTOM_TOKEN_NAME,
          chainId: 101,
          decimals: 6,
          symbol: shortenAddress(address),
        };
        setToken(unkToken);
        consoleOut('token selected:', unkToken, 'blue');
      } else {
        openNotification({
          title: t('notifications.error-title'),
          description: t('transactions.validation.invalid-solana-address'),
          type: 'error',
        });
      }
    },
    [t],
  );

  const onTokenChange = useCallback(
    (e: string) => {
      consoleOut('token selected:', e, 'blue');
      const token = getTokenByMintAddress(e);
      if (token) {
        setToken(token);
      }
    },
    [getTokenByMintAddress],
  );

  const onCustomTokenChange = useCallback((e: string) => {
    setCustomToken(e);
  }, []);

  //////////////////
  //  Validation  //
  //////////////////

  const isValidInput = (): boolean => {
    return !!token;
  };

  const isCreateVaultFormValid = () => {
    return !!(publicKey && isValidInput());
  };

  /////////////////
  //  Rendering  //
  /////////////////

  const getMainCtaLabel = () => {
    if (isBusy) {
      return t('multisig.create-asset.main-cta-busy');
    }
    if (transactionStatus.currentOperation === TransactionStatus.Idle) {
      return getTransactionStartButtonLabel();
    }

    return t('general.refresh');
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{t('multisig.create-asset.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Idle ? 380 : 480}
    >
      <div className={isBusy ? 'panel1 hide' : 'panel1 show'}>
        {transactionStatus.currentOperation === TransactionStatus.Idle && (
          <>
            {/* Token mint */}
            <div className='mb-3'>
              <div className='form-label'>{t('multisig.create-asset.token-label')}</div>
              <div className={`well ${isBusy ? 'disabled' : ''}`}>
                <div className='flex-fixed-left'>
                  <div className='left'>
                    <span className='add-on'>
                      {token && splTokenList && (
                        <Select
                          className={'token-selector-dropdown'}
                          value={token.address}
                          onChange={onTokenChange}
                          variant='borderless'
                          suffixIcon={null}
                          dropdownRender={menu => (
                            <div>
                              {menu}
                              <Divider style={{ margin: '4px 0' }} />
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'nowrap',
                                  padding: 8,
                                }}
                              >
                                <Input
                                  placeholder='Enter token address'
                                  style={{ flex: 'auto' }}
                                  value={customToken}
                                  onChange={e => onCustomTokenChange(e.target.value)}
                                />
                                <div style={{ flex: '0 0 auto' }} className='flex-row align-items-center'>
                                  <span
                                    className='flat-button icon-button ml-1'
                                    onKeyDown={() => {}}
                                    onClick={() => onSetCustomToken(customToken)}
                                  >
                                    <IconCheckedBox className='normal' />
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        >
                          {(isProd() ? splTokenList : splTokenList).map((option: TokenInfo) => {
                            if (option.address === NATIVE_SOL.address) {
                              return null;
                            }
                            return (
                              <Option key={option.address} value={option.address}>
                                <div className='option-container'>
                                  <TokenDisplay
                                    onClick={() => {}}
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
        )}
        {transactionStatus.currentOperation === TransactionStatus.TransactionFinished && (
          <div className='transaction-progress'>
            <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
            <h4 className='font-bold'>{t('multisig.create-asset.success-message')}</h4>
          </div>
        )}
        {transactionStatus.currentOperation !== TransactionStatus.Idle &&
          transactionStatus.currentOperation !== TransactionStatus.TransactionFinished && (
            <div className='transaction-progress p-0'>
              <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className='mb-4'>
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                    feeAmount: getAmountWithSymbol(
                      transactionFees.blockchainFee + transactionFees.mspFlatFee,
                      SOL_MINT.toBase58(),
                    ),
                  })}
                </h4>
              ) : (
                <h4 className='font-bold mb-3'>
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
            </div>
          )}
      </div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle && (
          <div className='transaction-progress'>
            <Spin indicator={bigLoadingIcon} className='icon mt-0' />
            <h4 className='font-bold mb-1'>
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className='indication'>{t('transactions.status.instructions')}</div>
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
      {!isBusy && (
        <div className='row two-col-ctas mt-3 transaction-progress p-0'>
          <div className={!isError(transactionStatus.currentOperation) ? 'col-6' : 'col-12'}>
            <Button
              block
              type='text'
              shape='round'
              size='middle'
              className={isBusy ? 'inactive' : ''}
              onClick={() => (isError(transactionStatus.currentOperation) ? onAcceptModal() : onCloseModal())}
            >
              {isError(transactionStatus.currentOperation) ? t('general.retry') : t('general.cta-close')}
            </Button>
          </div>
          {!isError(transactionStatus.currentOperation) && (
            <div className='col-6'>
              <Button
                className={isBusy ? 'inactive' : ''}
                block
                type='primary'
                shape='round'
                size='middle'
                disabled={!isCreateVaultFormValid()}
                onClick={() => {
                  if (transactionStatus.currentOperation === TransactionStatus.Idle) {
                    onAcceptModal();
                  } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                    onCloseModal();
                  } else {
                    refreshPage();
                  }
                }}
              >
                {getMainCtaLabel()}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
