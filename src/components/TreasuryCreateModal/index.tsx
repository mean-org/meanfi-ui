import React, { useCallback, useContext, useEffect } from 'react';
import { useState } from 'react';
import { Modal, Button, Spin, Drawer } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { AppStateContext } from '../../contexts/appstate';
import { TreasuryCreateOptions, TreasuryTypeOption } from '../../models/treasuries';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress, toUsCurrency } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees, TreasuryType } from '@mean-dao/money-streaming';
import { fetchAccountTokens, getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { Identicon } from '../Identicon';
import { TokenInfo } from '@solana/spl-token-registry';
import { TokenDisplay } from '../TokenDisplay';
import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { TextInput } from '../TextInput';
import { useAccountsContext } from '../../contexts/accounts';
import { useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { TokenListItem } from '../TokenListItem';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS } from '../../constants';
import { PublicKey } from '@solana/web3.js';
import { useSearchParams } from 'react-router-dom';
import { InputMean } from '../InputMean';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  selectedMultisig: MultisigInfo | undefined;
  multisigAccounts?: MultisigInfo[] | undefined;
  multisigAddress?: string;
}) => {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const {
    tokenList,
    userTokens,
    splTokenList,
    loadingPrices,
    accountAddress,
    transactionStatus,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshPrices,
  } = useContext(AppStateContext);
  const accounts = useAccountsContext();
  const connection = useConnection();
  const { connected, publicKey } = useWallet();
  const [multisigTitle, setMultisigTitle] = useState('');
  const [treasuryName, setTreasuryName] = useState('');
  const { treasuryOption, setTreasuryOption } = useContext(AppStateContext);
  const [localSelectedMultisig, setLocalSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [enableMultisigTreasuryOption, setEnableMultisigTreasuryOption] = useState(true);
  const [tokenFilter, setTokenFilter] = useState("");
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [userBalances, setUserBalances] = useState<any>();
  const [workingToken, setWorkingToken] = useState<TokenInfo | undefined>(undefined);
  const [workingTokenBalance, setWorkingTokenBalance] = useState<number>(0);

  const getTokenPrice = useCallback((amount: number) => {
    if (!workingToken) {
      return 0;
    }

    return amount * getTokenPriceBySymbol(workingToken.symbol);
  }, [workingToken, getTokenPriceBySymbol]);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById("token-search-streaming-account");
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  // Token selection
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);

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
  const updateTokenListByFilter = useCallback((searchString: string) => {

    if (!selectedList) {
      return;
    }

    const timeout = setTimeout(() => {

      const filter = (t: any) => {
        return (
          t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
          t.name.toLowerCase().includes(searchString.toLowerCase()) ||
          t.address.toLowerCase().includes(searchString.toLowerCase())
        );
      };

      const showFromList = !searchString 
        ? selectedList
        : selectedList.filter((t: any) => filter(t));

      setFilteredTokenList(showFromList);

    });

    return () => { 
      clearTimeout(timeout);
    }

  }, [selectedList]);

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  },[
    updateTokenListByFilter
  ]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const newValue = e.target.value;
    setTokenFilter(newValue);
    updateTokenListByFilter(newValue);

  },[
    updateTokenListByFilter
  ]);

  // When modal goes visible, preset the appropriate value for multisig treasury switch
  useEffect(() => {
    if (!props.multisigAccounts) { return; }
    if (props.isVisible && props.selectedMultisig) {
      setEnableMultisigTreasuryOption(true);
      setLocalSelectedMultisig(props.selectedMultisig);
    } else {
      setEnableMultisigTreasuryOption(false);
      setLocalSelectedMultisig(props.multisigAccounts[0]);
    }
  }, [
    props.isVisible,
    props.selectedMultisig,
    props.multisigAccounts,
  ]);

  // Automatically update all token balances and rebuild token list
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !userTokens || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {

      const balancesMap: any = {};
      const meanTokensCopy = new Array<TokenInfo>();
      const intersectedList = new Array<TokenInfo>();
      const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as TokenInfo[];

      // const pk = props.multisigAddress ? new PublicKey(props.multisigAddress) : publicKey;
      const pk = new PublicKey(accountAddress);

      fetchAccountTokens(connection, pk)
      .then(accTks => {
        if (accTks) {

          // Build meanTokensCopy including the MeanFi pinned tokens
          userTokensCopy.forEach(item => {
            meanTokensCopy.push(item);
          });

          // Now add all other items but excluding those in userTokens
          splTokenList.forEach(item => {
            if (!userTokens.includes(item)) {
              meanTokensCopy.push(item);
            }
          });

          // Create a list containing tokens for the user owned token accounts
          accTks.forEach(item => {
            balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
            const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
            const tokenFromMeanTokensCopy = meanTokensCopy.find(t => t.address === item.parsedInfo.mint);
            if (tokenFromMeanTokensCopy && !isTokenAccountInTheList) {
              intersectedList.push(tokenFromMeanTokensCopy);
            }
          });

          intersectedList.unshift(userTokensCopy[0]);
          balancesMap[userTokensCopy[0].address] = props.nativeBalance;
          intersectedList.sort((a, b) => {
            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
              return 1;
            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
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
          setSelectedList(userTokensCopy);
        }
      })
      .catch(error => {
        console.error(error);
        for (const t of userTokensCopy) {
          balancesMap[t.address] = 0;
        }
        setSelectedList(userTokensCopy);
      })
      .finally(() => setUserBalances(balancesMap));

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    accounts,
    publicKey,
    tokenList,
    userTokens,
    connection,
    splTokenList,
    accountAddress,
    props.nativeBalance,
    // props.multisigAddress,
  ]);

  // Pick a token if none selected
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (userBalances && !workingToken) {
        setWorkingToken(selectedList[0]);
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [selectedList, workingToken, userBalances]);

  // Keep token balance updated
  useEffect(() => {

    if (!connection || !publicKey || !userBalances || !workingToken) {
      setWorkingTokenBalance(0);
      return;
    }

    const timeout = setTimeout(() => {
      setWorkingTokenBalance(userBalances[workingToken.address]);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [connection, publicKey, workingToken, userBalances]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (tokenList && tokenList.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [
    tokenList,
    tokenFilter,
    filteredTokenList,
    updateTokenListByFilter
  ]);

  const onAcceptModal = () => {
    const options: TreasuryCreateOptions = {
      treasuryTitle: multisigTitle,
      treasuryName: treasuryName,
      token: workingToken as TokenInfo,
      treasuryType: treasuryOption ? treasuryOption.type : TreasuryType.Open,
      multisigId: enableMultisigTreasuryOption && localSelectedMultisig ? localSelectedMultisig.id.toBase58() : ''
    };
    props.handleOk(options);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setMultisigTitle('');
      setTreasuryName('');
    }, 50);
    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onTitleInputValueChange = (e: any) => {
    setMultisigTitle(e.target.value);
  }

  const onInputValueChange = (e: any) => {
    setTreasuryName(e.target.value);
  }

  const handleSelection = (option: TreasuryTypeOption) => {
    setTreasuryOption(option);
  }

  const renderSelectedMultisig = () => {
    return (
      props.selectedMultisig && (
        <div className={`transaction-list-row w-100 no-pointer`}>
          <div className="icon-cell">
            <Identicon address={props.selectedMultisig.id} style={{ width: "30", display: "inline-flex" }} />
          </div>
          <div className="description-cell">
            <div className="title text-truncate">{props.selectedMultisig.label}</div>
            <div className="subtitle text-truncate">{shortenAddress(props.selectedMultisig.id.toBase58(), 8)}</div>
          </div>
          <div className="rate-cell">
            <div className="rate-amount">
              {
                t('multisig.multisig-accounts.pending-transactions', {
                  txs: props.selectedMultisig.pendingTxsAmount
                })
              }
            </div>
          </div>
        </div>
      )
    )
  }

  const renderTokenList = (
    <>
      {(filteredTokenList && filteredTokenList.length > 0) && (
        filteredTokenList.map((t, index) => {
          const onClick = function () {
            setWorkingToken(t);
            consoleOut("token selected:", t.symbol, 'blue');
            onCloseTokenSelector();
          };

          if (index < MAX_TOKEN_LIST_ITEMS) {
            const balance = connected && userBalances && userBalances[t.address] > 0 ? userBalances[t.address] : 0;
            return (
              <TokenListItem
                key={t.address}
                name={t.name || CUSTOM_TOKEN_NAME}
                mintAddress={t.address}
                token={t}
                className={balance ? workingToken && workingToken.address === t.address ? "selected" : "simplelink" : "dimmed"}
                onClick={onClick}
                balance={balance}
                showZeroBalances={true}
              />
            );
          } else {
            return null;
          }
        })
      )}
    </>
  );

  const renderTokenSelectorInner = (
    <div className="token-selector-wrapper">
      <div className="token-search-wrapper">
        <TextInput
          id="token-search-streaming-account"
          value={tokenFilter}
          allowClear={true}
          extraClass="mb-2"
          onInputClear={onInputCleared}
          placeholder={t('token-selector.search-input-placeholder')}
          onInputChange={onTokenSearchInputChange} />
      </div>
      <div className="token-list">
        {filteredTokenList.length > 0 && renderTokenList}
        {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
          <TokenListItem
            key={tokenFilter}
            name={CUSTOM_TOKEN_NAME}
            mintAddress={tokenFilter}
            className={workingToken && workingToken.address === tokenFilter ? "selected" : "simplelink"}
            onClick={() => {
              const uknwnToken: TokenInfo = {
                address: tokenFilter,
                name: CUSTOM_TOKEN_NAME,
                chainId: 101,
                decimals: 6,
                symbol: '',
              };
              setWorkingToken(uknwnToken);
              consoleOut("token selected:", uknwnToken, 'blue');
              onCloseTokenSelector();
            }}
            balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
          />
        )}
      </div>
    </div>
  );

  const getQueryAccountType = useCallback(() => {
    let accountTypeInQuery: string | null = null;
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        return accountTypeInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const param = getQueryAccountType();

  return (
    <>
      <Modal
        className="mean-modal simple-modal"
        title={<div className="modal-title">{ t('treasuries.create-treasury.modal-title')}</div>}
        // title={<div className="modal-title">{param === "multisig" ? "Initiate streaming account" : t('treasuries.create-treasury.modal-title')}</div>}
        maskClosable={false}
        footer={null}
        visible={props.isVisible}
        onOk={onAcceptModal}
        onCancel={onCloseModal}
        afterClose={onAfterClose}
        width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

        <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

          {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
            <>
              {/* Proposal title */}
              {param === "multisig" && (
                <div className="mb-3">
                  <div className="form-label">{t('multisig.proposal-modal.title')}</div>
                  <InputMean
                    id="proposal-title-field"
                    name="Title"
                    className="w-100 general-text-input"
                    onChange={onTitleInputValueChange}
                    placeholder="Add a proposal title (required)"
                    value={multisigTitle}
                  />
                </div>
              )}

              {/* Treasury name */}
              <div className="mb-3">
                <div className="form-label">{t('treasuries.create-treasury.treasury-name-input-label')}</div>
                <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                  <div className="flex-fixed-right">
                    <div className="left">
                      <input
                        id="treasury-name-field"
                        className="w-100 general-text-input"
                        autoComplete="off"
                        autoCorrect="off"
                        type="text"
                        maxLength={32}
                        onChange={onInputValueChange}
                        placeholder={t('treasuries.create-treasury.treasury-name-placeholder')}
                        value={treasuryName}
                      />
                    </div>
                  </div>
                  <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
                </div>
              </div>

              <div className="form-label">{t('treasuries.create-treasury.treasury-token-label')}</div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-left">
                  <div className="left">
                    <span className="add-on simplelink">
                      {workingToken && (
                        <TokenDisplay onClick={showTokenSelector}
                          mintAddress={workingToken.address}
                          name={workingToken.name}
                          showCaretDown={true}
                          showName={workingToken.name === CUSTOM_TOKEN_NAME ? true : false}
                          fullTokenInfo={workingToken}
                        />
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex-fixed-right">
                  <div className="left inner-label">
                    <span>{t('add-funds.label-right')}:</span>
                    <span>
                      {`${workingTokenBalance && workingToken
                          ? getTokenAmountAndSymbolByTokenAddress(
                              workingTokenBalance,
                              workingToken.address,
                              true
                            )
                          : "0"
                      }`}
                    </span>
                  </div>
                  <div className="right inner-label">
                    <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                      ~{workingTokenBalance
                        ? toUsCurrency(getTokenPrice(workingTokenBalance))
                        : "$0.00"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Treasury type selector */}
              <div className="items-card-list vertical-scroll">
                {TREASURY_TYPE_OPTIONS.map(option => {
                  return (
                    <div key={`${option.translationId}`} className={`item-card ${option.type === treasuryOption?.type
                      ? "selected"
                      : option.disabled
                        ? "disabled"
                        : ""
                    }`}
                    onClick={() => {
                      if (!option.disabled) {
                        handleSelection(option);
                      }
                    }}>
                      <div className="checkmark"><CheckOutlined /></div>
                      <div className="item-meta">
                        <div className="item-name">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-name`)}</div>
                        <div className="item-description">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-description`)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Multisig Treasury checkbox */}
              {
                // (!props.selectedMultisig && props.multisigAccounts.length > 0) && (
                //   <div className="mb-2 flex-row align-items-center">
                //     <span className="form-label w-auto mb-0">{t('treasuries.create-treasury.multisig-treasury-switch-label')}</span>
                //     {/* <a className="simplelink" href="https://docs.meanfi.com/" target="_blank" rel="noopener noreferrer">
                //       <Button
                //         className="info-icon-button"
                //         type="default"
                //         shape="circle">
                //         <InfoCircleOutlined />
                //       </Button>
                //     </a> */}
                //     <Radio.Group className="ml-2" onChange={onCloseTreasuryOptionChanged} value={enableMultisigTreasuryOption}>
                //       <Radio value={true}>{t('general.yes')}</Radio>
                //       <Radio value={false}>{t('general.no')}</Radio>
                //     </Radio.Group>
                //   </div>
                // )
              }

              {(enableMultisigTreasuryOption && props.multisigAccounts && props.multisigAccounts.length > 0) && (
                <>
                  <div className="mb-3">
                    <div className="form-label">{t('treasuries.create-treasury.multisig-selector-label')}</div>
                    <div className="well">
                      {/* {renderMultisigSelectItems()} */}
                      {renderSelectedMultisig()}
                    </div>
                  </div>
                </>
              )}

            </>
          ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
            <>
              <div className="transaction-progress">
                <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                <h4 className="font-bold">{t('treasuries.create-treasury.success-message')}</h4>
              </div>
            </>
          ) : (
            <>
              <div className="transaction-progress p-0">
                <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t('transactions.status.tx-start-failure', {
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        props.nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
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

        <div className={props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
          {props.isBusy && transactionStatus !== TransactionStatus.Iddle && (
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

        {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
          <div className="row two-col-ctas mt-3 transaction-progress p-0">
            {isError(transactionStatus.currentOperation) ? (
              <div className="col-12">
                <Button
                  block
                  type="text"
                  shape="round"
                  size="middle"
                  className={props.isBusy ? 'inactive' : ''}
                  onClick={onAcceptModal}>
                  {t('general.retry')}
                </Button>
              </div>
            ) : (
              <div className="col-12">
                <Button
                  className={props.isBusy ? 'inactive' : ''}
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  disabled={!treasuryName}
                  onClick={() => {
                    if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                      onAcceptModal();
                    // } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                    //   onCloseModal();
                    } else {
                      refreshPage();
                    }
                  }}>
                  {/* {props.isBusy && (
                    <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                  )} */}
                  {props.isBusy
                    ? t('treasuries.create-treasury.main-cta-busy')
                    : transactionStatus.currentOperation === TransactionStatus.Iddle
                      ? enableMultisigTreasuryOption && props.multisigAccounts && props.multisigAccounts.length > 0
                        ? (param === "multisig" ? "Submit proposal" : t('treasuries.create-treasury.create-multisig-cta'))
                        : (param === "multisig" ? "Submit proposal" : t('treasuries.create-treasury.main-cta'))
                      : t('general.refresh')
                  }
                </Button>
              </div>
            )}
          </div>
        )}

        <Drawer
          title={t('token-selector.modal-title')}
          placement="bottom"
          closable={true}
          onClose={onCloseTokenSelector}
          visible={isTokenSelectorVisible}
          getContainer={false}
          style={{ position: 'absolute' }}>
          {renderTokenSelectorInner}
        </Drawer>
      </Modal>
    </>
  );
};
