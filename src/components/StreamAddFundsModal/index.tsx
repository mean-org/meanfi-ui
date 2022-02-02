import React, { useCallback, useEffect } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { StreamInfo, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { TokenDisplay } from '../TokenDisplay';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { MSP, Stream, Treasury, TreasuryType } from '@mean-dao/msp';
import { StreamTreasuryType } from '../../models/treasuries';
import { useWallet } from '../../contexts/wallet';
import { useConnection } from '../../contexts/connection';
import { PublicKey } from '@solana/web3.js';
import { consoleOut } from '../../utils/ui';
import { LoadingOutlined } from '@ant-design/icons';

export const StreamAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  mspClient: MoneyStreaming | MSP | undefined;
  streamDetail: Stream | StreamInfo | undefined;
  transactionFees: TransactionFees;
}) => {
  const {
    loadingPrices,
    selectedToken,
    tokenBalance,
    effectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [topupAmount, setTopupAmount] = useState<string>('');

  // Treasury related
  const [streamTreasuryType, setStreamTreasuryType] = useState<StreamTreasuryType | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  // const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);

  const getTreasuryTypeByTreasuryId = useCallback(async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !props.mspClient) { return undefined; }

    const mspInstance = streamVersion < 2 ? props.mspClient as MoneyStreaming : props.mspClient as MSP;
    const treasueyPk = new PublicKey(treasuryId);

    try {
      const details = await mspInstance.getTreasury(treasueyPk);
      if (details) {
        // setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
        const v1 = details as TreasuryInfo;
        const v2 = details as Treasury;
        const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
        const type = isNewTreasury ? v2.treasuryType : v1.type;
        if (type === TreasuryType.Lock) {
          return "locked";
        } else {
          return "open";
        }
      } else {
        // setTreasuryDetails(undefined);
        return "unknown";
      }
    } catch (error) {
      console.error(error);
      return "unknown";
    } finally {
      setLoadingTreasuryDetails(false);
    }

  }, [
    publicKey,
    connection,
    props.mspClient,
  ]);

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (props.isVisible && !localStreamDetail && props.streamDetail) {
      setLocalStreamDetail(props.streamDetail);
    }
  }, [
    props.isVisible,
    localStreamDetail,
    props.streamDetail,
  ]);

  useEffect(() => {
    if (props.isVisible && localStreamDetail) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      consoleOut('fetching treasury details...', '', 'blue');
      getTreasuryTypeByTreasuryId(
        localStreamDetail.version < 2 ? v1.treasuryAddress as string : v2.treasury as string,
        localStreamDetail.version
      ).then(value => {
        consoleOut('streamTreasuryType:', value, 'crimson');
        setStreamTreasuryType(value)});
    }
  }, [
    props.isVisible,
    localStreamDetail,
    getTreasuryTypeByTreasuryId
  ]);


  const onAcceptTopup = () => {
    props.handleOk({
      amount: topupAmount,
      treasuryType: streamTreasuryType
    });
  }

  const setValue = (value: string) => {
    setTopupAmount(value);
  }

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
    return selectedToken &&
           tokenBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(topupAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : t('transactions.validation.valid-approve');
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptTopup}
      onCancel={props.handleClose}
      afterClose={() => setValue('')}
      width={480}>
      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress">
          <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
          <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : (
        <>
          {/* Top up amount */}
          <div className="form-label">{t('add-funds.label')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {selectedToken && (
                    <TokenDisplay onClick={() => {}}
                      mintAddress={selectedToken.address}
                      name={selectedToken.name}
                      showCaretDown={false}
                    />
                  )}
                  {selectedToken && tokenBalance ? (
                    <div
                      className="token-max simplelink"
                      onClick={() => setValue(tokenBalance.toFixed(selectedToken.decimals))}>
                      MAX
                    </div>
                  ) : null}
                </span>
              </div>
              <div className="right">
                <input
                  id="topup-amount-field"
                  className="general-text-input text-right"
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  type="text"
                  onChange={handleAmountChange}
                  pattern="^[0-9]*[.,]?[0-9]*$"
                  placeholder="0.0"
                  minLength={1}
                  maxLength={79}
                  spellCheck="false"
                  value={topupAmount}
                />
              </div>
            </div>
            <div className="flex-fixed-right">
              <div className="left inner-label">
                <span>{t('add-funds.label-right')}:</span>
                <span>
                  {`${tokenBalance && selectedToken
                      ? getTokenAmountAndSymbolByTokenAddress(
                          tokenBalance,
                          selectedToken?.address,
                          true
                        )
                      : "0"
                  }`}
                </span>
              </div>
              <div className="right inner-label">
                <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                  ~${topupAmount && effectiveRate
                    ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                    : "0.00"}
                </span>
              </div>
            </div>
          </div>
          <Button
            className="main-cta"
            block
            type="primary"
            shape="round"
            size="large"
            disabled={!isValidInput()}
            onClick={onAcceptTopup}>
            {getTransactionStartButtonLabel()}
          </Button>
        </>
      )}
    </Modal>
  );
};
