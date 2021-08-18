import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import {
  Commitment,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { Button, Col, Modal, Row, Spin } from "antd";
import { environment } from "../../environments/environment";
import {
  getComputedFees,
  getTokenAmountAndSymbolByTokenAddress,
  isValidNumber,
} from "../../utils/utils";
import { useNativeAccount } from "../../contexts/accounts";
import { AppStateContext } from "../../contexts/appstate";
import { TransactionStatus } from "../../models/enums";
import { calculateActionFees, wrapSol } from "money-streaming/lib/utils";
import {
  CheckOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { getTransactionOperationDescription } from "../../utils/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { useTranslation } from "react-i18next";
import { PreFooter } from "../../components/PreFooter";
import { Identicon } from "../../components/Identicon";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const WrapView = () => {
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const { account } = useNativeAccount();
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

    return () => {};
  }, [tokenList, selectedToken, setSelectedToken, refreshTokenBalance]);

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.wrapSol);
    };
    if (!wrapFees.blockchainFee) {
      getTransactionFees().then((values) => {
        setWrapFees(values);
        console.log("wrapFees:", values);
      });
    }
  }, [connection, wrapFees]);

  const getAccountBalance = (): number => {
    return (account?.lamports || 0) / LAMPORTS_PER_SOL;
  };

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signature: string;

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        const amount = parseFloat(wrapAmount as string);
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        if (getAccountBalance() < getComputedFees(wrapFees)) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          return false;
        }

        return await wrapSol(
          connection, // connection
          publicKey as PublicKey, // from
          amount // amount
        )
          .then((value) => {
            console.log("wrapSol returned transaction:", value);
            // Stage 1 completed - The transaction is created and returned
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transaction = value;
            return true;
          })
          .catch((error) => {
            console.log("wrapSol transaction init error:", error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            return false;
          });
      }
      return false;
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log("Signing transaction...");
        return await wallet
          .signTransaction(transaction)
          .then((signed) => {
            console.log(
              "signTransactions returned a signed transaction array:",
              signed
            );
            // Stage 2 completed - The transaction was signed
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransactionSuccess,
              currentOperation: TransactionStatus.SendTransaction,
            });
            return true;
          })
          .catch((error) => {
            console.log("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            return false;
          });
      } else {
        console.log("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure,
        });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendRawTransaction(transaction.serialize(), {
            preflightCommitment: connection.commitment as Commitment,
          })
          .then((sig) => {
            console.log("sendSignedTransactions returned a signature:", sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            return true;
          })
          .catch((error) => {
            console.log(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure,
        });
        return false;
      }
    };

    const confirmTx = async (): Promise<boolean> => {
      return await connection
        .confirmTransaction(signature, connection.commitment as Commitment)
        .then((result) => {
          console.log("confirmTransactions result:", result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished,
          });
          return true;
        })
        .catch((error) => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure,
          });
          return false;
        });
    };

    if (wallet) {
      showTransactionModal();
      const create = await createTx();
      console.log("initialized:", create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        console.log("signed:", sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          console.log("sent:", sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log("confirmed:", confirmed);
            if (confirmed) {
              // Save signature to the state
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
  };

  const setValue = (value: string) => {
    setWrapAmount(value);
  };

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
    }
  };

  // Validation

  const isValidInput = (): boolean => {
    return wrapAmount &&
      parseFloat(wrapAmount) > (wrapFees?.blockchainFee || 0) &&
      parseFloat(wrapAmount) <=
        getAccountBalance() - (wrapFees?.blockchainFee || 0)
      ? true
      : false;
  };

  const getTransactionModalTitle = () => {
    let title: any;
    if (isBusy) {
      title = t("transactions.status.modal-title-executing-transaction");
    } else {
      if (
        transactionStatus.lastOperation === TransactionStatus.Iddle &&
        transactionStatus.currentOperation === TransactionStatus.Iddle
      ) {
        title = null;
      } else if (
        transactionStatus.lastOperation ===
        TransactionStatus.TransactionFinished
      ) {
        title = t("transactions.status.modal-title-transaction-completed");
      } else {
        title = null;
      }
    }
    return title;
  };

  const isSuccess = (): boolean => {
    return (
      transactionStatus.currentOperation ===
      TransactionStatus.TransactionFinished
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
            <div className="place-transaction-box mt-4">
              <div className="transaction-field mb-3">
                <div className="transaction-field-row">
                  <span className="field-label-left">&nbsp;</span>
                  <span className="field-label-right">
                    <span>{t("faucet.current-sol-balance")}:</span>
                    <span className="balance-amount">
                      {`${
                        selectedToken && getAccountBalance()
                          ? getTokenAmountAndSymbolByTokenAddress(
                              getAccountBalance(),
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
                      {selectedToken && (
                        <div className="token-max simplelink"
                          onClick={() => {
                            setValue(
                              getTokenAmountAndSymbolByTokenAddress(
                                getAccountBalance() - wrapFees.blockchainFee,
                                WRAPPED_SOL_MINT_ADDRESS,
                                true,
                                true
                              )
                            );
                          }}
                        >
                          MAX
                        </div>
                      )}
                      {selectedToken && (
                        <div className="token-selector p-0">
                          <div className="token-icon">
                            {selectedToken.logoURI ? (
                              <img
                                alt={`${selectedToken.name}`}
                                width={20}
                                height={20}
                                src={selectedToken.logoURI}
                              />
                            ) : (
                              <Identicon
                                address={selectedToken.address}
                                style={{ width: "24", display: "inline-flex" }}
                              />
                            )}
                          </div>
                          <div className="token-symbol">
                            SOL
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="transaction-field-row">
                  <span className="field-label-left">
                    {parseFloat(wrapAmount) >
                    getAccountBalance() - (wrapFees?.blockchainFee || 0) ? (
                      <span className="fg-red">
                        {t("transactions.validation.amount-sol-high")}
                      </span>
                    ) : parseFloat(wrapAmount) <=
                      (wrapFees?.blockchainFee || 0) ? (
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
                {environment === "local" && (
                  <>
                    <p className="localdev-label">
                      network fee:{" "}
                      {getTokenAmountAndSymbolByTokenAddress(
                        wrapFees.blockchainFee,
                        WRAPPED_SOL_MINT_ADDRESS
                      )}
                    </p>
                    <p className="localdev-label">
                      balance - fee:{" "}
                      {getTokenAmountAndSymbolByTokenAddress(
                        getAccountBalance() - wrapFees.blockchainFee,
                        WRAPPED_SOL_MINT_ADDRESS
                      )}
                    </p>
                  </>
                )}
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
                              ? parseFloat(wrapAmount) - wrapFees.blockchainFee
                              : 0,
                            WRAPPED_SOL_MINT_ADDRESS
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
                title={getTransactionModalTitle()}
                onCancel={hideTransactionModal}
                afterClose={onAfterTransactionModalClosed}
                width={280}
                footer={null}
              >
                <div className="transaction-progress">
                  {isBusy ? (
                    <>
                      <Spin indicator={bigLoadingIcon} className="icon" />
                      <h4 className="font-bold mb-1 text-uppercase">
                        {getTransactionOperationDescription(transactionStatus, t)}
                      </h4>
                      <p className="operation">
                        {t("transactions.status.tx-wrap-operation")}{" "}
                        {wrapAmount} SOL ...
                      </p>
                      <div className="indication">
                        {t("transactions.status.instructions")}
                      </div>
                    </>
                  ) : isSuccess() ? (
                    <>
                      <CheckOutlined
                        style={{ fontSize: 48 }}
                        className="icon"
                      />
                      <h4 className="font-bold mb-1 text-uppercase">
                        {getTransactionOperationDescription(transactionStatus, t)}
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
                        {t("transactions.status.cta-close")}
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
                              getAccountBalance(),
                              WRAPPED_SOL_MINT_ADDRESS,
                              true
                            )} SOL`,
                            feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                              getComputedFees(wrapFees),
                              WRAPPED_SOL_MINT_ADDRESS,
                              true
                            )} SOL`,
                          })}
                        </h4>
                      ) : (
                        <h4 className="font-bold mb-1 text-uppercase">
                          {getTransactionOperationDescription(
                            transactionStatus, t
                          )}
                        </h4>
                      )}
                      <Button
                        block
                        type="primary"
                        shape="round"
                        size="middle"
                        onClick={hideTransactionModal}
                      >
                        {t("transactions.status.cta-dismiss")}
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
