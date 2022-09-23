import { LoadingOutlined } from '@ant-design/icons';
import { TransactionFees } from '@mean-dao/msp';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Button, Checkbox, Modal } from "antd";
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import { customLogger } from '../..';
import { WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { useNativeAccount } from '../../contexts/accounts';
import { AppStateContext } from '../../contexts/appstate';
import { useConnection } from '../../contexts/connection';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { useWallet } from '../../contexts/wallet';
import { closeTokenAccount } from '../../middleware/accounts';
import { consoleOut, getTransactionStatusForLogs } from '../../middleware/ui';
import { getAmountFromLamports, getTxIxResume } from '../../middleware/utils';
import { OperationType, TransactionStatus } from '../../models/enums';
import { UserTokenAccount } from '../../models/transactions';
import { InputMean } from '../InputMean';
import { openNotification } from '../Notifications';
import { TokenListItem } from '../TokenListItem';

export const AccountsCloseAssetModal = (props: {
  connection: Connection;
  handleOk: any;
  handleClose: any;
  isVisible: boolean;
  asset: UserTokenAccount;
}) => {
  const { isVisible, handleClose, handleOk, asset } = props;
  const { t } = useTranslation("common");
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const [isBusy, setIsBusy] = useState(false);

  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [transactionFees] = useState<TransactionFees>({
    blockchainFee: 0.015,
    mspFlatFee: 0,
    mspPercentFee: 0
  });
  const [feeAmount] = useState<number>(transactionFees.blockchainFee + transactionFees.mspFlatFee);
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState<boolean>(false);
  const [enterYesWord, setEnterYesWord] = useState('');

  // Callbacks

  // Effects

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  // Events and actions

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsDisclaimerAccepted(e.target.checked);
  }

  const onYesInputValueChange = (e: any) => {
    setEnterYesWord(e.target.value);
  }

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const onTransactionFinished = useCallback(() => {
    resetTransactionStatus();
    handleOk();
  }, [handleOk, resetTransactionStatus]);

  const onStartTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    const createTx = async (): Promise<boolean> => {
      if (publicKey && asset && asset.publicAddress) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const data = {
          tokenPubkey: asset.publicAddress,
          owred: publicKey.toBase58(),
        };

        consoleOut('closeTokenAccount data:', data, 'blue');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.TransactionStart
          ),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.InitTransaction
          ),
          result: "",
        });

        return await closeTokenAccount(
          connection,                             // connection
          new PublicKey(asset.publicAddress),     // tokenPubkey
          publicKey                               // owner
        )
          .then((value: Transaction | null) => {
            if (!value) { return false; }
            consoleOut("closeTokenAccount returned transaction:", value);
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
            console.error("closeTokenAccount transaction init error:", error);
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
            customLogger.logError("Close Account transaction failed", {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: "Cannot start transaction! Wallet not found!",
        });
        customLogger.logError("Close Account transaction failed", {
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
              customLogger.logError("Close Account transaction failed", {
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
            customLogger.logError("Close Account transaction failed", {
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
        customLogger.logError("Close Account transaction failed", {
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
            customLogger.logError("Close Account transaction failed", {
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
        customLogger.logError("Close Account transaction failed", {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (publicKey && asset) {
      setIsBusy(true);
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
              operationType: OperationType.CloseTokenAccount,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Close Token Account for ${asset.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully closed account for ${asset.symbol}`,
            });
            onTransactionFinished();
          } else {
            openNotification({
              title: t("notifications.error-title"),
              description: t("notifications.error-sending-transaction"),
              type: "error",
            });
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  // Validation
  const isEnterYesWordValid = (): boolean => {
    return enterYesWord &&
           enterYesWord.toLocaleLowerCase() === "yes"
      ? true
      : false;
  }

  const isOperationValidIfWrapSol = (): boolean => {
    return publicKey &&
           nativeBalance &&
           nativeBalance > feeAmount &&
           asset &&
           isEnterYesWordValid() &&
           isDisclaimerAccepted
      ? true
      : false;
  };

  const isOperationValid = (): boolean => {
    return publicKey &&
           nativeBalance &&
           nativeBalance > feeAmount &&
           asset &&
           isDisclaimerAccepted
      ? true
      : false;
  };

  const getCtaLabelIfWrapSol = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
        ? t('transactions.validation.amount-sol-low')
        : nativeBalance < feeAmount
          ? t('transactions.validation.amount-sol-low')
          : !asset
            ? 'No token selected'
            : !isEnterYesWordValid()
              ? "Confirm account closure"
              : !isDisclaimerAccepted
                ? 'Accept disclaimer'
                : 'Close account';
  }

  const getCtaLabel = () => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : nativeBalance === 0
        ? t('transactions.validation.amount-sol-low')
        : nativeBalance < feeAmount
          ? t('transactions.validation.amount-sol-low')
          : !asset
            ? 'No token selected'
            : !isDisclaimerAccepted
              ? 'Accept disclaimer'
              : 'Close account';
  }

  // Rendering
  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">Close Token Account</div>}
      footer={null}
      open={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={370}>

      <div className="shift-up-1">

        <div className="mb-2 text-center">
          {asset.address === WRAPPED_SOL_MINT_ADDRESS && asset.balance ? (
            <p>Your Wrapped SOL token account has funds, therefore the balance will be unwrapped to Native SOL and the token account will be closed.</p>
          ) : asset.address !== WRAPPED_SOL_MINT_ADDRESS && asset.balance ? (
            <p>Your token account has funds, therefore it will be sent to the trash and the funds will be lost unless you transfer the funds to another account.</p>
          ) : (
            <p>Your token account is empty so it can be closed. Click Close account to remove the asset from your wallet.</p>
          )}
        </div>

        <div className="form-label">Token account to close</div>
        <div className="well-group token-list mb-3">
          <TokenListItem
            key={asset.address}
            name={asset.name}
            mintAddress={asset.address}
            token={asset}
            className="click-disabled"
            onClick={() => {
              // Nothing
            }}
            balance={asset.balance || 0}
          />
        </div>

        {(asset.balance && asset.balance > 0 && asset.name !== "Wrapped SOL") ? (
          <>
            <div className="mb-2 text-center">
              <p>Enter <strong>YES</strong> to confirm you wish to close the account and burn the remaining tokens. This can not be undone so be sure you wish to proceed.</p>
            </div>

            <InputMean
              id="confirm-close-account-input"
              maxLength={3}
              placeholder="Type YES to confirm"
              onChange={onYesInputValueChange}
              value={enterYesWord}
            />
          </>
        ) : null}

        <div className="mb-3">
          <Checkbox checked={isDisclaimerAccepted} onChange={onIsVerifiedRecipientChange}>I agree to remove this asset from my wallet</Checkbox>
        </div>

        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          disabled={((asset.balance && asset.balance > 0 && asset.name !== "Wrapped SOL") ? !isOperationValidIfWrapSol() : !isOperationValid()) || isBusy}
          onClick={onStartTransaction}>
          {isBusy && (
              <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {isBusy
            ? 'Closing account'
            : ((asset.balance && asset.balance > 0 && asset.name !== "Wrapped SOL") ? getCtaLabelIfWrapSol() : getCtaLabel())
          }
        </Button>

      </div>

    </Modal>
  );
};
