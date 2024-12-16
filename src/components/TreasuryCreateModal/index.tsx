import { CheckOutlined, CopyOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import type { TransactionFees } from '@mean-dao/money-streaming';
import { AccountType } from '@mean-dao/payment-streaming';
import { type AccountInfo, type ParsedAccountData, PublicKey } from '@solana/web3.js';
import { Button, Drawer, Modal, Spin } from 'antd';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { TREASURY_TYPE_OPTIONS } from 'src/app-constants/treasury-type-options';
import { Identicon } from 'src/components/Identicon';
import { InputMean } from 'src/components/InputMean';
import { openNotification } from 'src/components/Notifications';
import { TextInput } from 'src/components/TextInput';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { TokenListItem } from 'src/components/TokenListItem';
import { AppStateContext } from 'src/contexts/appstate';
import { getNetworkIdByEnvironment, useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { environment } from 'src/environments/environment';
import { getDecimalsFromAccountInfo } from 'src/middleware/accountInfoGetters';
import { SOL_MINT } from 'src/middleware/ids';
import { isError } from 'src/middleware/transactions';
import { consoleOut, copyText, getTransactionOperationDescription, isValidAddress } from 'src/middleware/ui';
import { getAmountWithSymbol, shortenAddress } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import { TransactionStatus } from 'src/models/enums';
import type { TreasuryCreateOptions, TreasuryTypeOption } from 'src/models/treasuries';
import { useGetTokensWithBalances } from 'src/query-hooks/accountTokens';
import type { LooseObject } from 'src/types/LooseObject';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface Props {
  handleOk: (options: TreasuryCreateOptions) => void;
  handleClose: () => void;
  isBusy: boolean;
  isVisible: boolean;
  multisigAccounts?: MultisigInfo[];
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  transactionFees: TransactionFees;
}

export const TreasuryCreateModal = ({
  handleClose,
  handleOk,
  isBusy,
  isVisible,
  multisigAccounts,
  nativeBalance,
  selectedMultisig,
  transactionFees,
}: Props) => {
  const { t } = useTranslation('common');
  const { tokenList, selectedAccount, transactionStatus, setTransactionStatus } = useContext(AppStateContext);
  const connection = useConnection();
  const { connected, publicKey } = useWallet();
  const [proposalTitle, setProposalTitle] = useState('');
  const [treasuryName, setTreasuryName] = useState('');
  const { treasuryOption, setTreasuryOption } = useContext(AppStateContext);
  const [localSelectedMultisig, setLocalSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [enableMultisigTreasuryOption, setEnableMultisigTreasuryOption] = useState(true);
  const [tokenFilter, setTokenFilter] = useState('');
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [userBalances, setUserBalances] = useState<LooseObject>();
  const [workingToken, setWorkingToken] = useState<TokenInfo | undefined>(undefined);

  const { data: tokensWithBalances } = useGetTokensWithBalances(publicKey?.toBase58(), true);

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById('token-search-streaming-account');
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  // Token selection
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (address: any) => {
      if (copyText(address.toString())) {
        openNotification({
          description: t('notifications.account-address-copied-message'),
          type: 'info',
        });
      } else {
        openNotification({
          description: t('notifications.account-address-not-copied-message'),
          type: 'error',
        });
      }
    },
    [t],
  );

  const showTokenSelector = useCallback(() => {
    setIsTokenSelectorVisible(true);
    autoFocusInput();
  }, [autoFocusInput]);

  const onCloseTokenSelector = useCallback(() => {
    setIsTokenSelectorVisible(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [tokenFilter]);

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

        const preFilterSol = selectedList.filter(t => t.address !== NATIVE_SOL.address);
        const showFromList = !searchString ? preFilterSol : preFilterSol.filter(t => filter(t));

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
    (value: string) => {
      const newValue = value.trim();
      setTokenFilter(newValue);
      updateTokenListByFilter(newValue);
    },
    [updateTokenListByFilter],
  );

  // When modal goes visible, preset the appropriate value for multisig treasury switch
  useEffect(() => {
    if (!multisigAccounts) {
      return;
    }
    if (isVisible && selectedMultisig) {
      setEnableMultisigTreasuryOption(true);
      setLocalSelectedMultisig(selectedMultisig);
    } else {
      setEnableMultisigTreasuryOption(false);
      setLocalSelectedMultisig(multisigAccounts[0]);
    }
  }, [isVisible, selectedMultisig, multisigAccounts]);

  // Automatically update all token balances and rebuild token list
  useEffect(() => {
    if (!tokensWithBalances) {
      return;
    }

    setSelectedList(tokensWithBalances.tokenList);
    setUserBalances(tokensWithBalances.balancesMap);
  }, [tokensWithBalances]);

  // Pick a token if none selected
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (userBalances && !workingToken) {
        setWorkingToken(selectedList[0]);
      }
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [selectedList, workingToken, userBalances]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (tokenList?.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [tokenList, tokenFilter, filteredTokenList, updateTokenListByFilter]);

  const onAcceptModal = () => {
    const options: TreasuryCreateOptions = {
      treasuryTitle: proposalTitle,
      treasuryName,
      token: workingToken as TokenInfo,
      treasuryType: treasuryOption ? treasuryOption.type : AccountType.Open,
      multisigId: enableMultisigTreasuryOption && localSelectedMultisig ? localSelectedMultisig.id.toBase58() : '',
    };
    handleOk(options);
  };

  const onCloseModal = () => {
    handleClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setProposalTitle('');
      setTreasuryName('');
    }, 50);
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  // Validation
  const isValidForm = (): boolean => !!treasuryName;

  // Validation if multisig
  const isValidFormMultisig = (): boolean => {
    return !!(treasuryName && proposalTitle);
  };

  const getTransactionStartButtonLabel = () => {
    return !treasuryName ? 'Add an account name' : t('treasuries.create-treasury.main-cta');
  };

  const getTransactionStartButtonLabelMultisig = () => {
    if (!proposalTitle) {
      return 'Add a proposal title';
    }
    if (!treasuryName) {
      return 'Add an account name';
    }

    return 'Sign proposal';
  };

  const onTitleInputValueChange = (value: string) => {
    setProposalTitle(value);
  };

  const onInputValueChange = (value: string) => {
    setTreasuryName(value);
  };

  const handleSelection = (option: TreasuryTypeOption) => {
    setTreasuryOption(option);
  };

  const renderSelectedMultisig = () => {
    return (
      selectedMultisig && (
        <div className={'transaction-list-row w-100 no-pointer'}>
          <div className='icon-cell'>
            <Identicon address={selectedMultisig.id} style={{ width: '30', display: 'inline-flex' }} />
          </div>
          <div className='description-cell'>
            <div className='title text-truncate'>{selectedMultisig.label}</div>
            <div className='subtitle text-truncate'>{shortenAddress(selectedMultisig.id.toBase58(), 8)}</div>
          </div>
          <div className='rate-cell'>
            <div className='rate-amount'>
              {t('multisig.multisig-accounts.pending-transactions', {
                txs: selectedMultisig.pendingTxsAmount,
              })}
            </div>
          </div>
        </div>
      )
    );
  };

  //#region Token selector - render methods

  const getTokenListItemClass = (item: TokenInfo) => {
    return workingToken?.address === item.address ? 'selected' : 'simplelink';
  };

  const renderTokenList = () => {
    return filteredTokenList.map((t, index) => {
      const onClick = () => {
        setWorkingToken(t);

        consoleOut('token selected:', t, 'blue');
        onCloseTokenSelector();
      };

      if (index < MAX_TOKEN_LIST_ITEMS) {
        const balance = userBalances ? (userBalances[t.address] as number) : 0;
        return (
          <TokenListItem
            key={t.address}
            name={t.name || CUSTOM_TOKEN_NAME}
            mintAddress={t.address}
            token={t}
            className={balance ? getTokenListItemClass(t) : 'hidden'}
            onClick={onClick}
            balance={balance}
            showUsdValues={true}
          />
        );
      }

      return null;
    });
  };

  const getSelectedTokenError = () => {
    if (tokenFilter && workingToken) {
      if (workingToken.decimals === -1) {
        return 'Account not found';
      }
      if (workingToken.decimals === -2) {
        return 'Account is not a token mint';
      }
    }

    return undefined;
  };

  const getBalanceForTokenFilter = () => {
    return connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0;
  };

  const renderTokenSelectorInner = () => {
    return (
      <div className='token-selector-wrapper'>
        <div className='token-search-wrapper'>
          <TextInput
            id='token-search-streaming-account'
            value={tokenFilter}
            allowClear={true}
            extraClass='mb-2'
            onInputClear={onInputCleared}
            placeholder={t('token-selector.search-input-placeholder')}
            error={getSelectedTokenError()}
            onInputChange={onTokenSearchInputChange}
          />
        </div>
        <div className='token-list'>
          {filteredTokenList.length > 0 && renderTokenList()}
          {tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0 && (
            <TokenListItem
              key={tokenFilter}
              name={CUSTOM_TOKEN_NAME}
              mintAddress={tokenFilter}
              className={workingToken && workingToken.address === tokenFilter ? 'selected' : 'simplelink'}
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
                decimals = getDecimalsFromAccountInfo(accountInfo, -1);
                const unknownToken: TokenInfo = {
                  address,
                  name: CUSTOM_TOKEN_NAME,
                  chainId: getNetworkIdByEnvironment(environment),
                  decimals,
                  symbol: `[${shortenAddress(address)}]`,
                };
                setWorkingToken(unknownToken);
                consoleOut('token selected:', unknownToken, 'blue');
                // Do not close on errors (-1 or -2)
                if (decimals >= 0) {
                  onCloseTokenSelector();
                }
              }}
              balance={getBalanceForTokenFilter()}
            />
          )}
        </div>
      </div>
    );
  };
  //#endregion

  return (
    <>
      <Modal
        className='mean-modal simple-modal'
        title={
          <div className='modal-title'>
            {isMultisigContext ? 'Propose streaming account' : t('treasuries.create-treasury.modal-title')}
          </div>
        }
        maskClosable={false}
        footer={null}
        open={isVisible}
        onOk={onAcceptModal}
        onCancel={onCloseModal}
        afterClose={onAfterClose}
        width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Idle ? 380 : 480}
      >
        <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
          {transactionStatus.currentOperation === TransactionStatus.Idle ? (
            <>
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

              {/* Treasury name */}
              <div className='mb-3'>
                <div className='form-label'>{t('treasuries.create-treasury.treasury-name-input-label')}</div>
                <div className={`well ${isBusy ? 'disabled' : ''}`}>
                  <div className='flex-fixed-right'>
                    <div className='left'>
                      <input
                        id='treasury-name-field'
                        className='w-100 general-text-input'
                        autoComplete='off'
                        autoCorrect='off'
                        type='text'
                        maxLength={32}
                        onChange={e => onInputValueChange(e.target.value)}
                        placeholder={t('treasuries.create-treasury.treasury-name-placeholder')}
                        value={treasuryName}
                      />
                    </div>
                  </div>
                  <div className='form-field-hint'>I.e. "My company payroll", "Seed round vesting", etc.</div>
                </div>
              </div>

              <div className='form-label'>{t('treasuries.create-treasury.treasury-token-label')}</div>
              <div className={`well ${isBusy ? 'disabled' : ''} pt-2 pb-2`}>
                <div className='flex-fixed-left'>
                  <div className='left'>
                    <span className='add-on simplelink'>
                      {workingToken && (
                        <TokenDisplay
                          onClick={showTokenSelector}
                          mintAddress={workingToken.address}
                          name={workingToken.name}
                          showCaretDown={true}
                          nameInfoLabel={true}
                          fullTokenInfo={workingToken}
                        />
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Treasury type selector */}
              <div className='items-card-list vertical-scroll'>
                {TREASURY_TYPE_OPTIONS.map(option => {
                  return (
                    <div
                      key={`${option.translationId}`}
                      className={`item-card ${
                        option.type === treasuryOption?.type ? 'selected' : option.disabled ? 'disabled' : ''
                      }`}
                      onKeyDown={() => {}}
                      onClick={() => {
                        if (!option.disabled) {
                          handleSelection(option);
                        }
                      }}
                    >
                      <div className='checkmark'>
                        <CheckOutlined />
                      </div>
                      <div className='item-meta'>
                        <div className='item-name'>
                          {t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-name`)}
                        </div>
                        <div className='item-description'>
                          {t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-description`)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {enableMultisigTreasuryOption && multisigAccounts && multisigAccounts.length > 0 && (
                <>
                  <div className='mb-3'>
                    <div className='form-label'>{t('treasuries.create-treasury.multisig-selector-label')}</div>
                    <div className='well'>{renderSelectedMultisig()}</div>
                  </div>
                </>
              )}
            </>
          ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
            <>
              <div className='transaction-progress'>
                <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
                <h4 className='font-bold'>{t('treasuries.create-treasury.success-message')}</h4>
              </div>
            </>
          ) : (
            <>
              <div className='transaction-progress p-0'>
                <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className='mb-4'>
                    {!transactionStatus.customError ? (
                      t('transactions.status.tx-start-failure', {
                        accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                        feeAmount: getAmountWithSymbol(
                          transactionFees.blockchainFee + transactionFees.mspFlatFee,
                          SOL_MINT.toBase58(),
                        ),
                      })
                    ) : (
                      <>
                        {transactionStatus.customError.message ? (
                          <span>{transactionStatus.customError.message}</span>
                        ) : null}
                        {transactionStatus.customError.data ? (
                          <>
                            <span className='ml-1'>[{shortenAddress(transactionStatus.customError.data, 8)}]</span>
                            <div className='icon-button-container'>
                              <Button
                                type='default'
                                shape='circle'
                                size='middle'
                                icon={<CopyOutlined />}
                                onClick={() => copyAddressToClipboard(transactionStatus.customError.data)}
                              />
                            </div>
                          </>
                        ) : null}
                      </>
                    )}
                  </h4>
                ) : (
                  <h4 className='font-bold mb-3'>
                    {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                  </h4>
                )}
              </div>
            </>
          )}
        </div>

        <div
          className={
            isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle ? 'panel2 show' : 'panel2 hide'
          }
        >
          {isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle && (
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

        {!(isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle) && (
          <div className='row two-col-ctas mt-3 transaction-progress p-0'>
            {isError(transactionStatus.currentOperation) ? (
              <div className='col-12'>
                <Button
                  block
                  type='text'
                  shape='round'
                  size='large'
                  className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                  onClick={onAcceptModal}
                >
                  {t('general.retry')}
                </Button>
              </div>
            ) : (
              <div className='col-12'>
                <Button
                  className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                  block
                  type='primary'
                  shape='round'
                  size='large'
                  disabled={isMultisigContext ? !isValidFormMultisig() : !isValidForm()}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Idle) {
                      onAcceptModal();
                    } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                      onCloseModal();
                    } else {
                      refreshPage();
                    }
                  }}
                >
                  {isBusy
                    ? t('treasuries.create-treasury.main-cta-busy')
                    : transactionStatus.currentOperation === TransactionStatus.Idle
                      ? isMultisigContext
                        ? getTransactionStartButtonLabelMultisig()
                        : getTransactionStartButtonLabel()
                      : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                        ? t('general.cta-finish')
                        : t('general.refresh')}
                </Button>
              </div>
            )}
          </div>
        )}

        <Drawer
          title={t('token-selector.modal-title')}
          placement='bottom'
          closable={true}
          onClose={onCloseTokenSelector}
          open={isTokenSelectorVisible}
          getContainer={false}
        >
          {renderTokenSelectorInner()}
        </Drawer>
      </Modal>
    </>
  );
};
