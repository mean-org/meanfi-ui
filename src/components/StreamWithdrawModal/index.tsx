import { MoneyStreaming } from '@mean-dao/money-streaming';
import { STREAM_STATE, type StreamInfo, type TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { PaymentStreaming, STREAM_STATUS_CODE, type Stream } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { Button, Col, Modal, Row } from 'antd';
import BigNumber from 'bignumber.js';
import { InputMean } from 'components/InputMean';
import { CUSTOM_TOKEN_NAME, WRAPPED_SOL_MINT_ADDRESS } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { getStreamId } from 'middleware/getStreamId';
import { consoleOut, percentageBn } from 'middleware/ui';
import { getAmountWithSymbol, isValidNumber, shortenAddress, toTokenAmountBn, toUiAmount } from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import { TransactionStatus } from 'models/enums';
import type { StreamWithdrawData } from 'models/streams';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFallBackRpcEndpoint } from 'services/connections-hq';
import { openNotification } from '../Notifications';

export const StreamWithdrawModal = (props: {
  handleClose: () => void;
  handleOk: (params: StreamWithdrawData) => void;
  isVisible: boolean;
  selectedToken: TokenInfo | undefined;
  startUpData: Stream | StreamInfo | undefined;
  transactionFees: TransactionFees;
}) => {
  const { handleClose, handleOk, isVisible, selectedToken, startUpData, transactionFees } = props;
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { wallet, publicKey } = useWallet();
  const { splTokenList, selectedAccount, streamProgramAddress, streamV2ProgramAddress, setTransactionStatus } =
    useContext(AppStateContext);
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>('');
  const [withdrawAmountBn, setWithdrawAmountBn] = useState(new BN(0));
  const [maxAmountBn, setMaxAmountBn] = useState(new BN(0));
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [feePayedByTreasurer, setFeePayedByTreasurer] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  const paymentStreaming = useMemo(() => {
    return new PaymentStreaming(connection, new PublicKey(streamV2ProgramAddress), connection.commitment);
  }, [connection, streamV2ProgramAddress]);

  const getFeeAmount = useCallback(
    (fees: TransactionFees, amount = new BN(0)): number => {
      if (!selectedToken) {
        return 0;
      }

      let fee = 0;
      if (fees) {
        if (fees.mspPercentFee) {
          if (amount.gtn(0)) {
            const pctgTokens = percentageBn(fees.mspPercentFee, amount);
            const uiAmount = toUiAmount(pctgTokens, selectedToken.decimals);
            fee = Number.parseFloat(uiAmount);
          }
        } else if (fees.mspFlatFee) {
          fee = fees.mspFlatFee;
        }
      }
      return feePayedByTreasurer ? 0 : fee;
    },
    [feePayedByTreasurer, selectedToken],
  );

  const getDisplayAmount = useCallback(
    (amount: string | number, addSymbol = false): string => {
      if (selectedToken) {
        const token =
          selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
            ? (Object.assign({}, selectedToken, {
                symbol: 'SOL',
              }) as TokenInfo)
            : selectedToken;
        const bareAmount = typeof amount === 'number' ? amount.toFixed(token.decimals) : amount;
        if (addSymbol) {
          return token.name === CUSTOM_TOKEN_NAME
            ? `${bareAmount} ${selectedToken.symbol}`
            : `${bareAmount} ${token ? token.symbol : selectedToken.symbol}`;
        }
        return bareAmount;
      }

      return '';
    },
    [selectedToken],
  );

  const isV2Stream = useCallback((stream: Stream | StreamInfo) => {
    if (stream) {
      return stream.version >= 2;
    }
    return false;
  }, []);

  const isMaxAmount = useMemo(() => {
    if (!selectedToken || !withdrawAmountInput) {
      return false;
    }

    const value = new BigNumber(withdrawAmountInput);
    const multiplier = new BigNumber(10 ** selectedToken.decimals);
    const result = value.multipliedBy(multiplier).integerValue();
    const withdrawInput = new BN(result.toString());

    return withdrawInput.eq(maxAmountBn);
  }, [maxAmountBn, selectedToken, withdrawAmountInput]);

  useEffect(() => {
    if (!wallet || !publicKey || !selectedToken || !startUpData) {
      return;
    }

    const getStreamDetails = async (
      isV2Stream: boolean,
      streamId: string,
      client: PaymentStreaming | MoneyStreaming,
    ) => {
      const streamPublicKey = new PublicKey(streamId);
      try {
        let detail: Stream | StreamInfo | null = null;
        if (isV2Stream) {
          detail = await (client as PaymentStreaming).getStream(streamPublicKey);
        } else {
          detail = await (client as MoneyStreaming).getStream(streamPublicKey);
        }
        if (detail) {
          consoleOut('Withdraw stream detail:', detail, 'blue');
          const v1 = detail as StreamInfo;
          const v2 = detail as Stream;
          let max = new BN(0);
          if (isV2Stream) {
            max = new BN(v2.withdrawableAmount);
            setFeePayedByTreasurer(v2.tokenFeePayedFromAccount);
          } else {
            max = new BN(v1.escrowVestedAmount);
          }
          setMaxAmountBn(max);
          consoleOut('maxAmount:', max.toString(), 'blue');
        } else {
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {
              streamId: shortenAddress(streamId, 10),
            }),
            type: 'error',
          });
        }
      } catch (error) {
        console.error(error);
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {
            streamId: shortenAddress(streamId, 10),
          }),
          type: 'error',
        });
      } finally {
        setLoadingData(false);
      }
    };

    const v1 = startUpData as StreamInfo;
    const v2 = startUpData as Stream;
    const streamId = getStreamId(startUpData);
    let max = new BN(0);
    if (isV2Stream(startUpData)) {
      max = new BN(v2.withdrawableAmount);
      if (v2.statusCode === STREAM_STATUS_CODE.Running) {
        setMaxAmountBn(max);
        setLoadingData(true);
        getStreamDetails(true, streamId, paymentStreaming);
      } else {
        setMaxAmountBn(max);
        setFeePayedByTreasurer(v2.tokenFeePayedFromAccount);
      }
    } else {
      max = new BN(v1.escrowVestedAmount);
      if (v1.state === STREAM_STATE.Running) {
        setMaxAmountBn(max);
        setLoadingData(true);
        const ms = new MoneyStreaming(getFallBackRpcEndpoint().httpProvider, streamProgramAddress, 'confirmed');
        getStreamDetails(false, streamId, ms);
      } else {
        setMaxAmountBn(max);
      }
    }
  }, [wallet, publicKey, startUpData, selectedToken, paymentStreaming, streamProgramAddress, isV2Stream, t]);

  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(getFeeAmount(transactionFees));
    }
  }, [feeAmount, transactionFees, getFeeAmount]);

  const onAcceptWithdrawal = () => {
    if (!selectedToken) {
      return;
    }

    consoleOut('withdrawAmountInput:', withdrawAmountInput, 'orange');
    consoleOut('withdrawAmountBn:', withdrawAmountBn.toString(), 'orange');
    consoleOut('maxAmountBn:', maxAmountBn.toString(), 'orange');
    consoleOut('isMaxAmount:', isMaxAmount ? 'true' : 'false', 'orange');

    const withdrawData: StreamWithdrawData = {
      title: proposalTitle,
      token: selectedToken,
      amount: isMaxAmount ? `${maxAmountBn.toString()}` : `${withdrawAmountBn.toString()}`,
      inputAmount: Number.parseFloat(withdrawAmountInput),
      fee: feeAmount || 0,
      receiveAmount: Number.parseFloat(withdrawAmountInput) - (feeAmount as number),
    };
    setWithdrawAmountInput('');
    setWithdrawAmountBn(new BN(0));
    handleOk(withdrawData);
  };

  const onCloseModal = () => {
    onAfterClose();
    handleClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setProposalTitle('');
      setWithdrawAmountInput('');
      setWithdrawAmountBn(new BN(0));
    }, 50);

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  };

  const onTitleInputValueChange = (value: string) => {
    setProposalTitle(value);
  };

  const setValue = (value: string) => {
    setWithdrawAmountInput(value);
  };

  const setPercentualValue = (value: number) => {
    let newValue = '';
    let fee = 0;
    if (startUpData && selectedToken) {
      if (value === 100) {
        setWithdrawAmountBn(maxAmountBn);
        fee = getFeeAmount(transactionFees, maxAmountBn);
        newValue = getDisplayAmount(toUiAmount(maxAmountBn, selectedToken.decimals));
      } else {
        const pctgAmount = new BN(percentageBn(value, maxAmountBn));
        const partialAmount = toUiAmount(pctgAmount, selectedToken.decimals);
        setWithdrawAmountBn(pctgAmount);
        fee = getFeeAmount(transactionFees, pctgAmount);
        newValue = getDisplayAmount(partialAmount);
      }
    }
    setValue(newValue);
    setFeeAmount(fee);
  };

  const handleWithdrawAmountChange = (value: string) => {
    let newValue = value.trim();

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setValue('');
      setWithdrawAmountBn(new BN(0));
    } else if (newValue === '.') {
      setValue('.');
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
      const withdrawInput = toTokenAmountBn(newValue, decimals);
      setWithdrawAmountBn(withdrawInput);
      setFeeAmount(getFeeAmount(transactionFees, withdrawInput));
    }
  };

  // Validation
  const isValidForm = (): boolean => {
    return startUpData &&
      withdrawAmountInput &&
      withdrawAmountBn.lte(maxAmountBn) &&
      withdrawAmountBn.gtn(feeAmount || 0)
      ? true
      : false;
  };

  // Validation if multisig
  const isValidFormMultisig = (): boolean => {
    return proposalTitle &&
      startUpData &&
      withdrawAmountInput &&
      withdrawAmountBn.lte(maxAmountBn) &&
      withdrawAmountBn.gtn(feeAmount || 0)
      ? true
      : false;
  };

  const getTransactionStartButtonLabel = () => {
    return !withdrawAmountInput || withdrawAmountBn.isZero()
      ? 'Enter amount'
      : maxAmountBn.isZero()
        ? 'No balance'
        : withdrawAmountBn.gt(maxAmountBn)
          ? 'Amount exceeded'
          : t('transactions.validation.valid-start-withdrawal');
  };

  const getTransactionStartButtonLabelMultisig = () => {
    return !proposalTitle
      ? 'Add a proposal title'
      : !withdrawAmountInput || withdrawAmountBn.isZero()
        ? 'Enter amount'
        : maxAmountBn.isZero()
          ? 'No balance'
          : withdrawAmountBn.gt(maxAmountBn)
            ? 'Amount exceeded'
            : 'Sign proposal';
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className='text-right pr-1'>
          {caption}
        </Col>
        <Col span={12} className='text-left pl-1 fg-secondary-70'>
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <Modal
      className='mean-modal'
      title={
        <div className='modal-title'>
          {isMultisigContext ? 'Propose withdraw funds' : t('withdraw-funds.modal-title')}
        </div>
      }
      footer={null}
      open={isVisible}
      onOk={onAcceptWithdrawal}
      onCancel={onCloseModal}
      width={480}
    >
      {/* Proposal title */}
      {isMultisigContext && (
        <div className='mb-3'>
          <div className='form-label'>{t('multisig.proposal-modal.title')}</div>
          <InputMean
            id='proposal-title-field'
            name='Title'
            className='w-100 general-text-input'
            onChange={onTitleInputValueChange}
            placeholder='Add a proposal title (required)'
            value={proposalTitle}
          />
        </div>
      )}

      <div className='well disabled'>
        <div className='flex-fixed-right'>
          <div className='left inner-label'>{t('withdraw-funds.label-available-amount')}:</div>
          <div className='right'>&nbsp;</div>
        </div>
        <div className='flex-fixed-right'>
          <div className='left static-data-field'>
            {startUpData &&
              selectedToken &&
              getAmountWithSymbol(
                toUiAmount(maxAmountBn, selectedToken.decimals),
                selectedToken.address,
                true,
                splTokenList,
                selectedToken.decimals,
              )}
          </div>
          <div className='right'>&nbsp;</div>
        </div>
      </div>

      <div className={`well ${loadingData ? 'disabled' : ''}`}>
        <div className='flex-fixed-right'>
          <div className='left inner-label'>{t('withdraw-funds.label-input-amount')}</div>
          <div className='right'>
            <div className='addon'>
              <div className='token-group'>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(25)}>
                  25%
                </div>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(50)}>
                  50%
                </div>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(75)}>
                  75%
                </div>
                <div className='token-max simplelink' onKeyDown={() => {}} onClick={() => setPercentualValue(100)}>
                  100%
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className='flex-fixed-right'>
          <div className='left'>
            <input
              className='general-text-input'
              inputMode='decimal'
              autoComplete='off'
              autoCorrect='off'
              type='text'
              onChange={e => handleWithdrawAmountChange(e.target.value)}
              pattern='^[0-9]*[.,]?[0-9]*$'
              placeholder='0.0'
              minLength={1}
              maxLength={79}
              spellCheck='false'
              value={withdrawAmountInput}
            />
          </div>
          <div className='right'>&nbsp;</div>
        </div>
        {withdrawAmountBn.gt(maxAmountBn) ? (
          <span className='form-field-error'>{t('transactions.validation.amount-withdraw-high')}</span>
        ) : null}
      </div>

      {/* Info */}
      {selectedToken && (
        <div className='p-2 mb-2'>
          {(isValidForm() || isValidFormMultisig()) &&
            infoRow(
              t('transactions.transaction-info.transaction-fee') + ':',
              `~${getDisplayAmount(feeAmount || 0, true)}`,
            )}
          {(isValidForm() || isValidFormMultisig()) &&
            infoRow(
              t('transactions.transaction-info.you-receive') + ':',
              `~${getDisplayAmount(Number.parseFloat(withdrawAmountInput) - (feeAmount as number), true)}`,
            )}
        </div>
      )}

      <Button
        className='main-cta'
        block
        type='primary'
        shape='round'
        size='large'
        disabled={isMultisigContext ? !isValidFormMultisig() : !isValidForm()}
        onClick={onAcceptWithdrawal}
      >
        {isMultisigContext ? getTransactionStartButtonLabelMultisig() : getTransactionStartButtonLabel()}
      </Button>
    </Modal>
  );
};
