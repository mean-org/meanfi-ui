import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import './style.scss';
import { WarningFilled } from "@ant-design/icons";
import { useTranslation } from 'react-i18next';
import { PreFooter } from "../../components/PreFooter";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { findATokenAddress, formatThousands, getTxIxResume, isValidNumber } from "../../utils/utils";
import { IconStats } from "../../Icons";
import { consoleOut, getTransactionStatusForLogs, isProd, relativeTimeFromDates } from "../../utils/ui";
import { ConfirmOptions, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { confirmationEvents, TxConfirmationContext } from "../../contexts/transaction-status";
import { MEAN_TOKEN_LIST } from "../../constants/token-list";
import { TokenInfo } from "@solana/spl-token-registry";
import { appConfig, customLogger } from "../..";
import { Button, Spin } from "antd";
import { EventType, OperationType, TransactionStatus } from "../../models/enums";
import { DepositRecord, DepositsInfo, StakingClient } from "@mean-dao/staking";
import { openNotification } from "../../components/Notifications";

const DEFAULT_APR_PERCENT_GOAL = '21';

export const StakingRewardsView = () => {
  const {
    isWhitelisted,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { cluster, endpoint } = useConnectionConfig();
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const { t } = useTranslation('common');
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);
  const [isDepositing, setIsDepositing] = useState(false);
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

  // MEAN Staking Vault address
  const meanStakingVault = useMemo(() => {
    return appConfig.getConfig().meanStakingVault;
  }, []);

  const canDepositRewards = useMemo(() => {
    const acl = appConfig.getConfig().stakingRewardsAcl;
    if (publicKey && acl && acl.length > 0) {
      return acl.some(a => a === publicKey.toBase58());
    } else {
      return false;
    }
  }, [publicKey]);

  // Access rights
  const userHasAccess = useMemo(() => {

    if (!publicKey) { return false; }

    const isUserAllowed = () => {
      if (isWhitelisted) {
        return true;
      }

      return canDepositRewards;
    }

    return isUserAllowed();

  }, [canDepositRewards, isWhitelisted, publicKey]);

  // Create and cache Staking client instance
  const stakeClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    };

    return new StakingClient(
      cluster,
      endpoint,
      publicKey,
      opts,
      isProd() ? false : true
    )

  }, [
    cluster,
    endpoint,
    publicKey
  ]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const getTokenAccountBalanceByAddress = useCallback(async (tokenMintAddress: PublicKey | undefined | null): Promise<number> => {
    if (!connection || !tokenMintAddress) return 0;
    try {
      const tokenAmount = (await connection.getTokenAccountBalance(tokenMintAddress));
      if (tokenAmount) {
        const value = tokenAmount.value;
        return value.uiAmount || 0;
      }
    } catch (error) {
      consoleOut('Could not find account:', tokenMintAddress.toBase58(), 'red');
    }
    return 0;
  }, [connection]);

  const refreshMeanBalance = useCallback(async () => {

    if (!connection || !publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!meanToken) {
      setMeanBalance(balance);
      return;
    }

    const meanTokenPk = new PublicKey(meanToken.address);
    const meanTokenAddress = await findATokenAddress(publicKey, meanTokenPk);
    balance = await getTokenAccountBalanceByAddress(meanTokenAddress);
    setMeanBalance(balance);

  }, [
    accounts,
    meanToken,
    publicKey,
    connection,
    getTokenAccountBalanceByAddress
  ]);

  const refreshMeanStakingVaultBalance = useCallback(async () => {
    if (!connection || !meanStakingVault) return 0;
    let balance = 0;
    try {
      const tokenAccount = new PublicKey(meanStakingVault);
      const tokenAmount = (await connection.getTokenAccountBalance(tokenAccount));
      if (tokenAmount) {
        const value = tokenAmount.value;
        balance = value.uiAmount || 0;
      }
    } catch (error) {
      consoleOut('Could not find account:', meanStakingVault, 'red');
    }
    setMeanStakingVaultBalance(balance);
  }, [connection, meanStakingVault]);

  const getTotalMeanAdded = useCallback(() => {
    const apg = parseFloat(aprPercentGoal) || 0;
    const result = apg ? (meanStakingVaultBalance * (apg / 100)) / 365 : 0;
    return result;
  }, [aprPercentGoal, meanStakingVaultBalance]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [setTransactionStatus]);

  const onDepositTxConfirmed = useCallback((value: any) => {
    consoleOut("onDepositTxConfirmed event executed:", value, 'crimson');
    setIsDepositing(false);
    resetTransactionStatus();
    setTimeout(() => {
      refreshMeanStakingVaultBalance();
      setShouldRefreshDepositsInfo(true);
    }, 100);
    setLastDepositSignature('');
  }, [
    refreshMeanStakingVaultBalance,
    resetTransactionStatus,
  ]);

  /////////////////
  //   Effects   //
  /////////////////

  // Preset MEAN token
  useEffect(() => {
    if (!connection) { return; }

    if (!pageInitialized) {
      const tokenList = MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(cluster))
      const token = tokenList.find(t => t.symbol === 'MEAN');

      consoleOut('MEAN token', token, 'blue');
      setMeanToken(token)

    }
  }, [
    connection,
    pageInitialized,
    cluster
  ]);

  // Keep native account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balances
      refreshMeanStakingVaultBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshMeanStakingVaultBalance
  ]);

  // Keep MEAN balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (meanToken) {
      refreshMeanBalance();
    }

  }, [
    accounts,
    publicKey,
    meanToken,
    refreshMeanBalance,
  ]);

  // Refresh deposits info
  useEffect(() => {
    if (!connection || !shouldRefreshDepositsInfo) { return; }

    setTimeout(() => {
      setShouldRefreshDepositsInfo(false);
      setRefreshingDepositsInfo(true);
    });

    consoleOut('Refreshing deposits info...', '', 'blue');
    (async () => {
      await stakeClient.getDepositsInfo()
        .then(deposits => {
          consoleOut('deposits:', deposits, 'blue');
          setDepositsInfo(deposits);
        })
        .finally(() => setRefreshingDepositsInfo(false));
    })();

  }, [connection, shouldRefreshDepositsInfo, stakeClient]);

  // Setup event listeners
  useEffect(() => {
    if (pageInitialized && canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onDepositTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onDepositTxConfirmed', 'blue');
    }
  }, [
    canSubscribe,
    pageInitialized,
    onDepositTxConfirmed
  ]);

  // Set when a page is initialized
  useEffect(() => {
    if (!pageInitialized && meanToken) {
      setPageInitialized(true);
    }
  }, [
    meanToken,
    pageInitialized,
  ]);

  // Unsubscribe from events
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      confirmationEvents.off(EventType.TxConfirmSuccess, onDepositTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
      setCanSubscribe(true);
      setPageInitialized(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  ///////////////////
  // Event hanling //
  ///////////////////

  const onStartDepositTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    const createTx = async (): Promise<boolean> => {
      if (wallet && stakeClient && meanToken) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const depositPercentage = parseFloat(aprPercentGoal) / 100;
        consoleOut("depositPercentage:", depositPercentage, "blue");

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart
          ),
          inputs: `depositPercentage: ${depositPercentage}%`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction
          ),
          result: "",
        });

        return await stakeClient.depositTransaction(
          depositPercentage             // depositPercentage
        )
        .then((value) => {
          consoleOut("depositTransaction returned transaction:", value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionSuccess
            ),
            result: getTxIxResume(value),
          });
          transaction = value;
          return true;
        })
        .catch((error) => {
          console.error("depositTransaction init error:", error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionFailure
            ),
            result: `${error}`,
          });
          customLogger.logError("Deposit transaction failed", {
            transcript: transactionLog,
          });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot start transaction! Wallet not found!",
        });
        customLogger.logError("Deposit transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut("Signing transaction...");
        return await wallet
          .signTransaction(transaction)
          .then((signed: Transaction) => {
            consoleOut(
              "signTransaction returned a signed transaction:",
              signed
            );
            signedTransaction = signed;
            // Try signature verification by serializing the transaction
            try {
              encodedTx = signedTransaction.serialize().toString("base64");
              consoleOut("encodedTx:", encodedTx, "orange");
            } catch (error) {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransaction,
                currentOperation: TransactionStatus.SignTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SignTransactionFailure
                ),
                result: {
                  signer: `${publicKey.toBase58()}`,
                  error: `${error}`,
                },
              });
              customLogger.logError("Deposit transaction failed", {
                transcript: transactionLog,
              });
              return false;
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SignTransactionSuccess
              ),
              result: { signer: publicKey.toBase58() },
            });
            return true;
          })
          .catch((error) => {
            console.error("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SignTransactionFailure
              ),
              result: {
                signer: `${publicKey.toBase58()}`,
                error: `${error}`,
              },
            });
            customLogger.logError("Deposit transaction failed", {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        console.error("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot sign transaction! Wallet not found!",
        });
        customLogger.logError("Deposit transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then((sig) => {
            consoleOut("sendEncodedTransaction returned a signature:", sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch((error) => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure
              ),
              result: { error, encodedTx },
            });
            customLogger.logError("Deposit transaction failed", {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot send transaction! Wallet not found!",
        });
        customLogger.logError("Deposit transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && meanToken) {
      setIsDepositing(true);
      const create = await createTx();
      consoleOut("created:", create);
      if (create) {
        const sign = await signTx();
        consoleOut("signed:", sign);
        if (sign) {
          const sent = await sendTx();
          consoleOut("sent:", sent);
          if (sent) {
            setLastDepositSignature(signature);
            const depositionMessage = `Depositing ${formatThousands(
              getTotalMeanAdded(),
              meanToken.decimals
            )} ${meanToken.symbol} into the staking vault`;
            const depositSuccessMessage = `Successfully deposited ${formatThousands(
              getTotalMeanAdded(),
              meanToken.decimals
            )} ${meanToken.symbol} into the staking vault`;
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.Deposit,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: depositionMessage,
              completedTitle: "Transaction confirmed",
              completedMessage: depositSuccessMessage,
            });
            setAprPercentGoal(DEFAULT_APR_PERCENT_GOAL);
          } else {
            openNotification({
              title: t("notifications.error-title"),
              description: t("notifications.error-sending-transaction"),
              type: "error",
            });
            setIsDepositing(false);
          }
        } else {
          setIsDepositing(false);
        }
      } else {
        setIsDepositing(false);
      }
    }
  };

  const handleAmountChange = (e: any) => {
    let newValue = e.target.value;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (splitted[1]) {
      if (splitted[1].length > 2) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === "") {
      setAprPercentGoal('');
    } else if (newValue === '.') {
      setAprPercentGoal(".");
    } else if (isValidNumber(newValue)) {
      setAprPercentGoal(newValue);
    }
  };

  // Validation functions

  const isValidInput = (): boolean => {
    return  aprPercentGoal &&
            nativeBalance &&
            meanBalance &&
            parseFloat(aprPercentGoal) >= 0.01 &&
            parseFloat(aprPercentGoal) <= 100 &&
            meanBalance >= getTotalMeanAdded()
      ? true
      : false;
  };

  /////////////////
  //  Rendering  //
  /////////////////

  const getRelativeDate = (utcDate: string) => {
    const reference = new Date(utcDate);
    return relativeTimeFromDates(reference);
  }

  const renderDepositHistory = (
    <>
      <div className="container-max-width-720 my-3">
        <div className="item-list-header compact dark">
          <div className="header-row">
            <div className="std-table-cell responsive-cell px-2 text-left">Date</div>
            <div className="std-table-cell responsive-cell px-3 text-right border-left border-right">
              <span>Total Staked +<br/>Rewards before</span>
            </div>
            <div className="std-table-cell responsive-cell px-3 text-right border-right">
              <span>Deposited<br/>Percentage</span>
            </div>
            <div className="std-table-cell responsive-cell px-3 text-right">
              <span>Deposited<br/>Amount</span>
            </div>
          </div>
        </div>

        <div className="transaction-list-data-wrapper vertical-scroll">
          <Spin spinning={refreshingDepositsInfo}>
            <div className="activity-list h-100">
              <div className="item-list-body compact dark">
                {(depositsInfo &&
                  depositsInfo.depositRecords &&
                  depositsInfo.depositRecords.length > 0) &&
                  depositsInfo.depositRecords.map((item: DepositRecord, index: number) => (
                    <div key={`${index}`} className="item-list-row">
                      <div className="std-table-cell responsive-cell px-2 text-left"><span className="capitalize-first-letter">{getRelativeDate(item.depositedUtc)}</span></div>
                      <div className="std-table-cell responsive-cell px-3 text-right border-left border-right">{formatThousands(item.totalStakedPlusRewardsUiAmount)} MEAN</div>
                      <div className="std-table-cell responsive-cell px-3 text-right border-right">{item.depositedPercentage * 100}%</div>
                      <div className="std-table-cell responsive-cell px-3 text-right">{formatThousands(item.depositedUiAmount)} MEAN</div>
                    </div>
                  ))}
              </div>
            </div>
          </Spin>
        </div>
      </div>
    </>
  );

  const renderStakingRewardsVaultBalance = (
    <>
      <div className="well disabled">
        <div className="flex-fixed-right">
          <div className="left inner-label">Total MEAN in Vault</div>
          <div className="right">&nbsp;</div>
        </div>
        <div className="flex-fixed-right">
          <div className="left static-data-field">
            {
              formatThousands(meanStakingVaultBalance, meanToken?.decimals || 6)
            }
          </div>
          <div className="right">&nbsp;</div>
        </div>
      </div>
    </>
  );

  const renderAddFundsToStakingRewardsVault = (
    <>
      <div className={`well ${isDepositing ? 'disabled' : ''}`}>
        <div className="flex-fixed-right">
          <div className="left inner-label">Enter APR Percent Goal</div>
          <div className="right">&nbsp;</div>
        </div>
        <div className="flex-fixed-right">
          <div className="left">
            <input
              className="general-text-input"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              onChange={handleAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.01"
              minLength={1}
              maxLength={5}
              min={0.01}
              max={100}
              spellCheck="false"
              value={aprPercentGoal}
            />
          </div>
          <div className="right">&nbsp;</div>
        </div>
        {!aprPercentGoal || parseFloat(aprPercentGoal) < 0.01 || parseFloat(aprPercentGoal) > 100 ? (
          <span className="form-field-error">Valid values: from 0.01 to 100</span>
        ) : meanStakingVaultBalance && meanBalance !== undefined && meanBalance < getTotalMeanAdded() ? (
          <span className="form-field-error">Insufficient balance for APR Percent Goal</span>
        ) : (null)}
      </div>
    </>
  );

  const renderTotalMeanAdded = (
    <>
      <div className="well disabled">
        <div className="flex-fixed-right">
          <div className="left inner-label">Total MEAN to be added</div>
          <div className="right">&nbsp;</div>
        </div>
        <div className="flex-fixed-right">
          <div className="left static-data-field">
            {
              formatThousands(getTotalMeanAdded(), meanToken?.decimals || 6)
            }
          </div>
          <div className="right">&nbsp;</div>
        </div>
        <span className="form-field-hint">User MEAN balance: {meanBalance ? formatThousands(meanBalance, meanToken?.decimals || 6) : '0'}</span>
      </div>
    </>
  );

  if (!publicKey || !userHasAccess) {
    return (
      <>
        <div className="container main-container">
          <div className="interaction-area">
            <div className="title-and-subtitle w-75 h-100">
              <div className="title">
                <IconStats className="mean-svg-icons" />
                <div>{t('staking.title')}</div>
              </div>
              <div className="subtitle text-center">
                Staking Rewards &amp; History
              </div>
              <div className="w-50 h-100 p-5 text-center flex-column flex-center">
                <div className="text-center mb-2">
                  <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
                </div>
                {!publicKey ? (
                  <h3>Please connect your wallet to setup rewards</h3>
                ) : (
                  <h3>The content you are accessing is not available at this time or you don't have access permission</h3>
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
      {/* {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">isDepositing:</span><span className="ml-1 font-bold fg-dark-active">{isDepositing ? 'true' : 'false'}</span>
          <span className="ml-1">lastDepositSignature:</span><span className="ml-1 font-bold fg-dark-active">{lastDepositSignature || '-'}</span>
        </div>
      )} */}

      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>{t('staking.title')}</div>
            </div>
            <div className="subtitle text-center">
              Staking Rewards &amp; History
            </div>
          </div>
          <div className="place-transaction-box mb-3">
            {renderStakingRewardsVaultBalance}
            {renderAddFundsToStakingRewardsVault}
            {renderTotalMeanAdded}
            <Button
              className="main-cta"
              block
              type="primary"
              shape="round"
              size="large"
              disabled={!isValidInput() || isDepositing || !canDepositRewards}
              onClick={onStartDepositTx}>
              {isDepositing ? 'Funding Vault' : 'Fund Vault'}
            </Button>
          </div>
          <div className="title-and-subtitle">
            <div className="subtitle text-center">
              Deposit history
            </div>
          </div>
          <div className="mb-3">
            {renderDepositHistory}
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};
