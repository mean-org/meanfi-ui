import { WarningFilled } from '@ant-design/icons';
import { type DepositRecord, type DepositsInfo, StakingClient } from '@mean-dao/staking';
import { PublicKey, type Transaction } from '@solana/web3.js';
import { Button, Spin } from 'antd';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconStats } from 'src/Icons'
import { MEAN_TOKEN_LIST } from 'src/app-constants/tokens';
import { openNotification } from 'src/components/Notifications';
import { PreFooter } from 'src/components/PreFooter';
import { useNativeAccount } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { getNetworkIdByCluster, useConnection } from 'src/contexts/connection';
import { TxConfirmationContext, confirmationEvents } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import { appConfig, customLogger } from 'src/main';
import { getTokenAccountBalanceByAddress } from 'src/middleware/accounts';
import { composeTxWithPrioritizationFees, sendTx, signTx } from 'src/middleware/transactions';
import { consoleOut, getTransactionStatusForLogs, relativeTimeFromDates } from 'src/middleware/ui';
import {
  findATokenAddress,
  formatThousands,
  getAmountFromLamports,
  getTxIxResume,
  isValidNumber,
} from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { EventType, OperationType, TransactionStatus } from 'src/models/enums';
import { useAccountAssets } from 'src/query-hooks/accountTokens';
import { failsafeConnectionConfig, getDefaultRpc } from 'src/services/connections-hq';
import type { LooseObject } from 'src/types/LooseObject';
import './style.scss';

const DEFAULT_APR_PERCENT_GOAL = '21';

export const StakingRewardsView = () => {
  const { isWhitelisted, transactionStatus, setTransactionStatus } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const { account } = useNativeAccount();
  const { t } = useTranslation('common');
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState(false);
  const [aprPercentGoal, setAprPercentGoal] = useState(DEFAULT_APR_PERCENT_GOAL);
  const [depositsInfo, setDepositsInfo] = useState<DepositsInfo | undefined>(undefined);
  const [refreshingDepositsInfo, setRefreshingDepositsInfo] = useState<boolean>(false);
  const [shouldRefreshDepositsInfo, setShouldRefreshDepositsInfo] = useState(true);
  const [, setLastDepositSignature] = useState('');
  // Tokens and balances
  const [meanToken, setMeanToken] = useState<TokenInfo>();
  const [meanBalance, setMeanBalance] = useState<number | undefined>(undefined);
  const [meanStakingVaultBalance, setMeanStakingVaultBalance] = useState<number>(0);
  const [canSubscribe, setCanSubscribe] = useState(true);

  const { userAssets, loadingUserAssets } = useAccountAssets(publicKey?.toBase58() ?? '');

  const tokenAccounts = useMemo(() => {
    if (loadingUserAssets || !userAssets) return [];

    return userAssets.userTokenAccounts ?? [];
  }, [loadingUserAssets, userAssets]);

  // MEAN Staking Vault address
  const meanStakingVault = useMemo(() => {
    return appConfig.getConfig().meanStakingVault;
  }, []);

  const canDepositRewards = useMemo(() => {
    const acl = appConfig.getConfig().stakingRewardsAcl;
    if (publicKey && acl && acl.length > 0) {
      return acl.some(a => a === publicKey.toBase58());
    }

    return false;
  }, [publicKey]);

  // Access rights
  const userHasAccess = useMemo(() => {
    if (!publicKey) {
      return false;
    }

    const isUserAllowed = () => {
      if (isWhitelisted) {
        return true;
      }

      return canDepositRewards;
    };

    return isUserAllowed();
  }, [canDepositRewards, isWhitelisted, publicKey]);

  // Create and cache Staking client instance
  const stakeClient = useMemo(
    () => new StakingClient(getDefaultRpc().cluster, connection.rpcEndpoint, publicKey, failsafeConnectionConfig),
    [connection.rpcEndpoint, publicKey],
  );

  /////////////////
  //  Callbacks  //
  /////////////////

  const refreshMeanBalance = useCallback(async () => {
    if (!publicKey || !tokenAccounts || !tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!meanToken) {
      setMeanBalance(balance);
      return;
    }

    try {
      const meanTokenPk = new PublicKey(meanToken.address);
      const meanTokenAddress = findATokenAddress(publicKey, meanTokenPk);
      const result = await getTokenAccountBalanceByAddress(connection, meanTokenAddress);
      if (result) {
        balance = result.uiAmount || 0;
      }
      consoleOut('MEAN balance:', balance, 'blue');
      setMeanBalance(balance);
    } catch (error) {
      console.error(error);
      setMeanBalance(balance);
    }
  }, [tokenAccounts, meanToken, publicKey, connection]);

  const refreshMeanStakingVaultBalance = useCallback(async () => {
    if (!connection || !meanStakingVault) return 0;
    let balance = 0;
    try {
      const tokenAccount = new PublicKey(meanStakingVault);
      const tokenAmount = await connection.getTokenAccountBalance(tokenAccount);
      if (tokenAmount) {
        const value = tokenAmount.value;
        balance = value.uiAmount || 0;
      }
    } catch (error) {
      consoleOut('Could not find account:', meanStakingVault, 'red');
      console.error(error);
    }
    setMeanStakingVaultBalance(balance);
  }, [connection, meanStakingVault]);

  const getTotalMeanAdded = useCallback(() => {
    const apg = Number.parseFloat(aprPercentGoal) || 0;
    const result = apg ? (meanStakingVaultBalance * (apg / 100)) / 365 : 0;
    return result;
  }, [aprPercentGoal, meanStakingVaultBalance]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const onDepositTxConfirmed = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: event can be any type
    (value: any) => {
      consoleOut('onDepositTxConfirmed event executed:', value, 'crimson');
      resetTransactionStatus();
      setTimeout(() => {
        refreshMeanStakingVaultBalance();
        setShouldRefreshDepositsInfo(true);
      }, 100);
      setLastDepositSignature('');
    },
    [refreshMeanStakingVaultBalance, resetTransactionStatus],
  );

  const setFailureStatusAndNotify = useCallback(
    (txStep: 'sign' | 'send') => {
      const operation =
        txStep === 'sign' ? TransactionStatus.SignTransactionFailure : TransactionStatus.SendTransactionFailure;
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: operation,
      });
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-sending-transaction'),
        type: 'error',
      });
      setIsBusy(false);
    },
    [setTransactionStatus, t, transactionStatus.currentOperation],
  );

  const setSuccessStatus = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  /////////////////
  //   Effects   //
  /////////////////

  // Preset MEAN token
  useEffect(() => {
    if (!connection) {
      return;
    }

    const tokenList = MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(getDefaultRpc().cluster));
    const token = tokenList.find(t => t.symbol === 'MEAN');

    consoleOut('MEAN token', token, 'blue');
    setMeanToken(token);
  }, [connection]);

  // Keep native account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balances
      refreshMeanStakingVaultBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance, refreshMeanStakingVaultBalance]);

  // Keep MEAN balance updated
  useEffect(() => {
    refreshMeanBalance();
  }, [refreshMeanBalance]);

  useEffect(() => {
    consoleOut('tokenAccounts:', tokenAccounts, 'brown');
  }, [tokenAccounts]);

  // Refresh deposits info
  useEffect(() => {
    if (!connection || !shouldRefreshDepositsInfo) {
      return;
    }

    setTimeout(() => {
      setShouldRefreshDepositsInfo(false);
      setRefreshingDepositsInfo(true);
    });

    consoleOut('Refreshing deposits info...', '', 'blue');
    (async () => {
      await stakeClient
        .getDepositsInfo()
        .then(deposits => {
          consoleOut('deposits:', deposits, 'blue');
          setDepositsInfo(deposits);
        })
        .finally(() => setRefreshingDepositsInfo(false));
    })();
  }, [connection, shouldRefreshDepositsInfo, stakeClient]);

  // Setup event listeners
  useEffect(() => {
    if (!(pageInitialized && canSubscribe)) {
      return;
    }

    setCanSubscribe(false);
    consoleOut('Setup event subscriptions -> StakingRewardsView', '', 'brown');
    confirmationEvents.on(EventType.TxConfirmSuccess, onDepositTxConfirmed);
    consoleOut('Subscribed to event txConfirmed with:', 'onDepositTxConfirmed', 'brown');
  }, [canSubscribe, pageInitialized, onDepositTxConfirmed]);

  // Set when a page is initialized
  useEffect(() => {
    if (!pageInitialized && meanToken) {
      setPageInitialized(true);
    }
  }, [meanToken, pageInitialized]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> StakingRewardsView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onDepositTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      setCanSubscribe(true);
      setPageInitialized(false);
    };
  }, []);

  ///////////////////
  // Event hanling //
  ///////////////////

  const onStartDepositTx = async () => {
    let transaction: Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    resetTransactionStatus();

    const stakingVaultDepositTx = async ({
      stakeClient,
      depositPercentage,
    }: {
      stakeClient: StakingClient;
      depositPercentage: number;
    }) => {
      if (!publicKey) throw new Error('Wallet publicKey not found');

      const transaction = await stakeClient.depositTransaction(
        depositPercentage, // depositPercentage
      );

      return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
    };

    const createTx = async (): Promise<boolean> => {
      if (wallet && stakeClient && meanToken) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const depositPercentage = Number.parseFloat(aprPercentGoal) / 100;
        consoleOut('depositPercentage:', depositPercentage, 'blue');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: `depositPercentage: ${depositPercentage}%`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        return stakingVaultDepositTx({
          stakeClient,
          depositPercentage, // depositPercentage
        })
          .then(value => {
            consoleOut('depositTransaction returned transaction:', value);
            // Stage 1 completed - The transaction is created and returned
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('depositTransaction init error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Deposit transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('Deposit transaction failed', {
        transcript: transactionLog,
      });
      return false;
    };

    if (!(wallet && publicKey && meanToken)) {
      return;
    }

    setIsBusy(true);
    const created = await createTx();
    consoleOut('created:', created, 'blue');
    if (created) {
      const sign = await signTx('Deposit Staking Rewards', wallet.adapter, publicKey, transaction);
      if (sign.encodedTransaction) {
        encodedTx = sign.encodedTransaction;
        transactionLog = transactionLog.concat(sign.log);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.SignTransactionSuccess,
        });
        const sent = await sendTx('Deposit Staking Rewards', connection, encodedTx);
        consoleOut('sent:', sent);
        if (sent.signature) {
          signature = sent.signature;
          setLastDepositSignature(signature);
          consoleOut('Send Tx to confirmation queue:', signature);
          const depositionMessage = `Depositing ${formatThousands(getTotalMeanAdded(), meanToken.decimals)} ${
            meanToken.symbol
          } into the staking vault`;
          const depositSuccessMessage = `Successfully deposited ${formatThousands(
            getTotalMeanAdded(),
            meanToken.decimals,
          )} ${meanToken.symbol} into the staking vault`;
          enqueueTransactionConfirmation({
            signature,
            operationType: OperationType.Deposit,
            finality: 'confirmed',
            txInfoFetchStatus: 'fetching',
            loadingTitle: 'Confirming transaction',
            loadingMessage: depositionMessage,
            completedTitle: 'Transaction confirmed',
            completedMessage: depositSuccessMessage,
          });
          setAprPercentGoal(DEFAULT_APR_PERCENT_GOAL);
          setSuccessStatus();
        } else {
          setFailureStatusAndNotify('send');
        }
      } else {
        setFailureStatusAndNotify('sign');
      }
    } else {
      setIsBusy(false);
    }
  };

  const handleAmountChange = (e: string) => {
    let newValue = e;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (splitted[1]) {
      if (splitted[1].length > 2) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setAprPercentGoal('');
    } else if (newValue === '.') {
      setAprPercentGoal('.');
    } else if (isValidNumber(newValue)) {
      setAprPercentGoal(newValue);
    }
  };

  // Validation functions

  const isValidInput = (): boolean => {
    return !!(
      aprPercentGoal &&
      nativeBalance &&
      meanBalance &&
      Number.parseFloat(aprPercentGoal) >= 0.01 &&
      Number.parseFloat(aprPercentGoal) <= 100 &&
      meanBalance >= getTotalMeanAdded()
    );
  };

  /////////////////
  //  Rendering  //
  /////////////////

  const getRelativeDate = (utcDate: string) => {
    const reference = new Date(utcDate);
    return relativeTimeFromDates(reference);
  };

  const renderDepositHistory = (
    <div className='container-max-width-720 my-3'>
      <div className='item-list-header compact dark'>
        <div className='header-row'>
          <div className='std-table-cell responsive-cell px-2 text-left'>Date</div>
          <div className='std-table-cell responsive-cell px-3 text-right border-left border-right'>
            <span>
              Total Staked +<br />
              Rewards before
            </span>
          </div>
          <div className='std-table-cell responsive-cell px-3 text-right border-right'>
            <span>
              Deposited
              <br />
              Percentage
            </span>
          </div>
          <div className='std-table-cell responsive-cell px-3 text-right'>
            <span>
              Deposited
              <br />
              Amount
            </span>
          </div>
        </div>
      </div>

      <div className='transaction-list-data-wrapper vertical-scroll'>
        <Spin spinning={refreshingDepositsInfo}>
          <div className='activity-list h-100'>
            <div className='item-list-body compact dark'>
              {depositsInfo?.depositRecords &&
                depositsInfo.depositRecords.length > 0 &&
                depositsInfo.depositRecords.map((item: DepositRecord, index: number) => (
                  <div key={`${index}`} className='item-list-row'>
                    <div className='std-table-cell responsive-cell px-2 text-left'>
                      <span className='capitalize-first-letter'>{getRelativeDate(item.depositedUtc)}</span>
                    </div>
                    <div className='std-table-cell responsive-cell px-3 text-right border-left border-right'>
                      {formatThousands(item.totalStakedPlusRewardsUiAmount)} MEAN
                    </div>
                    <div className='std-table-cell responsive-cell px-3 text-right border-right'>
                      {item.depositedPercentage * 100}%
                    </div>
                    <div className='std-table-cell responsive-cell px-3 text-right'>
                      {formatThousands(item.depositedUiAmount)} MEAN
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </Spin>
      </div>
    </div>
  );

  const renderStakingRewardsVaultBalance = (
    <div className='well disabled'>
      <div className='flex-fixed-right'>
        <div className='left inner-label'>Total MEAN in Vault</div>
        <div className='right'>&nbsp;</div>
      </div>
      <div className='flex-fixed-right'>
        <div className='left static-data-field'>
          {formatThousands(meanStakingVaultBalance, meanToken?.decimals || 9)}
        </div>
        <div className='right'>&nbsp;</div>
      </div>
    </div>
  );

  const renderPercentGoalValidationErrors = () => {
    if (!aprPercentGoal || Number.parseFloat(aprPercentGoal) < 0.01 || Number.parseFloat(aprPercentGoal) > 100) {
      return <span className='form-field-error'>Valid values: from 0.01 to 100</span>;
    }
    if (meanStakingVaultBalance && meanBalance !== undefined && meanBalance < getTotalMeanAdded()) {
      return <span className='form-field-error'>Insufficient balance for APR Percent Goal</span>;
    }

    return null;
  };

  const renderAddFundsToStakingRewardsVault = (
    <div className={`well ${isBusy ? 'disabled' : ''}`}>
      <div className='flex-fixed-right'>
        <div className='left inner-label'>Enter APR Percent Goal</div>
        <div className='right'>&nbsp;</div>
      </div>
      <div className='flex-fixed-right'>
        <div className='left'>
          <input
            className='general-text-input'
            inputMode='decimal'
            autoComplete='off'
            autoCorrect='off'
            type='text'
            onChange={e => handleAmountChange(e.target.value)}
            pattern='^[0-9]*[.,]?[0-9]*$'
            placeholder='0.01'
            minLength={1}
            maxLength={5}
            min={0.01}
            max={100}
            spellCheck='false'
            value={aprPercentGoal}
          />
        </div>
        <div className='right'>&nbsp;</div>
      </div>
      {renderPercentGoalValidationErrors()}
    </div>
  );

  const renderTotalMeanAdded = (
    <div className='well disabled'>
      <div className='flex-fixed-right'>
        <div className='left inner-label'>Total MEAN to be added</div>
        <div className='right'>&nbsp;</div>
      </div>
      <div className='flex-fixed-right'>
        <div className='left static-data-field'>{formatThousands(getTotalMeanAdded(), meanToken?.decimals || 9)}</div>
        <div className='right'>&nbsp;</div>
      </div>
      <span className='form-field-hint'>
        User MEAN balance: {meanBalance ? formatThousands(meanBalance, meanToken?.decimals || 6) : '0'}
      </span>
    </div>
  );

  if (!publicKey || !userHasAccess) {
    return (
      <>
        <div className='container main-container'>
          <div className='interaction-area'>
            <div className='title-and-subtitle w-75 h-100'>
              <div className='title'>
                <IconStats className='mean-svg-icons' />
                <div>{t('staking.title')}</div>
              </div>
              <div className='subtitle text-center'>Staking Rewards &amp; History</div>
              <div className='w-50 h-100 p-5 text-center flex-column flex-center'>
                <div className='text-center mb-2'>
                  <WarningFilled style={{ fontSize: 48 }} className='icon fg-warning' />
                </div>
                {!publicKey ? (
                  <h3>Please connect your wallet to setup rewards</h3>
                ) : (
                  <h3>
                    The content you are accessing is not available at this time or you don't have access permission
                  </h3>
                )}
              </div>
            </div>
          </div>
        </div>
        <PreFooter />
      </>
    );
  }

  return (
    <>
      <div className='container main-container'>
        <div className='interaction-area'>
          <div className='title-and-subtitle'>
            <div className='title'>
              <IconStats className='mean-svg-icons' />
              <div>{t('staking.title')}</div>
            </div>
            <div className='subtitle text-center'>Staking Rewards &amp; History</div>
          </div>
          <div className='place-transaction-box mb-3'>
            {renderStakingRewardsVaultBalance}
            {renderAddFundsToStakingRewardsVault}
            {renderTotalMeanAdded}
            <Button
              className='main-cta'
              block
              type='primary'
              shape='round'
              size='large'
              disabled={!isValidInput() || isBusy || !canDepositRewards}
              onClick={onStartDepositTx}
            >
              {isBusy ? 'Funding Vault' : 'Fund Vault'}
            </Button>
          </div>
          <div className='title-and-subtitle'>
            <div className='subtitle text-center'>Deposit history</div>
          </div>
          <div className='mb-3'>{renderDepositHistory}</div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};
