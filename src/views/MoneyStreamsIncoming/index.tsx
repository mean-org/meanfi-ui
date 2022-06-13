import { Button, Col, Dropdown, Menu, Row } from "antd";
import { useCallback, useContext, useMemo, useState } from "react";
import { customLogger } from "../..";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { MoneyStreamDetails } from "../../components/MoneyStreamDetails";
import { TreasuryTransferFundsModal } from "../../components/TreasuryTransferFundsModal";
import { AppStateContext } from "../../contexts/appstate";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { IconEllipsisVertical } from "../../Icons";
import { OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getTransactionStatusForLogs } from "../../utils/ui";
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
import { NO_FEES } from "../../constants";
import { getTokenAmountAndSymbolByTokenAddress, getTxIxResume } from "../../utils/utils";
import { NATIVE_SOL_MINT } from "../../utils/ids";

export const MoneyStreamsIncomingView = (props: {
  stream?: any;
  onSendFromIncomingStreamDetails?: any;
  // tabs?: Array<any>;
}) => {
  const {
    theme,
    tokenList,
    tokenBalance,
    selectedToken,
    treasuryOption,
    detailsPanelOpen,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    previousWalletConnectState,
    setStreamList,
    setSelectedToken,
    setEffectiveRate,
    refreshStreamList,
    setTreasuryOption,
    setDtailsPanelOpen,
    resetContractValues,
    refreshTokenBalance,
    setTransactionStatus,
    getTokenByMintAddress,
    setHighLightableStreamId,
    setHighLightableMultisigId,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const { stream, onSendFromIncomingStreamDetails } = props;

  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();

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

  // Info Data
  const infoData = [
    {
      name: "Funds available to withdraw now",
      value: "22.15258 USDC"
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

  const sendingTo =  <CopyExtLinkGroup
    content={"Gc88HJN4eNssQkp7LUTGfpo14Y3wE6zKFrEBtLrmiQpq"}
    number={8}
    externalLink={true}
  />

  // Tab details
  const detailsData = [
    {
      label: "Started on:",
      value: "March 3rd 2022"
    },
    {
      label: "Receiving from:",
      value: sendingTo ? sendingTo : "--"
    },
    {
      label: "Payment rate:",
      value: "3.29805 USDC / month"
    },
    {
      label: "Reserved allocation:",
      value: "100 USDC"
    },
    {
      label: "Funds left in account:",
      value: "50.12569 USDC"
    },
    {
      label: "Funds ran out on:",
      value: "June 1, 2022 (6 days ago)"
    },
  ];

  return (
    <>
      <MoneyStreamDetails
        stream={stream}
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