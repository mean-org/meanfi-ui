import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { MSP_ACTIONS, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { useNativeAccount, useUserAccounts } from '../../contexts/accounts';
import { NO_FEES, WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { Keypair, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { consoleOut, getTransactionStatusForLogs, isProd, percentage } from '../../utils/ui';
import { EventType, OperationType, TransactionStatus } from '../../models/enums';
import { customLogger } from '../..';
import { cutNumber, formatThousands, getTxIxResume, isValidNumber, toUiAmount } from '../../utils/utils';
import { LoadingOutlined } from '@ant-design/icons';
import BN from 'bn.js';
import { openNotification } from '../Notifications';
import { unwrapSol } from '@mean-dao/hybrid-liquidity-ag';
import { AccountTokenParsedInfo } from '../../models/token';
import { TokenInfo } from '@solana/spl-token-registry';

export const AccountsInitAtaModal = (props: {
  handleOk: any;
  handleClose: any;
  isVisible: boolean;
  ownedTokenAccounts: AccountTokenParsedInfo[] | undefined;
}) => {
  const { isVisible, handleClose, handleOk, ownedTokenAccounts } = props;
  const { t } = useTranslation("common");
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const {
    tokenList,
    splTokenList,
    transactionStatus,
    setTransactionStatus,
    refreshTokenBalance,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const [isUnwrapping, setIsUnwrapping] = useState(false);
  const [unwrapAmount, setUnwrapAmount] = useState<string>("");

  const { account } = useNativeAccount();
  const { tokenAccounts } = useUserAccounts();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [wSolBalance, setWsolBalance] = useState(0);

  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);

  // Callback methods

  // Effects

  // Build the token list when the modal becomes visible
  useEffect(() => {
    if (isVisible && ownedTokenAccounts) {
      const finalList = new Array<TokenInfo>();

      // Make a copy of the MeanFi favorite tokens
      const meanTokensCopy = JSON.parse(JSON.stringify(tokenList)) as TokenInfo[];

      // Add all other items but excluding those in meanTokensCopy (only in mainnet)
      if (isProd()) {
        splTokenList.forEach(item => {
          if (!meanTokensCopy.includes(item)) {
            meanTokensCopy.push(item);
          }
        });
      }

      // Build a token list excluding already owned token accounts
      meanTokensCopy.forEach(item => {
        if (!ownedTokenAccounts.some(t => t.parsedInfo.mint === item.address)) {
          finalList.push(item);
        }
      });

      consoleOut('finalList:', finalList, 'blue');
    }
  }, [isVisible, ownedTokenAccounts, splTokenList, tokenList]);

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account, 
    nativeBalance, 
    previousBalance, 
    refreshTokenBalance
  ]);

  // Events and actions

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const isSuccess = useCallback(() => {

    return (
      transactionStatus.currentOperation === TransactionStatus.TransactionFinished
    );

  },[
    transactionStatus.currentOperation
  ]);

  const onTransactionFinished = useCallback(() => {
    if (isSuccess()) {
      setUnwrapAmount("");
    }
    resetTransactionStatus();
    handleOk();
  }, [handleOk, isSuccess, resetTransactionStatus]);

  /*
  const onStartUnwrapTx = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const amount = parseFloat(unwrapAmount)
        consoleOut("unwrapAmount:", amount, "blue");

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart
          ),
          inputs: `unwrapAmount: ${amount}`,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction
          ),
          result: "",
        });

        return await unwrapSol(
          connection, // connection
          wallet, // wallet
          Keypair.generate(),
          amount // amount
        )
          .then((value) => {
            consoleOut("unwrapSol returned transaction:", value);
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
            console.error("unwrapSol transaction init error:", error);
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
            customLogger.logError("Unwrap transaction failed", {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot start transaction! Wallet not found!",
        });
        customLogger.logError("Unwrap transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
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
                  signer: `${wallet.publicKey.toBase58()}`,
                  error: `${error}`,
                },
              });
              customLogger.logError("Unwrap transaction failed", {
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
              result: { signer: wallet.publicKey.toBase58() },
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
                signer: `${wallet.publicKey.toBase58()}`,
                error: `${error}`,
              },
            });
            customLogger.logError("Unwrap transaction failed", {
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
        customLogger.logError("Unwrap transaction failed", {
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
            customLogger.logError("Unwrap transaction failed", {
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
        customLogger.logError("Unwrap transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && wSol) {
      setIsUnwrapping(true);
      const create = await createTx();
      consoleOut("created:", create);
      if (create) {
        const sign = await signTx();
        consoleOut("signed:", sign);
        if (sign) {
          const sent = await sendTx();
          consoleOut("sent:", sent);
          if (sent) {
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.Unwrap,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Unwrap ${formatThousands(
                parseFloat(unwrapAmount),
                wSol.decimals
              )} ${wSol.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully unwrapped ${formatThousands(
                parseFloat(unwrapAmount),
                wSol.decimals
              )} ${wSol.symbol}`,
            });
            onTransactionFinished();
          } else {
            openNotification({
              title: t("notifications.error-title"),
              description: t("notifications.error-sending-transaction"),
              type: "error",
            });
            setIsUnwrapping(false);
          }
        } else {
          setIsUnwrapping(false);
        }
      } else {
        setIsUnwrapping(false);
      }
    }
  };
  */

  // Validation

  const isUnwrapValid = (): boolean => {
    return unwrapAmount &&
      nativeBalance &&
      nativeBalance > (feeAmount || 0.005) &&
      parseFloat(unwrapAmount) > 0 &&
      parseFloat(unwrapAmount) <= wSolBalance
      ? true
      : false;
  };

  const getCtaLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
        ? t('transactions.validation.amount-sol-low')
        : nativeBalance < (feeAmount || 0.005)
          ? t('transactions.validation.amount-sol-low')
          : !unwrapAmount || parseFloat(unwrapAmount) === 0
            ? t('transactions.validation.no-amount')
            : parseFloat(unwrapAmount) > wSolBalance
              ? t('transactions.validation.invalid-amount')
              : 'Unwrap SOL';
  }

  return (
    <Modal
      className="mean-modal unpadded-content simple-modal"
      title={<div className="modal-title">Unwrap SOL</div>}
      footer={null}
      visible={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={400}>

      <div className="px-4 pb-3">

        {/* Asset picker */}
        <div className={`well ${isUnwrapping ? 'disabled' : ''}`}>
          <div className="flex-fixed-right">
            <div className="left">&nbsp;</div>
            <div className="right">&nbsp;</div>
          </div>
        </div>

        <Button
          className={`main-cta ${isUnwrapping ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          disabled={!isUnwrapValid() || isUnwrapping}
          onClick={() => {}}>
          {isUnwrapping && (
              <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {isUnwrapping
            ? 'Unwrapping SOL'
            : getCtaLabel()
          }
        </Button>

      </div>

    </Modal>
  );
};
