import { LoadingOutlined } from '@ant-design/icons';
import type { TransactionFees } from '@mean-dao/payment-streaming';
import {
  type AccountInfo,
  type Connection,
  LAMPORTS_PER_SOL,
  type ParsedAccountData,
  PublicKey,
  type VersionedTransaction,
} from '@solana/web3.js';
import { Button, Drawer, Modal } from 'antd';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from 'app-constants/common';
import { NATIVE_SOL } from 'app-constants/tokens';
import { openNotification } from 'components/Notifications';
import { TextInput } from 'components/TextInput';
import { TokenDisplay } from 'components/TokenDisplay';
import { TokenListItem } from 'components/TokenListItem';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { getNetworkIdByEnvironment, useConnection } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import { customLogger } from 'main';
import { getDecimalsFromAccountInfo } from 'middleware/accountInfoGetters';
import { createV0InitAtaAccountTx } from 'middleware/createV0InitAtaAccountTx';
import { sendTx, signTx } from 'middleware/transactions';
import { consoleOut, getTransactionStatusForLogs, isProd, isValidAddress } from 'middleware/ui';
import { getAmountFromLamports, getVersionedTxIxResume, shortenAddress } from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type { AccountTokenParsedInfo } from 'models/accounts';
import { OperationType, TransactionStatus } from 'models/enums';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LooseObject } from 'types/LooseObject';

export const AccountsInitAtaModal = (props: {
  connection: Connection;
  handleOk: () => void;
  handleClose: () => void;
  isVisible: boolean;
  ownedTokenAccounts: AccountTokenParsedInfo[] | undefined;
}) => {
  const { isVisible, handleClose, handleOk, ownedTokenAccounts } = props;
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const { tokenList, splTokenList, transactionStatus, setTransactionStatus } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const [isBusy, setIsBusy] = useState(false);
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenFilter, setTokenFilter] = useState('');
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [transactionFees] = useState<TransactionFees>({
    blockchainFee: 5000 / LAMPORTS_PER_SOL,
    mspFlatFee: 0.00001,
    mspPercentFee: 0,
  });
  const [feeAmount] = useState<number>(transactionFees.blockchainFee + transactionFees.mspFlatFee);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);

  // Callbacks

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback(
    (searchString: string) => {
      if (!selectedList) {
        return;
      }

      const timeout = setTimeout(() => {
        const filter = (t: TokenInfo) => {
          return (
            t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
            t.name.toLowerCase().includes(searchString.toLowerCase()) ||
            t.address.toLowerCase().includes(searchString.toLowerCase())
          );
        };

        const preFilterSol = selectedList.filter(t => t.address !== NATIVE_SOL.address);
        const showFromList = !searchString ? preFilterSol : preFilterSol.filter(t => filter(t));

        setFilteredTokenList(showFromList);
      });

      return () => {
        clearTimeout(timeout);
      };
    },
    [selectedList],
  );

  // Effects

  // Build the token list when the modal becomes visible
  useEffect(() => {
    if (isVisible && ownedTokenAccounts) {
      const finalList = new Array<TokenInfo>();

      // Make a copy of the MeanFi favorite tokens
      const meanTokensCopy = JSON.parse(JSON.stringify(tokenList)) as TokenInfo[];

      // Add all other items but excluding those in meanTokensCopy (only in mainnet)
      if (isProd()) {
        for (const item of splTokenList) {
          if (!meanTokensCopy.some(t => t.address === item.address)) {
            meanTokensCopy.push(item);
          }
        }
      }

      // Build a token list excluding already owned token accounts
      for (const item of meanTokensCopy) {
        if (!ownedTokenAccounts.some(t => t.parsedInfo.mint === item.address)) {
          finalList.push(item);
        }
      }

      setSelectedList(finalList);
      consoleOut('token list:', finalList, 'blue');
    }
  }, [isVisible, ownedTokenAccounts, splTokenList, tokenList]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance]);

  // First time token list
  useEffect(() => {
    if (selectedList.length > 0 && !tokenFilter && filteredTokenList.length === 0) {
      consoleOut('Initializing filtered list...', '', 'blue');
      updateTokenListByFilter('');
    }
  }, [filteredTokenList.length, selectedList.length, tokenFilter, updateTokenListByFilter]);

  // Events and actions

  const setModalBodyMinHeight = useCallback((addMinHeight: boolean) => {
    const modalBody = document.querySelector('.exchange-modal .ant-modal-content');
    if (modalBody) {
      if (addMinHeight) {
        modalBody.classList.add('drawer-open');
      } else {
        modalBody.classList.remove('drawer-open');
      }
    }
  }, []);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById('token-search-otp');
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  const showTokenSelector = useCallback(() => {
    setIsTokenSelectorVisible(true);
    setModalBodyMinHeight(true);
    autoFocusInput();
  }, [autoFocusInput, setModalBodyMinHeight]);

  const onCloseTokenSelector = useCallback(() => {
    setIsTokenSelectorVisible(false);
    setModalBodyMinHeight(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [setModalBodyMinHeight, tokenFilter]);

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
    setSelectedToken(undefined);
  }, [updateTokenListByFilter]);

  const onTokenSearchInputChange = useCallback(
    (value: string) => {
      const newValue = value.trim();
      setTokenFilter(newValue);
      updateTokenListByFilter(newValue);
    },
    [updateTokenListByFilter],
  );

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const isTokenAlreadyOwned = useCallback(() => {
    if (!selectedToken || !ownedTokenAccounts) {
      return false;
    }

    return ownedTokenAccounts.some(ta => selectedToken.address === ta.parsedInfo.mint);
  }, [ownedTokenAccounts, selectedToken]);

  const onTransactionFinished = useCallback(() => {
    resetTransactionStatus();
    handleOk();
  }, [handleOk, resetTransactionStatus]);

  const onStartTransaction = async () => {
    let transaction: VersionedTransaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    const createTx = async (): Promise<boolean> => {
      if (publicKey && selectedToken) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const data = {
          owner: publicKey.toBase58(),
          mint: selectedToken.address,
        };

        consoleOut('createAtaAccount data:', data, 'blue');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        return await createV0InitAtaAccountTx(
          connection, // connection
          new PublicKey(selectedToken.address), // mint
          publicKey, // owner
        )
          .then(value => {
            consoleOut('createAtaAccount returned transaction:', value);
            // Stage 1 completed - The transaction is created and returned
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getVersionedTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('createAtaAccount transaction init error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Create Asset transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('Create Asset transaction failed', {
        transcript: transactionLog,
      });
      return false;
    };

    if (wallet && publicKey && selectedToken) {
      setIsBusy(true);
      const created = await createTx();
      consoleOut('created:', created);
      if (created && transaction) {
        const sign = await signTx('Create Asset', wallet.adapter, publicKey, transaction as VersionedTransaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Create Asset', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.CreateAsset,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Create Associated Token Account for ${selectedToken.symbol}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully created ATA account for ${selectedToken.symbol}`,
            });
            onTransactionFinished();
            setIsBusy(false);
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: 'error',
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  // Validation

  const isOperationValid = (): boolean => {
    return !!(
      publicKey &&
      nativeBalance &&
      nativeBalance > feeAmount &&
      selectedToken &&
      selectedToken.decimals >= 0 &&
      !isTokenAlreadyOwned()
    );
  };

  const getCtaLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
        ? t('transactions.validation.amount-sol-low')
        : nativeBalance < feeAmount
          ? t('transactions.validation.amount-sol-low')
          : !selectedToken
            ? 'No token selected'
            : isTokenAlreadyOwned() || selectedToken.decimals < 0
              ? 'Invalid selection'
              : 'Add asset';
  };

  // Rendering

  const renderTokenList = (
    <>
      {filteredTokenList.length > 0 &&
        filteredTokenList.map((t, index) => {
          if (t.address === NATIVE_SOL.address) {
            return null;
          }

          const onClick = () => {
            setSelectedToken(t);
            consoleOut('token selected:', t.symbol, 'blue');
            onCloseTokenSelector();
          };

          if (index < MAX_TOKEN_LIST_ITEMS) {
            return (
              <TokenListItem
                key={t.address}
                name={t.name || CUSTOM_TOKEN_NAME}
                mintAddress={t.address}
                token={t}
                className={selectedToken && selectedToken.address === t.address ? 'selected' : 'simplelink'}
                onClick={onClick}
                balance={0}
              />
            );
          }

          return null;
        })}
    </>
  );

  const renderTokenSelectorInner = (
    <div className='token-selector-wrapper'>
      <div className='token-search-wrapper'>
        <TextInput
          id='token-search-otp'
          value={tokenFilter}
          allowClear={true}
          extraClass='mb-2'
          onInputClear={onInputCleared}
          placeholder={t('token-selector.lookup-add-asset-input-placeholder')}
          onInputChange={onTokenSearchInputChange}
          error={
            tokenFilter && selectedToken && selectedToken.decimals === -1
              ? 'Account not found'
              : tokenFilter && selectedToken && selectedToken.decimals === -2
                ? 'Account is not a token mint'
                : ''
          }
        />
      </div>
      <div className='token-list'>
        {filteredTokenList.length > 0 && renderTokenList}
        {tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0 && (
          <TokenListItem
            key={tokenFilter}
            name={CUSTOM_TOKEN_NAME}
            mintAddress={tokenFilter}
            className={selectedToken && selectedToken.address === tokenFilter ? 'selected' : 'simplelink'}
            onClick={async () => {
              const address = tokenFilter;
              let decimals = -1;
              let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
              try {
                accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
                consoleOut('accountInfo:', accountInfo, 'blue');
              } catch (error) {
                console.error(error);
              }
              decimals = getDecimalsFromAccountInfo(accountInfo, -1);
              const uknwnToken: TokenInfo = {
                address,
                name: CUSTOM_TOKEN_NAME,
                chainId: getNetworkIdByEnvironment(environment),
                decimals,
                symbol: shortenAddress(address),
              };
              setSelectedToken(uknwnToken);
              consoleOut('token selected:', uknwnToken, 'blue');
              // Do not close on errors (-1 or -2)
              if (decimals >= 0) {
                onCloseTokenSelector();
              }
            }}
            balance={0}
          />
        )}
      </div>
    </div>
  );

  return (
    <Modal
      className='mean-modal simple-modal unpadded-content exchange-modal'
      title={<div className='modal-title'>Add Asset</div>}
      footer={null}
      open={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={370}
    >
      <div className='px-4 pb-3'>
        <div className='mb-2 shift-up-1 text-center'>
          <p>
            Adding an asset will initialize the Associated Token Account. You can add a custom asset by entering its
            mint address.
          </p>
          <p>The asset will be added to your wallet if you don't own it already.</p>
        </div>

        {/* Asset picker */}
        <div className='form-label'>Mint for your asset</div>
        <div className='well'>
          <div className='flex-fixed-left'>
            <div className='left'>
              <span className='add-on simplelink'>
                {selectedToken ? (
                  <TokenDisplay
                    onClick={showTokenSelector}
                    mintAddress={selectedToken.address}
                    name={selectedToken.name}
                    showCaretDown={true}
                    showName={selectedToken.name === CUSTOM_TOKEN_NAME}
                    fullTokenInfo={selectedToken}
                  />
                ) : (
                  <TokenDisplay
                    onClick={showTokenSelector}
                    mintAddress=''
                    noTokenLabel={t('swap.token-select-destination')}
                    showCaretDown={true}
                  />
                )}
              </span>
            </div>
            <div className='right'>&nbsp;</div>
          </div>
          {isTokenAlreadyOwned() ? (
            <span className='form-field-error'>You already own this asset</span>
          ) : selectedToken && selectedToken.decimals === -1 ? (
            <span className='form-field-error'>Account not found</span>
          ) : selectedToken && selectedToken.decimals === -2 ? (
            <span className='form-field-error'>Account is not a token mint</span>
          ) : null}
        </div>

        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type='primary'
          shape='round'
          size='large'
          disabled={!isOperationValid() || isBusy}
          onClick={onStartTransaction}
        >
          {isBusy && (
            <span className='mr-1'>
              <LoadingOutlined style={{ fontSize: '16px' }} />
            </span>
          )}
          {isBusy ? 'Initializing ATA' : getCtaLabel()}
        </Button>
      </div>

      <Drawer
        title={t('token-selector.modal-title')}
        placement='bottom'
        closable={true}
        onClose={onCloseTokenSelector}
        open={isTokenSelectorVisible}
        getContainer={false}
      >
        {renderTokenSelectorInner}
      </Drawer>
    </Modal>
  );
};
