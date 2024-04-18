import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { MultisigInfo, MultisigTransactionFees } from '@mean-dao/mean-multisig-sdk';
import { type AccountInfo, LAMPORTS_PER_SOL, type ParsedAccountData, PublicKey } from '@solana/web3.js';
import { Button, Drawer, Modal, Spin } from 'antd';
import ValidationStatusDisplay from 'components/ValidationStatusDisplay';
import {
  INPUT_DEBOUNCE_TIME,
  MAX_TOKEN_LIST_ITEMS,
  MEAN_MULTISIG_ACCOUNT_LAMPORTS,
  MIN_SOL_BALANCE_REQUIRED,
} from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { AppStateContext } from 'contexts/appstate';
import { getNetworkIdByEnvironment, useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import { useDebounce } from 'hooks/useDebounce';
import useRecipientAddressValidation from 'hooks/useRecipientAddressValidation';
import { fetchAccountTokens } from 'middleware/accounts';
import { SOL_MINT } from 'middleware/ids';
import { isError } from 'middleware/transactions';
import { consoleOut, getTransactionOperationDescription, isValidAddress, toUsCurrency } from 'middleware/ui';
import { cutNumber, getAmountWithSymbol, isValidNumber, shortenAddress, toTokenAmount } from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type { UserTokenAccount } from 'models/accounts';
import { TransactionStatus } from 'models/enums';
import type { TransferTokensTxParams } from 'models/multisig';
import React, { type ChangeEvent, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputMean } from '../InputMean';
import { TextInput } from '../TextInput';
import { TokenDisplay } from '../TokenDisplay';
import { TokenListItem } from '../TokenListItem';
import './style.scss';
import type { LooseObject } from 'types/LooseObject';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface Props {
  assets: UserTokenAccount[];
  handleClose: () => void;
  handleOk: (params: TransferTokensTxParams) => void;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  selectedVault: UserTokenAccount | undefined;
  transactionFees: MultisigTransactionFees;
}

export const MultisigTransferTokensModal = ({
  assets,
  handleClose,
  handleOk,
  isBusy,
  isVisible,
  nativeBalance,
  selectedMultisig,
  selectedVault,
  transactionFees,
}: Props) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const {
    tokenList,
    splTokenList,
    tokenAccounts,
    loadingPrices,
    transactionStatus,
    getTokenPriceByAddress,
    setEffectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);
  const { validationStatus, isTransferDisabled, validateAddress } = useRecipientAddressValidation({ connection });

  const [proposalTitle, setProposalTitle] = useState('');
  const [fromVault, setFromVault] = useState<UserTokenAccount>();
  const [fromAddress, setFromAddress] = useState('');
  const [to, setTo] = useState('');
  const debouncedToAddress = useDebounce<string>(to, INPUT_DEBOUNCE_TIME);
  const [amount, setAmount] = useState('');
  const [userBalances, setUserBalances] = useState<LooseObject>();
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [tokenFilter, setTokenFilter] = useState('');
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);

  // Process inputs
  useEffect(() => {
    if (isVisible) {
      if (selectedVault) {
        setSelectedToken(selectedVault);
      }
    }
  }, [isVisible, selectedVault]);

  useEffect(() => {
    if (isVisible && transactionFees) {
      const totalMultisigFee = transactionFees.multisigFee + MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL;
      const minRequired = totalMultisigFee + transactionFees.rentExempt + transactionFees.networkFee;
      consoleOut('Min required balance:', minRequired, 'blue');
      setMinRequiredBalance(minRequired);
    }
  }, [isVisible, transactionFees]);

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback(
    (searchString: string) => {
      if (!selectedList) {
        return;
      }

      const timeout = setTimeout(() => {
        const filter = (t: TokenInfo) => {
          return (
            t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
            t.name.toLowerCase().includes(searchString.toLowerCase()) ||
            t.address.toLowerCase().includes(searchString.toLowerCase())
          );
        };

        const showFromList = !searchString ? selectedList : selectedList.filter(t => filter(t));

        setFilteredTokenList(showFromList);
      });

      return () => {
        clearTimeout(timeout);
      };
    },
    [selectedList],
  );

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  }, [updateTokenListByFilter]);

  const onTokenSearchInputChange = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (e: any) => {
      const newValue = e.target.value;
      setTokenFilter(newValue);
      updateTokenListByFilter(newValue);
    },
    [updateTokenListByFilter],
  );

  const getTokenPrice = useCallback(() => {
    if (!amount || !selectedToken) {
      return 0;
    }
    const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

    return Number.parseFloat(amount) * price;
  }, [amount, selectedToken, getTokenPriceByAddress]);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById('token-search-otp');
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  const showDrawer = () => {
    setIsTokenSelectorVisible(true);
    autoFocusInput();
  };

  const hideDrawer = () => {
    setIsTokenSelectorVisible(false);
  };

  // Automatically update all token balances and rebuild token list
  useEffect(() => {
    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !tokenList || !tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {
      const balancesMap: LooseObject = {};
      const pk = selectedMultisig ? selectedMultisig.authority : publicKey;

      fetchAccountTokens(connection, pk)
        .then(accTks => {
          if (accTks) {
            const intersectedList = new Array<TokenInfo>();
            const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as TokenInfo[];

            intersectedList.push(splTokensCopy[0]);
            balancesMap[NATIVE_SOL.address] = nativeBalance;
            // Create a list containing tokens for the user owned token accounts
            for (const item of accTks) {
              balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount ?? 0;
              const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
              const tokenFromSplTokensCopy = splTokensCopy.find(t => t.address === item.parsedInfo.mint);
              if (tokenFromSplTokensCopy && !isTokenAccountInTheList) {
                intersectedList.push(tokenFromSplTokensCopy);
              }
            }

            intersectedList.sort((a, b) => {
              if ((balancesMap[a.address] ?? 0) < (balancesMap[b.address] ?? 0)) {
                return 1;
              }
              if ((balancesMap[a.address] ?? 0) > (balancesMap[b.address] ?? 0)) {
                return -1;
              }
              return 0;
            });

            setSelectedList(intersectedList);
            consoleOut('intersectedList:', intersectedList, 'orange');
          } else {
            for (const t of tokenList) {
              balancesMap[t.address] = 0;
            }
            // set the list to the userTokens list
            setSelectedList(tokenList);
          }
        })
        .catch(error => {
          console.error(error);
          for (const t of tokenList) {
            balancesMap[t.address] = 0;
          }
          setSelectedList(tokenList);
        })
        .finally(() => setUserBalances(balancesMap));
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [publicKey, tokenList, connection, splTokenList, tokenAccounts, nativeBalance, selectedMultisig]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (selectedList?.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [selectedList, tokenFilter, filteredTokenList, updateTokenListByFilter]);

  // Keep token balance updated
  useEffect(() => {
    if (!connection || !publicKey || !userBalances || !selectedToken) {
      setTokenBalance(0);
      return;
    }

    const timeout = setTimeout(() => {
      setTokenBalance(userBalances[selectedToken.address]);
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [connection, publicKey, selectedToken, userBalances]);

  // Resolves fromVault
  useEffect(() => {
    if (!isVisible || !assets) {
      return;
    }

    const timeout = setTimeout(() => {
      const asset = selectedVault ?? assets[0];
      consoleOut('From asset:', asset, 'blue');
      setFromVault(asset);
      setFromAddress(asset.publicAddress ?? '');
    });

    return () => clearTimeout(timeout);
  }, [assets, isVisible, selectedVault]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    // We need to debounce the recipient address input value to avoid numerous calls
    // Triggers when "debouncedToAddress" changes
    // Do validation of the recipient address here
    if (fromVault) {
      console.log('debouncedToAddress:', debouncedToAddress);
      console.log('fromMint:', fromVault.address);
      validateAddress(debouncedToAddress, fromVault.address);
    }
  }, [debouncedToAddress, fromVault]);

  const onAcceptModal = () => {
    if (!fromVault) return;

    const params: TransferTokensTxParams = {
      proposalTitle,
      from: fromVault.publicAddress ?? '',
      fromMint: fromVault.address,
      amount: +amount,
      tokenAmount: toTokenAmount(amount, fromVault.decimals, true) as string,
      to: to,
    };
    handleOk(params);
  };

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    handleClose();
  };

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  };

  const onTransferToAddressChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputValue = event.target.value;
    const trimmedValue = inputValue.trim();
    setTo(trimmedValue);
  };

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const onMintAmountChange = (e: any) => {
    let newValue = e.target.value;

    const decimals = selectedVault ? selectedVault.decimals : 0;
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

    if (newValue === null || newValue === undefined || newValue === '') {
      setAmount('');
    } else if (isValidNumber(newValue)) {
      setAmount(newValue);
    }
  };

  const isValidForm = (): boolean => {
    return !!(
      !!(proposalTitle && fromVault && to) &&
      isValidAddress(fromVault.publicAddress) &&
      isValidAddress(to) &&
      amount &&
      +amount > 0 &&
      +amount <= (fromVault.balance ?? 0)
    );
  };

  const isAmountTooHigh = () => {
    return amount && fromVault && +amount > (fromVault.balance ?? 0);
  };

  const getTransactionStartButtonLabel = () => {
    if (!proposalTitle) {
      return 'Add a proposal title';
    }
    if (+amount === 0) {
      return 'Enter amount';
    }
    if (!fromVault || fromVault.balance === 0) {
      return 'No balance';
    }
    if (isAmountTooHigh()) {
      return 'Amount exceeded';
    }
    if (!to) {
      return 'Enter an address';
    }
    if (!isValidAddress(to)) {
      return 'Invalid address';
    }
    return 'Sign proposal';
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  // Handler paste clipboard data
  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const pasteHandler = (e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(',', '');
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    consoleOut('only numbers and dot', onlyNumbersAndDot);

    setAmount(onlyNumbersAndDot.trim());
  };

  const onCloseTokenSelector = useCallback(() => {
    hideDrawer();
    // Reset token on errors (decimals: -1 or -2)
    if (selectedToken && selectedToken.decimals < 0) {
      setSelectedToken(undefined);
    }
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [selectedToken, tokenFilter, hideDrawer]);

  const getTokenListItemClass = (t: TokenInfo, balance: number) => {
    if (!balance) {
      return 'dimmed';
    }
    return selectedToken && selectedToken.address === t.address ? 'selected' : 'simplelink';
  };

  const renderTokenList = (
    <>
      {filteredTokenList &&
        filteredTokenList.length > 0 &&
        filteredTokenList.map((t, index) => {
          const onClick = () => {
            setSelectedToken(t);

            consoleOut('token selected:', t.symbol, 'blue');
            const price = getTokenPriceByAddress(t.address, t.symbol);
            setEffectiveRate(price);
            onCloseTokenSelector();
          };

          if (index < MAX_TOKEN_LIST_ITEMS) {
            const balance = connected && userBalances && userBalances[t.address] > 0 ? userBalances[t.address] : 0;
            return (
              <TokenListItem
                key={t.address}
                name={t.name || 'Unknown token'}
                mintAddress={t.address}
                token={t}
                className={getTokenListItemClass(t, balance)}
                onClick={onClick}
                balance={balance}
              />
            );
          }
          return null;
        })}
    </>
  );

  const getTokenSelectorInputErrorMessage = () => {
    if (!tokenFilter || !selectedToken) {
      return '';
    }
    if (selectedToken.decimals === -1) {
      return 'Account not found';
    }
    if (selectedToken && selectedToken.decimals === -2) {
      return 'Account is not a token mint';
    }
    return '';
  };

  const renderTokenSelectorInner = (
    <div className='token-selector-wrapper'>
      <div className='token-search-wrapper'>
        <TextInput
          id='token-search-otp'
          value={tokenFilter}
          allowClear={true}
          extraClass='mb-2'
          onInputClear={onInputCleared}
          placeholder={t('token-selector.search-input-placeholder')}
          error={getTokenSelectorInputErrorMessage()}
          onInputChange={onTokenSearchInputChange}
        />
      </div>
      <div className='token-list'>
        {filteredTokenList.length > 0 && renderTokenList}
        {tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0 && (
          <TokenListItem
            key={tokenFilter}
            name='Unknown token'
            mintAddress={tokenFilter}
            className={selectedToken && selectedToken.address === tokenFilter ? 'selected' : 'simplelink'}
            onClick={async () => {
              const address = tokenFilter;
              let decimals = -1;
              let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
              try {
                accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
                consoleOut('accountInfo:', accountInfo, 'blue');
              } catch (error) {
                console.error(error);
              }
              if (accountInfo) {
                if (
                  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
                  (accountInfo as any).data.program &&
                  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
                  (accountInfo as any).data.program === 'spl-token' &&
                  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
                  (accountInfo as any).dataparsed &&
                  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
                  (accountInfo as any).dataparsed.type &&
                  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
                  (accountInfo as any).dataparsed.type === 'mint'
                ) {
                  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
                  decimals = (accountInfo as any).dataparsed.info.decimals;
                } else {
                  decimals = -2;
                }
              }
              const uknwnToken: TokenInfo = {
                address,
                name: 'Unknown token',
                chainId: getNetworkIdByEnvironment(environment),
                decimals,
                symbol: `[${shortenAddress(address)}]`,
              };
              setSelectedToken(uknwnToken);
              if (userBalances?.[address]) {
                setTokenBalance(userBalances[address]);
              }
              consoleOut('token selected:', uknwnToken, 'blue');
              // Do not close on errors (-1 or -2)
              if (decimals >= 0) {
                onCloseTokenSelector();
              }
            }}
            balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
          />
        )}
      </div>
    </div>
  );

  const getCtaButtonLabel = () => {
    if (isBusy) {
      return t('multisig.transfer-tokens.main-cta-busy');
    }
    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
      return getTransactionStartButtonLabel();
    }
    if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
      return t('general.cta-finish');
    }
    return t('general.refresh');
  };

  const getAlternateStateModalContent = () => {
    if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
      return (
        <div className='transaction-progress'>
          <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
          <h4 className='font-bold'>{t('multisig.transfer-tokens.success-message')}</h4>
        </div>
      );
    }
    return (
      <div className='transaction-progress p-0'>
        <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
        {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
          <h4 className='mb-4'>
            {t('transactions.status.tx-start-failure', {
              accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
              feeAmount: getAmountWithSymbol(minRequiredBalance, SOL_MINT.toBase58()),
            })}
          </h4>
        ) : (
          <h4 className='font-bold mb-3'>
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
        )}
        {!isBusy ? (
          <div className='row two-col-ctas mt-3 transaction-progress p-2'>
            <div className='col-12'>
              <Button
                block
                type='text'
                shape='round'
                size='middle'
                className={`center-text-in-btn thin-stroke ${isBusy ? 'inactive' : ''}`}
                onClick={() => (isError(transactionStatus.currentOperation) ? onAcceptModal() : onCloseModal())}
              >
                {isError(transactionStatus.currentOperation) &&
                transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure
                  ? t('general.retry')
                  : t('general.cta-close')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{t('multisig.transfer-tokens.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}
    >
      <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Proposal title */}
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

            {/* From */}
            <div className='mb-3'>
              <div className='form-label'>From</div>
              <div className={`well ${(fromVault?.publicAddress as string) ? 'disabled' : ''}`}>
                <input
                  id='token-address-field'
                  className='general-text-input'
                  autoComplete='off'
                  autoCorrect='off'
                  type='text'
                  readOnly
                  value={fromAddress}
                />
              </div>
            </div>

            {/* Send amount */}
            <div className='form-label'>{t('multisig.transfer-tokens.transfer-amount-label')}</div>
            <div className='well'>
              <div className='flex-fixed-left'>
                <div className='left'>
                  <span className='add-on simplelink'>
                    {selectedToken && (
                      <TokenDisplay
                        onClick={() => showDrawer()}
                        mintAddress={selectedToken.address}
                        name={selectedToken.name}
                        showCaretDown={true}
                        fullTokenInfo={selectedToken}
                      />
                    )}
                    {selectedToken && fromVault ? (
                      <div
                        className='token-max simplelink'
                        onKeyDown={() => {}}
                        onClick={() => {
                          consoleOut('setAmount:', fromVault.balance, 'blue');
                          setAmount(cutNumber(fromVault.balance as number, selectedToken.decimals));
                        }}
                      >
                        MAX
                      </div>
                    ) : null}
                  </span>
                </div>
                <div className='right'>
                  <input
                    className='general-text-input text-right'
                    inputMode='decimal'
                    autoComplete='off'
                    autoCorrect='off'
                    type='text'
                    onChange={onMintAmountChange}
                    pattern='^[0-9]*[.,]?[0-9]*$'
                    placeholder='0.0'
                    minLength={1}
                    maxLength={79}
                    spellCheck='false'
                    onPaste={pasteHandler}
                    value={amount}
                  />
                </div>
              </div>
              <div className='flex-fixed-right'>
                <div className='left inner-label'>
                  <span>{t('transactions.send-amount.label-right')}:</span>
                  <span>
                    {fromVault &&
                      getAmountWithSymbol(
                        fromVault.balance || 0,
                        fromVault.publicAddress as string,
                        true,
                        splTokenList,
                        fromVault.decimals,
                      )}
                  </span>
                </div>
                <div className='right inner-label'>
                  <span
                    className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                    onKeyDown={() => refreshPrices()}
                    onClick={() => refreshPrices()}
                  >
                    ~{amount ? toUsCurrency(getTokenPrice()) : '$0.00'}
                  </span>
                </div>
              </div>
              {selectedToken &&
                selectedToken.address === NATIVE_SOL.address &&
                (!tokenBalance || tokenBalance < MIN_SOL_BALANCE_REQUIRED) && (
                  <div className='form-field-error'>{t('transactions.validation.minimum-balance-required')}</div>
                )}
            </div>

            {/* Transfer to */}
            <div className='form-label'>{t('multisig.transfer-tokens.transfer-to-label')}</div>
            <div className='well'>
              <input
                id='mint-to-field'
                className='general-text-input'
                autoComplete='on'
                autoCorrect='off'
                type='text'
                onChange={onTransferToAddressChange}
                placeholder={t('multisig.transfer-tokens.transfer-to-placeholder')}
                required={true}
                spellCheck='false'
                value={to}
              />
              {to && !isValidAddress(to) && (
                <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
              )}
            </div>

            {/* explanatory paragraph */}
            <p>{t('multisig.multisig-assets.explanatory-paragraph')}</p>

            {validationStatus.severity === 'error' || validationStatus.severity === 'warning' ? (
              <div className='mb-2'>
                <ValidationStatusDisplay validationStatus={validationStatus} />
              </div>
            ) : null}

            {!isError(transactionStatus.currentOperation) && (
              <div className='col-12 p-0 mt-3'>
                <Button
                  className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                  block
                  type='primary'
                  shape='round'
                  size='large'
                  disabled={!isValidForm() || isTransferDisabled}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                      onAcceptModal();
                    } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                      onCloseModal();
                    } else {
                      refreshPage();
                    }
                  }}
                >
                  {getCtaButtonLabel()}
                </Button>
              </div>
            )}
          </>
        ) : (
          getAlternateStateModalContent()
        )}
      </div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle && (
          <div className='transaction-progress'>
            <Spin indicator={bigLoadingIcon} className='icon mt-0' />
            <h4 className='font-bold mb-1'>
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className='indication'>{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>

      {isTokenSelectorVisible && (
        <Drawer
          title={t('token-selector.modal-title')}
          placement='bottom'
          closable={true}
          onClose={onCloseTokenSelector}
          open={isTokenSelectorVisible}
          getContainer={false}
          style={{ position: 'absolute' }}
        >
          {renderTokenSelectorInner}
        </Drawer>
      )}
    </Modal>
  );
};
