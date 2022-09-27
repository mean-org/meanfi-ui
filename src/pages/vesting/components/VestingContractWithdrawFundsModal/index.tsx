import React, { useCallback, useContext, useEffect, useState } from 'react';
import "./style.scss";
import { Modal, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../../../contexts/appstate';
import { TransactionStatus } from '../../../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress, toUsCurrency } from '../../../../middleware/ui';
import { NATIVE_SOL_MINT } from '../../../../middleware/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { formatThousands, getAmountWithSymbol, getSdkValue, isValidNumber, shortenAddress, toTokenAmountBn, toUiAmount } from '../../../../middleware/utils';
import { useWallet } from '../../../../contexts/wallet';
import { FALLBACK_COIN_IMAGE, MIN_SOL_BALANCE_REQUIRED, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { Treasury, TreasuryType } from '@mean-dao/msp';
import Checkbox from 'antd/lib/checkbox/Checkbox';
import { BN } from 'bn.js';
import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { Identicon } from '../../../../components/Identicon';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { VestingContractWithdrawOptions } from '../../../../models/vesting';
import { TokenInfo } from 'models/SolanaTokenInfo';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const VestingContractWithdrawFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isMultisigTreasury: boolean;
  isVisible: boolean;
  minRequiredBalance: number;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  transactionFees: TransactionFees;
  vestingContract: Treasury | undefined;
}) => {
  const {
    handleClose,
    handleOk,
    isBusy,
    isMultisigTreasury,
    isVisible,
    minRequiredBalance,
    nativeBalance,
    selectedMultisig,
    transactionFees,
    vestingContract,
  } = props;
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const {
    theme,
    tokenBalance,
    loadingPrices,
    transactionStatus,
    isVerifiedRecipient,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);

  const [to, setTo] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);

  const getTokenPrice = useCallback((inputAmount: string) => {
    if (!selectedToken) { return 0; }
    const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

    return parseFloat(inputAmount) * price;
  }, [getTokenPriceByAddress, getTokenPriceBySymbol, selectedToken]);

  const onAcceptWithdrawTreasuryFunds = () => {
    const multisig = isMultisigTreasury && selectedMultisig
      ? selectedMultisig.authority.toBase58()
      : '';
    const options: VestingContractWithdrawOptions = {
      amount: withdrawAmount,
      tokenAmount: tokenAmount,
      destinationAccount: to,
      associatedToken: selectedToken,
      multisig
    };
    handleOk(options);
  }

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setWithdrawAmount("");
      setTo("");
      setIsVerifiedRecipient(false);
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const onMintToAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTo(trimmedValue);
  }

  const handleAmountChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === "") {
      setWithdrawAmount("");
      setTokenAmount(new BN(0));
    } else if (newValue === '.') {
      setWithdrawAmount(".");
    } else if (isValidNumber(newValue)) {
      setWithdrawAmount(newValue);
      setTokenAmount(toTokenAmountBn(newValue, selectedToken?.decimals || 9));
    }
  };

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  // Validation
  const isValidForm = (): boolean => {
    const br = getMinBalanceRequired();
    return  publicKey &&
            to &&
            isValidAddress(to) &&
            selectedToken && 
            isVerifiedRecipient &&
            tokenAmount && tokenAmount.gtn(0) &&
            unallocatedBalance.gt(tokenAmount) &&
            nativeBalance >= br
      ? true
      : false;
  }

  const getButtonLabel = () => {
    return !to || !isValidAddress(to)
      ? 'Add destination account'
      : !unallocatedBalance || unallocatedBalance.isZero()
        ? 'No balance'
        : !withdrawAmount || tokenAmount.isZero()
          ? 'No amount'
          : tokenAmount && unallocatedBalance && tokenAmount.gt(unallocatedBalance)
            ? 'Amount exceeded'
            : !isVerifiedRecipient
              ? t('transactions.validation.verified-recipient-unchecked')
              : nativeBalance < getMinBalanceRequired()
                ? t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getMinBalanceRequired(), 4) })
                : transactionStatus.currentOperation === TransactionStatus.Iddle
                  ? t('treasuries.withdraw-funds.main-cta')
                  : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                    ? t('general.cta-finish')
                    : t('general.retry');
  }

  const isNewTreasury = useCallback(() => {
    if (vestingContract) {
      const v2 = vestingContract as Treasury;
      return v2.version >= 2 ? true : false;
    }

    return false;
  }, [vestingContract]);

  const getMinBalanceRequired = useCallback(() => {
    if (!transactionFees) { return 0; }

    const bf = transactionFees.blockchainFee;       // Blockchain fee
    const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
    const minRequired = isMultisigTreasury ? minRequiredBalance : bf + ff;
    return minRequired > MIN_SOL_BALANCE_REQUIRED ? minRequired : MIN_SOL_BALANCE_REQUIRED;

  }, [isMultisigTreasury, minRequiredBalance, transactionFees]);

  // Set a working token based on the Vesting Contract's Associated Token
  useEffect(() => {
    if (vestingContract) {
      let token = getTokenByMintAddress(vestingContract.associatedToken as string);
      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }
      setSelectedToken(token);
    }

    return () => { }
  }, [getTokenByMintAddress, vestingContract])

  // Set treasury unalocated balance in BN
  useEffect(() => {

    const getUnallocatedBalance = (details: Treasury) => {
      const balance = new BN(details.balance);
      const allocationAssigned = new BN(details.allocationAssigned);
      return balance.sub(allocationAssigned);
    }

    if (isVisible && vestingContract) {
      const unallocated = getUnallocatedBalance(vestingContract);
      consoleOut('unallocatedBalance:', unallocated.toString(), 'blue');
      setUnallocatedBalance(unallocated);
    }

  }, [
    isVisible,
    vestingContract,
    selectedToken?.decimals,
    isNewTreasury,
  ]);

  const renderTreasury = () => {
    if (!vestingContract) { return null; }
    const token = getTokenByMintAddress(vestingContract.associatedToken as string);
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };

    return (
      <div className="transaction-list-row no-pointer">
        <div className="icon-cell">
          <div className="token-icon">
            {token && token.logoURI ? (
              <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={vestingContract.associatedToken} style={{ width: "30", height: "30", display: "inline-flex" }} />
            )}
          </div>
        </div>
        <div className="description-cell">
          {vestingContract.name ? (
            <div className="title text-truncate">
              {vestingContract.name}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {vestingContract.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                }
              </span>
            </div>
          ) : (
            <div className="title text-truncate">{shortenAddress(vestingContract.id, 8)}</div>
          )}
          {isMultisigTreasury && (
            <div className="subtitle text-truncate">{t('treasuries.treasury-list.multisig-treasury-label')}</div>
          )}
        </div>
        <div className="rate-cell text-center">
          <div className="rate-amount">
            {formatThousands(+getSdkValue(vestingContract.totalStreams))}
          </div>
          <div className="interval">{vestingContract.totalStreams === 1 ? 'stream' : 'streams'}</div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('vesting.withdraw-funds.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptWithdrawTreasuryFunds}
      onCancel={onCloseModal}
      afterClose={() => {
        setWithdrawAmount("");
        setTokenAmount(new BN(0));
        setIsVerifiedRecipient(false);
      }}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!isBusy ? "panel1 show" : "panel1 hide"}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Transfer from */}
            {vestingContract && (
              <div className="mb-3">
                <div className="form-label">{t('vesting.withdraw-funds.from-vesting-contract')}</div>
                  <div className="well">
                    {renderTreasury()}
                  </div>
              </div>
            )}

            {/* Transfer to */}
            <div className="form-label">{t('multisig.transfer-tokens.transfer-to-label')}</div>
            <div className="well">
              <input id="mint-to-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onMintToAddressChange}
                placeholder={t('multisig.transfer-tokens.transfer-to-placeholder')}
                required={true}
                spellCheck="false"
                value={to}/>
              {to && !isValidAddress(to) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              )}
            </div>

            {/* Withdraw amount */}
            <div className="form-label">{t('streams.add-funds.amount-label')}</div>
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
                    {selectedToken && unallocatedBalance && (
                      <div
                        className="token-max simplelink"
                        onClick={() => {
                          setWithdrawAmount(toUiAmount(unallocatedBalance, selectedToken.decimals));
                          setTokenAmount(unallocatedBalance);
                        }}>
                        MAX
                      </div>
                    )}
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
                    value={withdrawAmount}
                  />
                </div>
              </div>
              <div className="flex-fixed-right">

                <div className="left inner-label">
                  {!vestingContract || (vestingContract && vestingContract.autoClose) ? (
                    <span>{t('add-funds.label-right')}:</span>
                  ) : (
                    <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                  )}
                  {vestingContract && vestingContract.autoClose ? (
                    <span>
                      {`${tokenBalance && selectedToken
                          ? getAmountWithSymbol(
                              tokenBalance,
                              selectedToken?.address,
                              true
                            )
                          : "0"
                      }`}
                    </span>
                  ) : (
                    <>
                      {selectedToken && unallocatedBalance ? (
                        <span>
                          {
                            getAmountWithSymbol(
                              toUiAmount(unallocatedBalance, selectedToken.decimals),
                              selectedToken.address,
                              true
                            )
                          }
                        </span>
                      ) : tokenBalance && selectedToken ? (
                        <span>
                          {
                            getAmountWithSymbol(
                              tokenBalance,
                              selectedToken.address,
                              true
                            )
                          }
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="right inner-label">
                  <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                    ~{withdrawAmount
                      ? toUsCurrency(getTokenPrice(withdrawAmount))
                      : "$0.00"}
                  </span>
                </div>
              </div>
            </div>

            {/* explanatory paragraph */}
            {isMultisigTreasury && (
              <p>{t("multisig.multisig-assets.explanatory-paragraph")}</p>
            )}

            {/* confirm that the recipient address doesn't belong to an exchange */}
            <div className="mt-2 mb-3 confirm-terms">
              <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
                {t("treasuries.withdraw-funds.verified-label")}
              </Checkbox>
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.transfer-tokens.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getAmountWithSymbol(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getAmountWithSymbol(
                      minRequiredBalance,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
            </div>
          </>
        )}
      </div>

      <div 
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
          }>          
        {isBusy && transactionStatus !== TransactionStatus.Iddle && (
        <div className="transaction-progress">
          <Spin indicator={bigLoadingIcon} className="icon mt-0" />
          <h4 className="font-bold mb-1">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </div>
        )}
      </div>

      {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
        <>
          <div className="cta-container">
            <Button
              type="primary"
              shape="round"
              size="large"
              disabled={isBusy || !isValidForm()}
              onClick={() => {
                if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                  onAcceptWithdrawTreasuryFunds();
                } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                  onCloseModal();
                } else {
                  onAcceptWithdrawTreasuryFunds();
                }
              }}>
              {isBusy
                ? t('multisig.transfer-tokens.main-cta-busy')
                : getButtonLabel()
              }
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
};
