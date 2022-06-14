import { Button, Col, Dropdown, Menu, Row } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { customLogger } from "../..";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { MoneyStreamDetails } from "../../components/MoneyStreamDetails";
import { TreasuryTransferFundsModal } from "../../components/TreasuryTransferFundsModal";
import { AppStateContext } from "../../contexts/appstate";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { IconEllipsisVertical } from "../../Icons";
import { OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getFormattedNumberToLocale, getIntervalFromSeconds, getReadableDate, getShortDate, getTransactionStatusForLogs } from "../../utils/ui";
import {
  TransactionFees,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  calculateActionFees as calculateActionFeesV2,
  Treasury,
  Stream,
  STREAM_STATUS,
  MSP,
  TreasuryType,
  Constants as MSPV2Constants
} from '@mean-dao/msp';
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo, MultisigTransactionFees } from "@mean-dao/mean-multisig-sdk";
import { NO_FEES, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { formatAmount, getAmountWithSymbol, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toUiAmount } from "../../utils/utils";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { useTranslation } from "react-i18next";
import { TokenInfo } from "@solana/spl-token-registry";
import moment from "moment";
import BN from "bn.js";
import ArrowDownOutlined from "@ant-design/icons/lib/icons/ArrowDownOutlined";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";

export const MoneyStreamsIncomingView = (props: {
  // stream: Stream | StreamInfo | undefined;
  onSendFromIncomingStreamDetails?: any;
}) => {
  const {
    streamDetail,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    getTokenByMintAddress,
    setTransactionStatus,
    setStreamDetail,
  } = useContext(AppStateContext);
  const {
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const { onSendFromIncomingStreamDetails } = props;

  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const { t } = useTranslation('common');
  const { endpoint } = useConnectionConfig();

  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [treasuryDetails, setTreasuryDetails] = useState<any>(undefined);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>({
    multisigFee: 0,
    networkFee: 0,
    rentExempt: 0
  } as MultisigTransactionFees);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [needReloadMultisig, setNeedReloadMultisig] = useState(true);

  const hideDetailsHandler = () => {
    onSendFromIncomingStreamDetails();
  }

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed"
    );

  }, [
    connection,
    publicKey,
    connectionConfig.endpoint,
  ]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    endpoint,
    streamProgramAddress
  ]);
  

  // Create and cache Money Streaming Program V2 instance
  const msp = useMemo(() => {
    if (publicKey) {
      return new MSP(
        connectionConfig.endpoint,
        streamV2ProgramAddress,
        "confirmed"
      );
    }
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  // Transfer funds modal
  const [isTransferFundsModalVisible, setIsTransferFundsModalVisible] = useState(false);
  const showTransferFundsModal = useCallback(() => {
    setIsTransferFundsModalVisible(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.treasuryWithdraw).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    resetTransactionStatus();
  }, [getTransactionFeesV2, resetTransactionStatus]);

  const onAcceptTreasuryTransferFunds = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteTreasuryTransferFundsTx(params);
  };

  const onTreasuryFundsTransferred = () => {
    setIsTransferFundsModalVisible(false);
    onAfterEveryModalClose();
  };

    const isMultisigTreasury = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!treasurer.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }

    return false;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ]);

  const onExecuteTreasuryTransferFundsTx = async (data: any) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryCreate);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const treasuryWithdraw = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.treasuryWithdraw(
          new PublicKey(data.payer),              // payer
          new PublicKey(data.destination),        // treasurer
          new PublicKey(data.treasury),           // treasury
          data.amount,                            // amount
          true                                    // TODO: Define if the user can determine this
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = treasuryDetails as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const msTreasuryWithdraw = await msp.treasuryWithdraw(
        new PublicKey(data.payer),              // payer
        new PublicKey(data.destination),        // treasurer
        new PublicKey(data.treasury),           // treasury
        data.amount,                            // amount
        false
      );

      const ixData = Buffer.from(msTreasuryWithdraw.instructions[0].data);
      const ixAccounts = msTreasuryWithdraw.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Withdraw Treasury Funds",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryWithdraw,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async () => {

      if (!connection || !wallet || !publicKey) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      if (!treasuryDetails || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: 'Cannot start transaction! Treasury details or MSP client not found!'
        });
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      /**
       * payer: PublicKey,
       * destination: PublicKey,
       * treasury: PublicKey,
       * amount: number
       */

      const destinationPk = new PublicKey(data.destinationAccount);
      const treasuryPk = new PublicKey(treasuryDetails.id);
      const amount = data.tokenAmount;

      // Create a transaction
      const payload = {
        payer: publicKey.toBase58(),
        destination: destinationPk.toBase58(),
        treasury: treasuryPk.toBase58(),
        amount: amount.toNumber()
      };

      consoleOut('payload:', payload);
      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: payload
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Treasury Withdraw using MSP V2...', '', 'blue');

      const result = await treasuryWithdraw(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('treasuryWithdraw returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('treasuryWithdraw error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryWithdraw);
            setIsBusy(false);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            onTreasuryFundsTransferred();
            setNeedReloadMultisig(true);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const onAfterEveryModalClose = useCallback(() => {
    resetTransactionStatus();
  },[resetTransactionStatus]);

  const getStreamTitle = (item: Stream | StreamInfo): string => {
    let title = '';
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;

      if (v1.version < 2) {
        if (v1.streamName) {
          return `${v1.streamName}`;
        }
        
        if (v1.isUpdatePending) {
          title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        }
      } else {
        if (v2.name) {
          return `${v2.name}`;
        }

        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        }
      }
    }

    return title;
  }

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';
    if (item) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getStreamSubtitle = useCallback((item: Stream | StreamInfo) => {
    let subtitle = '';

    if (item) {
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
      }

      subtitle = rateAmount;
    }

    return subtitle;

  }, [getRateAmountDisplay, getDepositAmountDisplay, t]);

  const getStreamStatus = useCallback((item: Stream | StreamInfo) => {

    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATE.Paused:
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATUS.Paused:
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      }
    }

  }, [t]);

  const getStreamResume = useCallback((item: Stream | StreamInfo) => {
    let title = '';

    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;

      if (v1.version < 2) {
        if (v1.state === STREAM_STATE.Schedule) {
          title = `starts in ${getShortDate(v1.startUtc as string)}`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `out of funds on ${getShortDate(v1.startUtc as string)}`;
        } else {
          title = `streaming since ${getShortDate(v1.startUtc as string)}`;
        }
      } else {
        if (v2.status === STREAM_STATUS.Schedule) {
          title = `starts in ${getShortDate(v1.startUtc as string)}`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `out of funds on ${getShortDate(v1.startUtc as string)}`;
        } else {
          title = `streaming since ${getShortDate(v1.startUtc as string)}`;
        }
      }
    }

    return title;

  }, []);

  useEffect(() => {
    if (!ms || !msp || !streamDetail) {return;}

    const timeout = setTimeout(() => {
      if (msp && streamDetail && streamDetail.version >= 2) {
        msp.refreshStream(streamDetail as Stream).then(detail => {
          setStreamDetail(detail as Stream);
        });
      } else if (ms && streamDetail && streamDetail.version < 2) {
        ms.refreshStream(streamDetail as StreamInfo).then(detail => {
          setStreamDetail(detail as StreamInfo);
        });
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  }, [ms, msp, setStreamDetail, streamDetail]);

  const v1 = streamDetail as StreamInfo;
  const v2 = streamDetail as Stream;
  const isNew = v2.version >= 2 ? true : false;

  const renderFundsToWithdraw = () => {
    if (!streamDetail) {return null;}

    const token = getTokenByMintAddress(streamDetail.associatedToken as string);

    return (
      <>
        <span className="info-data large mr-1">
          {streamDetail
            ? getTokenAmountAndSymbolByTokenAddress(isNew ?
                toUiAmount(new BN(v2.withdrawableAmount), token?.decimals || 6) : v1.escrowVestedAmount, 
                streamDetail.associatedToken as string
              )
            : '--'
          }
        </span>
        <span className="info-icon">
          {(streamDetail && getStreamStatus(streamDetail) === "Running") ? (
            <ArrowDownOutlined className="mean-svg-icons success bounce" />
          ) : (
            <ArrowDownOutlined className="mean-svg-icons success" />
          )}
        </span>
      </>
    )
  }

  // Info Data
  const infoData = [
    {
      name: "Funds available to withdraw now",
      value: renderFundsToWithdraw()
    },
  ];

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="ms-00" onClick={() => {}}>
        <span className="menu-item-text">Transfer ownership</span>
      </Menu.Item>
    </Menu>
  );

  // Buttons
  const buttons = (
    <Row gutter={[8, 8]} className="safe-btns-container mb-1">
      <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke"
          onClick={showTransferFundsModal}>
            <div className="btn-content">
              Withdraw funds
            </div>
        </Button>
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke"
          onClick={() => {}}>
            <div className="btn-content">
              View on Solscan
            </div>
        </Button>
      </Col>

      <Col xs={4} sm={6} md={4} lg={6}>
        <Dropdown
          overlay={menu}
          placement="bottomRight"
          trigger={["click"]}>
          <span className="ellipsis-icon icon-button-container mr-1">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconEllipsisVertical className="mean-svg-icons"/>}
              onClick={(e) => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </Col>
    </Row>
  );

  const incomingStream = {
    title: streamDetail ? getStreamTitle(streamDetail) : "Unknown incoming stream",
    subtitle: streamDetail ? getStreamSubtitle(streamDetail) : "--",
    status: streamDetail ? getStreamStatus(streamDetail) : "--",
    resume: streamDetail ? getStreamResume(streamDetail) : "--"
  };

  const renderReceivingFrom = () => {
    if (!streamDetail) {return null;}

    return (
      <CopyExtLinkGroup
        content={isNew ? v2.treasurer as string : v1.treasurerAddress as string}
        number={8}
        externalLink={true}
      />
    )
  }

  const renderPaymentRate = () => {
    if (!streamDetail) {return null;}

    const token = getTokenByMintAddress(streamDetail.associatedToken as string);

    return (
      <>
        {streamDetail
          ? `${getTokenAmountAndSymbolByTokenAddress(isNew ?
              toUiAmount(new BN(v2.rateAmount), token?.decimals || 6) : v1.rateAmount, 
              streamDetail.associatedToken as string
            )}  ${getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true, t)}`
          : '--'
        }
      </>
    )
  }

  const renderReservedAllocation = () => {
    if (!streamDetail) {return null;}

    const token = getTokenByMintAddress(streamDetail.associatedToken as string);

    return (
      <>
        {streamDetail
          ? `${getTokenAmountAndSymbolByTokenAddress(isNew ?
            toUiAmount(new BN(v2.remainingAllocationAmount), token?.decimals || 6) : (v1.allocationAssigned || v1.allocationLeft), 
              streamDetail.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  const renderFundsLeftInAccount = () => {
    if (!streamDetail) {return null;}

    const token = getTokenByMintAddress(streamDetail.associatedToken as string);

    return (
      <>
        {streamDetail
          ? `${getTokenAmountAndSymbolByTokenAddress(isNew ?
            toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6) : v1.escrowUnvestedAmount, 
              streamDetail.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  // Tab details
  const detailsData = [
    {
      label: "Started on:",
      value: streamDetail ? moment(streamDetail.startUtc).format("LLL").toLocaleString() : "--"
    },
    {
      label: "Receiving from:",
      value: renderReceivingFrom() ? renderReceivingFrom() : "--"
    },
    {
      label: "Payment rate:",
      value: renderPaymentRate() ? renderPaymentRate() : "--"
    },
    {
      label: "Reserved allocation:",
      value: renderReservedAllocation() ? renderReservedAllocation() : ""
    },
    {
      label: "Funds left in account:",
      value: renderFundsLeftInAccount() ? renderFundsLeftInAccount() : "--"
    },
    // {
    //   label: "Funds ran out on:",
    //   value: "June 1, 2022 (6 days ago)"
    // },
  ];

  return (
    <>
      <MoneyStreamDetails
        stream={incomingStream}
        hideDetailsHandler={hideDetailsHandler}
        infoData={infoData}
        detailsData={detailsData}
        buttons={buttons}
      />

      {isTransferFundsModalVisible && (
        <TreasuryTransferFundsModal
          isVisible={isTransferFundsModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          treasuryDetails={treasuryDetails}
          multisigAccounts={multisigAccounts}
          minRequiredBalance={minRequiredBalance}
          handleOk={onAcceptTreasuryTransferFunds}
          handleClose={() => {
            onAfterEveryModalClose();
            setIsTransferFundsModalVisible(false);
          }}
          isBusy={isBusy}
        />
      )}
    </>
  )
}