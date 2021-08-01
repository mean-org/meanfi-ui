import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { Commitment, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { notify } from "../../utils/notifications";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { Button, Col, Divider, Modal, Row, Spin } from "antd";
import { environment } from "../../environments/environment";
import { formatNumber, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from "../../utils/utils";
import { useNativeAccount } from "../../contexts/accounts";
import { AppStateContext } from "../../contexts/appstate";
import { TransactionStatus } from "../../models/enums";
import { calculateActionFees, wrapSol } from "../../money-streaming/utils";
import { CheckOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { getTransactionOperationDescription } from "../../utils/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { MSP_ACTIONS, TransactionFees } from "../../money-streaming/types";
import { useTranslation } from "react-i18next";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const FaucetView = () => {
  const connection = useConnection();
  const { publicKey, wallet } = useWallet();
  const { account } = useNativeAccount();
  const {
    tokenList,
    tokenBalance,
    selectedToken,
    transactionStatus,
    setSelectedToken,
    refreshTokenBalance,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [isWrapEnabled, setIsWrapEnabled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [wrapAmount, setWrapAmount] = useState<string>('');
  const [wrapFees, setWrapFees] = useState<TransactionFees>();
  // Transaction execution modal
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const hideTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);

  useEffect(() => {

    if (tokenList && selectedToken) {
      const myToken = tokenList.filter(t => t.address === WRAPPED_SOL_MINT_ADDRESS)[0];
      if (selectedToken.address === WRAPPED_SOL_MINT_ADDRESS) {
        refreshTokenBalance();
      } else {
        setSelectedToken(myToken as TokenInfo);
      }
    }

    return () => {};
  }, [
    tokenList,
    selectedToken,
    setSelectedToken,
    refreshTokenBalance
  ]);

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.wrapSol);
    }
    if (!wrapFees) {
      getTransactionFees().then(values => {
        setWrapFees(values);
      });
    }
  }, [connection, wrapFees]);

  const getFaucetAmount = (): number => {
    if (environment === 'staging') {
      return 1 * LAMPORTS_PER_SOL;
    }
    return 4 * LAMPORTS_PER_SOL;
  }

  const getAccountBalance = (): number => {
    return (account?.lamports || 0) / LAMPORTS_PER_SOL;
  }

  const airdrop = useCallback(() => {
    if (!publicKey) {
      return;
    }

    if (environment === 'production') {
      notify({
        message: t('notifications.error-title'),
        description: t('notifications.error-cannot-faucet-mainnet-message'),
        type: "error"
      });
      return;
    }

    try {
      connection.requestAirdrop(publicKey, getFaucetAmount()).then(() => {
        notify({
          description: t('notifications.success-account-funded-message') + '.',
          type: "success"
        });
      });
    } catch (error) {
      console.log(error);
      notify({
        message: t('notifications.error-title'),
        description: t('notifications.error-cannot-fund-account-message'),
        type: "error"
      });
    }
  }, [publicKey, connection, t]);

  const disconnectedBlock = (
    <p>{t('faucet.not-connected')}.</p>
  );

  const connectedBlock = (
    <>
      <div className="deposit-input-title" style={{ margin: 10 }}>
        <p>{t('faucet.current-sol-balance')}: {formatNumber.format(getAccountBalance())} SOL</p>
        <p>{t('faucet.funding-amount')} {formatNumber.format(getFaucetAmount() / LAMPORTS_PER_SOL)} SOL</p>
      </div>
      <Button type="primary" shape="round" size="large" onClick={airdrop}>{t('faucet.fund-cta')}</Button>
    </>
  );

  const toggleWrapForm = () => {
    setIsWrapEnabled(!isWrapEnabled);
  }

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
          currentOperation: TransactionStatus.InitTransaction
        });
        return await wrapSol(
          connection,                                 // connection
          publicKey as PublicKey,                     // from
          amount,                                     // amount
        )
        .then(value => {
          console.log('wrapSol returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.log('wrapSol transaction init error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then(signed => {
          console.log('signTransactions returned a signed transaction array:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          return true;
        })
        .catch(error => {
          console.log('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          return false;
        });
      } else {
        console.log('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure
        });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection.sendRawTransaction(
            transaction.serialize(),
            { preflightCommitment: connection.commitment as Commitment }
          )
          .then(sig => {
            console.log('sendSignedTransactions returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            return true;
          })
          .catch(error => {
            console.log(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await connection.confirmTransaction(signature, connection.commitment as Commitment)
        .then(result => {
          console.log('confirmTransactions result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(error => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          return false;
        });
    }

    if (wallet) {
      showTransactionModal();
      const create = await createTx();
      console.log('initialized:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        console.log('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          console.log('sent:', sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log('confirmed:', confirmed);
            if (confirmed) {
              // Save signature to the state
              setIsBusy(false);
            } else { setIsBusy(false); }
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setWrapAmount('');
      setIsWrapEnabled(false);
      hideTransactionModal();
    }
  }


  const setValue = (value: string) => {
    setWrapAmount(value);
  }

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
            parseFloat(wrapAmount) <= (getAccountBalance() - (wrapFees?.blockchainFee || 0))
            ? true
            : false;
  }

  const getTransactionModalTitle = () => {
    let title: any;
    if (isBusy) {
      title = t('transactions.status.modal-title-executing-transaction');
    } else {
      if (transactionStatus.lastOperation === TransactionStatus.Iddle &&
          transactionStatus.currentOperation === TransactionStatus.Iddle) {
        title = null;
      } else if (transactionStatus.lastOperation === TransactionStatus.TransactionFinished) {
        title = t('transactions.status.modal-title-transaction-completed');
      } else {
        title = null;
      }
    }
    return title;
  }

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
           transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
           transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
           transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
           ? true
           : false;
  }

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="text-right pr-1">{caption}</Col>
        <Col span={12} className="text-left pl-1 fg-secondary-70">{value}</Col>
      </Row>
    );
  }

  return (
    <div className="container">
      <div className="interaction-area">
        {publicKey ? connectedBlock : disconnectedBlock}
        {publicKey && (
          <Divider plain></Divider>
        )}
        {/* tokenBalance */}
        {publicKey && (
          <p>{t('faucet.current-wsol-balance')}: {getTokenAmountAndSymbolByTokenAddress(tokenBalance, WRAPPED_SOL_MINT_ADDRESS)}</p>
        )}
        {publicKey && (
          <Button
            className="ant-btn-shaded"
            type="text"
            shape="round"
            size="large"
            onClick={() => toggleWrapForm()}>
            {t('faucet.wrap-sol-cta-toggle')}
          </Button>
        )}
        {publicKey && isWrapEnabled && (
          <div className="place-transaction-box mt-4">
            <div className="transaction-field mb-3">
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
              </div>
              <div className="transaction-field-row">
                <span className="field-label-left">{
                  parseFloat(wrapAmount) > (getAccountBalance() - (wrapFees?.blockchainFee || 0))
                    ? (<span className="fg-red">{t('transactions.validation.amount-sol-high')}</span>)
                    : parseFloat(wrapAmount) <= (wrapFees?.blockchainFee || 0)
                    ? (<span className="fg-red">{t('transactions.validation.amount-lt-fee')}</span>)
                    : (<span>&nbsp;</span>)
                }</span>
                <span className="field-label-right">&nbsp;</span>
              </div>
            </div>
            <div className="p-2 mb-2">
              {infoRow(
                t('faucet.wrap-transaction-fee') + ':',
                `${wrapFees
                  ? '~' + getTokenAmountAndSymbolByTokenAddress(wrapFees.blockchainFee, WRAPPED_SOL_MINT_ADDRESS)
                  : '0'
                }`
              )}
              {isValidInput() && infoRow(
                t('faucet.wrapped-amount') + ':',
                `${wrapFees
                  ? '~' + getTokenAmountAndSymbolByTokenAddress(
                      parseFloat(wrapAmount) >= (wrapFees.blockchainFee as number)
                      ? parseFloat(wrapAmount) - wrapFees.blockchainFee
                      : 0,
                      WRAPPED_SOL_MINT_ADDRESS)
                  : '0'
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
              onClick={onTransactionStart}>
              {t('faucet.wrap-sol-cta')}
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
              footer={null}>
              <div className="transaction-progress">
                {isBusy ? (
                  <>
                    <Spin indicator={bigLoadingIcon} className="icon" />
                    <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
                    <p className="operation">{t('transactions.status.tx-wrap-operation')} {wrapAmount} SOL ...</p>
                    <div className="indication">{t('transactions.status.instructions')}</div>
                  </>
                ) : isSuccess() ? (
                  <>
                    <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                    <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
                    <p className="operation">{t('transactions.status.tx-wrap-operation-success')}.</p>
                    <Button
                      block
                      type="primary"
                      shape="round"
                      size="middle"
                      onClick={hideTransactionModal}>
                      {t('transactions.status.cta-close')}
                    </Button>
                  </>
                ) : isError() ? (
                  <>
                    <WarningOutlined style={{ fontSize: 48 }} className="icon" />
                    <h4 className="font-bold mb-4 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
                    <Button
                      block
                      type="primary"
                      shape="round"
                      size="middle"
                      onClick={hideTransactionModal}>
                      {t('transactions.status.cta-dismiss')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Spin indicator={bigLoadingIcon} className="icon" />
                    <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
                  </>
                )}
              </div>
            </Modal>

          </div>
        )}
      </div>
    </div>
  );
};
