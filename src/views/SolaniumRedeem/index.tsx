import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { getAmountWithSymbol, getTxIxResume } from '../../middleware/utils';
import { AppStateContext } from '../../contexts/appstate';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { useTranslation } from 'react-i18next';
import { consoleOut, getRateIntervalInSeconds, getTransactionStatusForLogs } from '../../middleware/ui';
import { useWallet } from '../../contexts/wallet';
import { TokenInfo } from '@solana/spl-token-registry';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { OperationType, PaymentRateType, TransactionStatus, WhitelistClaimType } from '../../models/enums';
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { appConfig, customLogger } from '../..';
import { getWhitelistAllocation } from '../../middleware/api';
import { Allocation } from '../../models/common-types';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import CountUp from 'react-countup';
import { updateCreateStream2Tx } from '../../middleware/transactions';

export const SolaniumRedeem = (props: {
  connection: Connection;
  idoClient: IdoClient | undefined
  idoStatus: IdoStatus;
  idoDetails: IdoDetails;
  disabled: boolean;
  redeemStarted: boolean;
  moneyStreamingClient: MoneyStreaming;
  selectedToken: TokenInfo | undefined;
}) => {
  const { t } = useTranslation('common');
  const { connected, wallet, publicKey } = useWallet();
  const {
    tokenList,
    selectedToken,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [userAllocation, setUserAllocation] = useState<Allocation | null>();

  const meanToken = useMemo(() => {
    const token = tokenList.filter(t => t.symbol === 'MEAN');
    consoleOut('token:', token, 'blue');
    return token[0];
  }, [tokenList]);

  useEffect(() => {
    if (!publicKey) {
      setUserAllocation(null);
      return;
    }

    const getAllocation = async () => {
      try {
        const allocation = await getWhitelistAllocation(publicKey.toBase58(), WhitelistClaimType.Solanium);
        consoleOut('allocation data:', allocation, 'blue');
        setUserAllocation(allocation);
      } catch (error) {
        console.error(error);
      } finally  {
        setIsBusy(false);
      }
    }

    if (!userAllocation) {
      getAllocation();
    }

  }, [
    publicKey,
    userAllocation
  ]);

  // Validation

  const isValidOperation = (): boolean => {
    return !props.disabled && userAllocation && userAllocation.tokenAmount > 0 ? true : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !userAllocation || !userAllocation.tokenAmount
        ? 'Nothing to claim'
        : 'Claim your MEAN';
  }

  const idoInfoRow = (caption: string, value: string, spaceBelow = true) => {
    return (
      <div className={`flex-fixed-right ${spaceBelow ? 'mb-1' : ''}`}>
        <div className="left inner-label">
          <span>{caption}</span>
        </div>
        <div className="right value-display">
          <span>{value}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-fill flex-column justify-content-center align-items-center">
        {props.selectedToken && (
          <>
            <div className="px-1 mb-2">
              {idoInfoRow(
                'Final Token Price',
                props.idoStatus.finalMeanPrice
                  ? getAmountWithSymbol(
                      props.idoStatus.finalMeanPrice,
                      props.selectedToken.address
                    )
                  : '-'
              )}
            </div>
            <div className="text-center font-size-120">Your Allocation</div>
            {meanToken && userAllocation && userAllocation.tokenAmount ? (
              <>
                <div className="airdrop-amount">
                  <CountUp
                    end={userAllocation.tokenAmount}
                    decimals={meanToken.decimals}
                    separator=','
                    duration={2} />
                  <span className="ml-1">{meanToken.symbol}</span>
                </div>
                <div className="font-size-100 mb-3 text-center fg-orange-red">Your Solanium allocation is going to be airdropped directly to your wallet.</div>
              </>
            ) : (
              <div className="airdrop-amount">0.000000 MEAN</div>
            )}
          </>
        )}
      </div>
      {/* <Button
        className={`main-cta ${isBusy ? 'inactive' : ''}`}
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isValidOperation()}
        onClick={onExecuteRedeemTx}>
        {isBusy && (
          <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
        )}
        {getTransactionStartButtonLabel()}
      </Button> */}
    </>
  );
};
