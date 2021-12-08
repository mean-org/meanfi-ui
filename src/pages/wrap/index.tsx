import React from 'react';
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { Button, Col, Modal, Row, Spin } from "antd";
import { getTokenAmountAndSymbolByTokenAddress, getTxIxResume, isValidNumber } from "../../utils/utils";
import { AppStateContext } from "../../contexts/appstate";
import { TransactionStatus } from "../../models/enums";
import { calculateActionFees, wrapSol } from '@mean-dao/money-streaming/lib/utils';
import { MSP_ACTIONS, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import {
  CheckOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs, getTxFeeAmount, getTxPercentFeeAmount } from "../../utils/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from "react-i18next";
import { PreFooter } from "../../components/PreFooter";
import { Identicon } from "../../components/Identicon";
import { useNativeAccount } from "../../contexts/accounts";
import { customLogger } from '../..';
import { TokenDisplay } from '../../components/TokenDisplay';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const WrapView = () => {
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const {
    tokenList,
    selectedToken,
    transactionStatus,
    setSelectedToken,
    refreshTokenBalance,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const { t } = useTranslation("common");
  const [isBusy, setIsBusy] = useState(false);
  const [wrapAmount, setWrapAmount] = useState<string>("");
  const [wrapFees, setWrapFees] = useState<TransactionFees>({
    blockchainFee: 0,
    mspFlatFee: 0,
    mspPercentFee: 0,
  });

  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

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

  // Transaction execution modal
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const hideTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);

  useEffect(() => {
    if (tokenList && selectedToken) {
      const myToken = tokenList.filter(
        (t) => t.address === WRAPPED_SOL_MINT_ADDRESS
      )[0];
      if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
        refreshTokenBalance();
      } else {
        setSelectedToken(myToken as TokenInfo);
      }
    }
  }, [tokenList, selectedToken, setSelectedToken, refreshTokenBalance]);

  // Get fees
  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.wrap);
    };
    if (!wrapFees.blockchainFee) {
      getTransactionFees().then((values) => {
        setWrapFees(values);
        consoleOut("wrapFees:", values);
      });
    }
  }, [connection, wrapFees]);

  const getMaxPossibleAmount = () => {
    const fee = wrapFees.blockchainFee + getTxPercentFeeAmount(wrapFees, nativeBalance);
    return nativeBalance - fee;
  }

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: string;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        const amount = parseFloat(wrapAmount as string);

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: `wrapAmount: ${amount}`
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        const myFees = getTxFeeAmount(wrapFees, amount);
        if (nativeBalance < wrapFees.blockchainFee + myFees) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: ''
          });
          customLogger.logError('Wrap transaction failed', { transcript: transactionLog });
          return false;
        }

        return await wrapSol(
          connection, // connection
          publicKey as PublicKey, // from
          amount // amount
        )
        .then((value) => {
          consoleOut("wrapSol returned transaction:", value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch((error) => {
          console.error("wrapSol transaction init error:", error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Wrap transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Wrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut("Signing transaction...");
        return await wallet
          .signTransaction(transaction)
          .then((signed: Transaction) => {
            consoleOut("signTransaction returned a signed transaction:", signed);
            signedTransaction = signed;
            // Try signature verification by serializing the transaction
            try {
              encodedTx = signedTransaction.serialize().toString('base64');
              consoleOut('encodedTx:', encodedTx, 'orange');
            } catch (error) {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SignTransaction,
                currentOperation: TransactionStatus.SignTransactionFailure
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
              });
              customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
              return false;
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
              result: {signer: wallet.publicKey.toBase58()}
            });
            return true;
          })
          .catch(error => {
            console.error("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logWarning('Wrap transaction failed', { transcript: transactionLog });
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
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Wrap transaction failed', { transcript: transactionLog });
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
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
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
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Wrap transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Wrap transaction failed', { transcript: transactionLog });
        return false;
      }
    };

    const confirmTx = async (): Promise<boolean> => {
      return await connection
        .confirmTransaction(signature, "confirmed")
        .then((result) => {
          consoleOut("confirmTransaction result:", result);
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionFinished),
            result: ''
          });
          return true;
        })
        .catch(() => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
            result: signature
          });
          customLogger.logError('Wrap transaction failed', { transcript: transactionLog });
          return false;
        });
    };

    if (wallet) {
      showTransactionModal();
      const create = await createTx();
      consoleOut("created:", create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut("signed:", sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut("sent:", sent);
          setWrapAmount("");
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            consoleOut("confirmed:", confirmed);
            if (confirmed) {
              // Report success
              customLogger.logInfo('Wrap transaction successful', { transcript: transactionLog });
              setIsBusy(false);
            } else {
              setIsBusy(false);
            }
          } else {
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

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setWrapAmount("");
      hideTransactionModal();
    }
    resetTransactionStatus();
  };

  const setValue = (value: string) => {
    setWrapAmount(value);
  };

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (newValue === '.') {
      setValue(".");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
    }
  };

  // Validation

  const isValidInput = (): boolean => {
    return wrapAmount &&
      parseFloat(wrapAmount) > 0 &&
      parseFloat(wrapAmount) > (wrapFees.blockchainFee + getTxPercentFeeAmount(wrapFees, wrapAmount)) &&
      parseFloat(wrapAmount) <= getMaxPossibleAmount()
      ? true
      : false;
  };

  const resetTransactionStatus = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const isSuccess = (): boolean => {
    return (
      transactionStatus.currentOperation === TransactionStatus.TransactionFinished
    );
  };

  const isError = (): boolean => {
    return transactionStatus.currentOperation ===
      TransactionStatus.TransactionStartFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.InitTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.SignTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.SendTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.ConfirmTransactionFailure
      ? true
      : false;
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="text-right pr-1">
          {caption}
        </Col>
        <Col span={12} className="text-left pl-1 fg-secondary-70">
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          {publicKey ? (
            <div className="place-transaction-box mt-4 mb-3">
              <div className="transaction-field mb-3">
                <div className="transaction-field-row">
                  <span className="field-label-left">&nbsp;</span>
                  <span className="field-label-right">
                    <span>{t("faucet.current-sol-balance")}:</span>
                    <span className="balance-amount">
                      {`${nativeBalance
                          ? getTokenAmountAndSymbolByTokenAddress(
                              nativeBalance,
                              WRAPPED_SOL_MINT_ADDRESS,
                              true
                            )
                          : "0"
                      }`}
                    </span>
                  </span>
                </div>

                <div className="transaction-field-row main-row">
                  <span className="input-left">
                    <input
                      id="wrap-amount-field"
                      className="general-text-input"
                      inputMode="decimal"
                      autoComplete="off"
                      autoCorrect="off"
                      type="number"
                      onChange={handleAmountChange}
                      pattern="^[0-9]*[.,]?[0-9]*$"
                      placeholder="0.0"
                      minLength={1}
                      maxLength={79}
                      spellCheck="false"
                      value={wrapAmount}
                    />
                  </span>
                  <div className="addon-right">
                    <div className="token-group">
                      {getMaxPossibleAmount() > 0 && (
                        <div className="token-max simplelink"
                          onClick={() => {
                            setValue(
                              getTokenAmountAndSymbolByTokenAddress(
                                getMaxPossibleAmount(),
                                WRAPPED_SOL_MINT_ADDRESS,
                                true,
                              )
                            );
                          }}>
                          MAX
                        </div>
                      )}
                      {selectedToken && (
                        <TokenDisplay onClick={() => {}}
                          mintAddress={selectedToken.address}
                          name={selectedToken.name}
                          showName={false}
                          showCaretDown={false}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="transaction-field-row">
                  <span className="field-label-left">
                    {nativeBalance <= (wrapFees.blockchainFee + getTxPercentFeeAmount(wrapFees)) ? (
                      <span className="fg-red">
                        {t("transactions.validation.amount-low")}
                      </span>
                    ) : parseFloat(wrapAmount) > getMaxPossibleAmount() ? (
                      <span className="fg-red">
                        {t("transactions.validation.amount-sol-high")}
                      </span>
                    ) : parseFloat(wrapAmount) <= (wrapFees.blockchainFee + getTxPercentFeeAmount(wrapFees, wrapAmount)) ? (
                      <span className="fg-red">
                        {t("transactions.validation.amount-lt-fee")}
                      </span>
                    ) : (
                      <span>&nbsp;</span>
                    )}
                  </span>
                  <span className="field-label-right">&nbsp;</span>
                </div>
              </div>
              <div className="p-2 mb-2">
                {infoRow(
                  t("faucet.wrap-transaction-fee") + ":",
                  `${
                    wrapFees
                      ? "~" +
                        getTokenAmountAndSymbolByTokenAddress(
                          wrapFees.blockchainFee,
                          WRAPPED_SOL_MINT_ADDRESS,
                          true
                        ) + ' SOL'
                      : "0"
                  }`
                )}
                {isValidInput() &&
                  infoRow(
                    t("faucet.wrapped-amount") + ":",
                    `${
                      wrapFees
                        ? "~" +
                          getTokenAmountAndSymbolByTokenAddress(
                            parseFloat(wrapAmount) >=
                              (wrapFees.blockchainFee as number)
                              ? parseFloat(wrapAmount)
                              : 0,
                            WRAPPED_SOL_MINT_ADDRESS,
                            false
                          )
                        : "0"
                    }`
                  )}
              </div>
              <Button
                className="main-cta"
                block
                type="primary"
                shape="round"
                size="large"
                disabled={!isValidInput()}
                onClick={onTransactionStart}
              >
                {t("faucet.wrap-sol-cta")}
              </Button>
              {/* Transaction execution modal */}
              <Modal
                className="mean-modal"
                maskClosable={false}
                visible={isTransactionModalVisible}
                title={getTransactionModalTitle(transactionStatus, isBusy, t)}
                onCancel={hideTransactionModal}
                afterClose={onAfterTransactionModalClosed}
                width={330}
                footer={null}>
                <div className="transaction-progress">
                  {isBusy ? (
                    <>
                      <Spin indicator={bigLoadingIcon} className="icon" />
                      <h4 className="font-bold mb-1 text-uppercase">
                        {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                      </h4>
                      <p className="operation">
                        {t("transactions.status.tx-wrap-operation")}{" "}
                        {wrapAmount} SOL ...
                      </p>
                      {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                        <div className="indication">{t('transactions.status.instructions')}</div>
                      )}
                    </>
                  ) : isSuccess() ? (
                    <>
                      <CheckOutlined
                        style={{ fontSize: 48 }}
                        className="icon"
                      />
                      <h4 className="font-bold mb-1 text-uppercase">
                        {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                      </h4>
                      <p className="operation">
                        {t("transactions.status.tx-wrap-operation-success")}.
                      </p>
                      <Button
                        block
                        type="primary"
                        shape="round"
                        size="middle"
                        onClick={hideTransactionModal}
                      >
                        {t("general.cta-close")}
                      </Button>
                    </>
                  ) : isError() ? (
                    <>
                      <WarningOutlined
                        style={{ fontSize: 48 }}
                        className="icon"
                      />
                      {transactionStatus.currentOperation ===
                      TransactionStatus.TransactionStartFailure ? (
                        <h4 className="mb-4">
                          {t("transactions.status.tx-start-failure", {
                            accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                              nativeBalance,
                              WRAPPED_SOL_MINT_ADDRESS,
                              true
                            )} SOL`,
                            feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                              wrapFees.blockchainFee + getTxFeeAmount(wrapFees, wrapAmount) - nativeBalance,
                              WRAPPED_SOL_MINT_ADDRESS,
                              true
                            )} SOL`,
                          })}
                        </h4>
                      ) : (
                        <h4 className="font-bold mb-1 text-uppercase">
                          {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                        </h4>
                      )}
                      <Button
                        block
                        type="primary"
                        shape="round"
                        size="middle"
                        onClick={hideTransactionModal}>
                        {t("general.cta-close")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Spin indicator={bigLoadingIcon} className="icon" />
                      <h4 className="font-bold mb-4 text-uppercase">
                        {t("transactions.status.tx-wait")}...
                      </h4>
                    </>
                  )}
                </div>
              </Modal>
            </div>
          ) : (
            <p>{t("general.not-connected")}.</p>
          )}
        </div>
      </div>
      <PreFooter />
    </>
  );
};
