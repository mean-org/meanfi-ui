import React, { useCallback, useContext, useEffect, useState } from 'react';
import './style.scss';
import { Modal, Button, Spin, Drawer } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress } from '../../middleware/ui';
import { isError } from '../../middleware/transactions';
import { NATIVE_SOL_MINT } from '../../middleware/ids';
import { cutNumber, fetchAccountTokens, formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber, shortenAddress } from '../../middleware/utils';
import { getNetworkIdByEnvironment, useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AccountInfo, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { MintLayout } from '@solana/spl-token';
import { MAX_TOKEN_LIST_ITEMS, MEAN_MULTISIG_ACCOUNT_LAMPORTS, MIN_SOL_BALANCE_REQUIRED } from '../../constants';
import { UserTokenAccount } from '../../models/transactions';
import { InputMean } from '../InputMean';
import { TokenDisplay } from '../TokenDisplay';
import { TokenInfo } from '@solana/spl-token-registry';
import { useAccountsContext } from '../../contexts/accounts';
import { NATIVE_SOL } from '../../constants/tokens';
import { TextInput } from '../TextInput';
import { TokenListItem } from '../TokenListItem';
import { environment } from '../../environments/environment';
import { MultisigInfo, MultisigTransactionFees } from '@mean-dao/mean-multisig-sdk';

// const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigTransferTokensModal = (props: {
  assets: UserTokenAccount[];
  handleClose: any;
  handleOk: any;
  isBusy: boolean;
  isVisible: boolean;
  nativeBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  selectedVault: UserTokenAccount | undefined;
  transactionFees: MultisigTransactionFees;
}) => {
  const {
    assets,
    handleClose,
    handleOk,
    isBusy,
    isVisible,
    nativeBalance,
    selectedMultisig,
    selectedVault,
    transactionFees,
  } = props;
  const { t } = useTranslation('common');
  const accounts = useAccountsContext();
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const {
    tokenList,
    userTokens,
    splTokenList,
    loadingPrices,
    transactionStatus,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setEffectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);

  const [proposalTitle, setProposalTitle] = useState("");
  const [fromVault, setFromVault] = useState<UserTokenAccount>();
  const [fromAddress, setFromAddress] = useState('');
  const [fromMint, setFromMint] = useState<any>();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  const [userBalances, setUserBalances] = useState<any>();
  const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [tokenFilter, setTokenFilter] = useState("");
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
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
      const totalMultisigFee = transactionFees.multisigFee + (MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL);
      const minRequired = totalMultisigFee + transactionFees.rentExempt + transactionFees.networkFee;
      consoleOut('Min required balance:', minRequired, 'blue');
      setMinRequiredBalance(minRequired);
    }
  }, [isVisible, transactionFees]);

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

  const getTokenPrice = useCallback(() => {
    if (!amount || !selectedToken) {
      return 0;
    }
    const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

    return parseFloat(amount) * price;
  }, [amount, selectedToken, getTokenPriceByAddress, getTokenPriceBySymbol]);

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById("token-search-otp");
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

    if (!publicKey || !userTokens || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {

      const balancesMap: any = {};
      const pk = selectedMultisig ? selectedMultisig.authority : publicKey;

      fetchAccountTokens(connection, pk)
      .then(accTks => {
        if (accTks) {

          const meanTokensCopy = new Array<TokenInfo>();
          const intersectedList = new Array<TokenInfo>();
          const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as TokenInfo[];

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
          balancesMap[userTokensCopy[0].address] = nativeBalance;
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
    }

  }, [accounts, connection, nativeBalance, publicKey, selectedMultisig, splTokenList, tokenList, userTokens]);

    // Reset results when the filter is cleared
    useEffect(() => {
      if (selectedList && selectedList.length && filteredTokenList.length === 0 && !tokenFilter) {
          updateTokenListByFilter(tokenFilter);
      }
  }, [
      selectedList,
      tokenFilter,
      filteredTokenList,
      updateTokenListByFilter
  ]);

  // Keep token balance updated
  useEffect(() => {

    if (!connection || !publicKey || !userBalances || !selectedToken) {
      setSelectedTokenBalance(0);
      return;
    }

    const timeout = setTimeout(() => {
      setSelectedTokenBalance(userBalances[selectedToken.address]);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [connection, publicKey, selectedToken, userBalances]);

  // Resolves fromVault
  useEffect(() => {

    if (!isVisible || !connection || !publicKey || !assets) {
      return;
    }

    const timeout = setTimeout(() => {
      const asset = selectedVault || assets[0];
      consoleOut('From asset:', asset, 'blue');
      setFromVault(asset);
      setFromAddress(asset.publicAddress || '');
    });

    return () => clearTimeout(timeout);

  }, [connection, assets, isVisible, selectedVault, publicKey]);

  // Resolves fromMint
  useEffect(() => {

    if (!isVisible || !connection || !publicKey || !fromVault) {
      return;
    }

    const timeout = setTimeout(() => {
      connection.getAccountInfo(new PublicKey(fromVault?.address as string))
        .then(info => {
          if (info && !info.owner.equals(new PublicKey("NativeLoader1111111111111111111111111111111"))) {
            console.log('fromVault', fromVault);
            console.log('owner', info.owner.toBase58());
            consoleOut('info:', info, 'blue');
            const mintInfo = MintLayout.decode(info.data);
            setFromMint(mintInfo);
          }
        })
        .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [connection, fromVault, isVisible, publicKey]);

  const onAcceptModal = () => {
    handleOk({
      title: proposalTitle,
      from: fromVault ? fromVault.publicAddress as string : '',
      amount: +amount,
      to: to
    });
  }

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    handleClose();
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  const onMintToAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTo(trimmedValue);
  }

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

    if (newValue === null || newValue === undefined || newValue === "") {
      setAmount('');
    } else if (isValidNumber(newValue)) {
      setAmount(newValue);
    }
  };

  const isValidForm = (): boolean => {
    return (
      proposalTitle &&
      fromVault &&
      to &&
      isValidAddress(fromVault.publicAddress) &&
      isValidAddress(to) &&
      amount &&
      +amount > 0 &&
      +amount <= (fromVault.balance || 0)
    ) ? true : false;
  }

  const getTransactionStartButtonLabel = () => {
    return !proposalTitle
      ? "Add a proposal title"
      : !amount || +amount === 0
        ? 'Enter amount'
        : fromVault && fromVault.balance === 0
          ? 'No balance'
          : (amount && fromVault && +amount > (fromVault.balance || 0))
            ? 'Amount exceeded'
            : !to
              ? 'Enter an address'
              : to && !isValidAddress(to)
                ? 'Invalid address'
                : 'Sign proposal'
  }

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  }

  // Handler paste clipboard data
  const pasteHandler = (e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(",", "")
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    consoleOut("only numbers and dot", onlyNumbersAndDot);
    
    setAmount(onlyNumbersAndDot.trim());
  }

  const onCloseTokenSelector = useCallback(() => {
    hideDrawer();
    // Reset token on errors (decimals: -1 or -2)
    if (selectedToken && selectedToken.decimals < 0) {
      // tokenChanged(undefined);
      setSelectedToken(undefined);
    }
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [selectedToken, setSelectedToken, tokenFilter]);

  const renderTokenList = (
    <>
      {(filteredTokenList && filteredTokenList.length > 0) && (
        filteredTokenList.map((t, index) => {
          const onClick = function () {
            // tokenChanged(t);
            setSelectedToken(t);

            consoleOut("token selected:", t.symbol, 'blue');
            const price = getTokenPriceByAddress(t.address) || getTokenPriceBySymbol(t.symbol);
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
                className={balance ? selectedToken && selectedToken.address === t.address ? "selected" : "simplelink" : "dimmed"}
                onClick={onClick}
                balance={balance}
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
          id="token-search-otp"
          value={tokenFilter}
          allowClear={true}
          extraClass="mb-2"
          onInputClear={onInputCleared}
          placeholder={t('token-selector.search-input-placeholder')}
          error={
            tokenFilter && selectedToken && selectedToken.decimals === -1
              ? 'Account not found'
              : tokenFilter && selectedToken && selectedToken.decimals === -2
                ? 'Account is not a token mint'
                : ''
          }
          onInputChange={onTokenSearchInputChange} />
      </div>
      <div className="token-list">
        {filteredTokenList.length > 0 && renderTokenList}
        {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
          <TokenListItem
            key={tokenFilter}
            name="Unknown token"
            mintAddress={tokenFilter}
            className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
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
                if ((accountInfo as any).data["program"] &&
                    (accountInfo as any).data["program"] === "spl-token" &&
                    (accountInfo as any).data["parsed"] &&
                    (accountInfo as any).data["parsed"]["type"] &&
                    (accountInfo as any).data["parsed"]["type"] === "mint") {
                  decimals = (accountInfo as any).data["parsed"]["info"]["decimals"];
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
              // tokenChanged(t);
              setSelectedToken(uknwnToken);
              if (userBalances && userBalances[address]) {
                setSelectedTokenBalance(userBalances[address]);
              }
              consoleOut("token selected:", uknwnToken, 'blue');
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

  return (
    <>
      <Modal
        className="mean-modal simple-modal"
        title={<div className="modal-title">{t('multisig.transfer-tokens.modal-title')}</div>}
        maskClosable={false}
        footer={null}
        visible={isVisible}
        onOk={onAcceptModal}
        onCancel={onCloseModal}
        width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

        <div className={!isBusy ? "panel1 show" : "panel1 hide"}>

          {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
            <>
              {/* Proposal title */}
              <div className="mb-3">
                <div className="form-label">{t('multisig.proposal-modal.title')}</div>
                <InputMean
                  id="proposal-title-field"
                  name="Title"
                  className="w-100 general-text-input"
                  onChange={onTitleInputValueChange}
                  placeholder="Add a proposal title (required)"
                  value={proposalTitle}
                />
              </div>

              {/* From */}
              <div className="mb-3">
                <div className="form-label">From</div>
                <div className={`well ${fromVault?.publicAddress as string ? 'disabled' : ''}`}>
                  <input id="token-address-field"
                    className="general-text-input"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    readOnly
                    value={fromAddress}
                  />
                </div>
              </div>

              {/* Send amount */}
              <div className="form-label">{t('multisig.transfer-tokens.transfer-amount-label')}</div>
              <div className="well">
                <div className="flex-fixed-left">
                  <div className="left">
                    <span className="add-on simplelink">
                      {selectedToken && (
                        <TokenDisplay onClick={() => showDrawer()}
                          mintAddress={selectedToken.address}
                          name={selectedToken.name}
                          showCaretDown={true}
                          fullTokenInfo={selectedToken}
                        />
                      )}
                      {selectedToken && fromVault ? (
                        <div className="token-max simplelink" onClick={() => {
                          setAmount(cutNumber(fromVault.balance as number, selectedToken.decimals));
                          }}>
                          MAX
                        </div>
                      ) : null}
                    </span>
                  </div>
                  <div className="right">
                    <input
                      className="general-text-input text-right"
                      inputMode="decimal"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      onChange={onMintAmountChange}
                      pattern="^[0-9]*[.,]?[0-9]*$"
                      placeholder="0.0"
                      minLength={1}
                      maxLength={79}
                      spellCheck="false"
                      onPaste={pasteHandler}
                      value={amount}
                    />
                  </div>
                </div>
                <div className="flex-fixed-right">
                  <div className="left inner-label">
                    <span>{t('transactions.send-amount.label-right')}:</span>
                    <span>
                      {fromVault && (
                        getTokenAmountAndSymbolByTokenAddress(
                          fromVault.balance || 0,
                          fromVault ? fromVault.publicAddress as string : '',
                          true
                        )
                      )}
                    </span>
                  </div>
                  
                  <div className="right inner-label">
                    <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                      ~${amount
                        ? formatAmount(getTokenPrice(), 2)
                        : "0.00"}
                    </span>
                  </div>
                </div>
                {selectedToken && selectedToken.address === NATIVE_SOL.address && (!tokenBalance || tokenBalance < MIN_SOL_BALANCE_REQUIRED) && (
                  <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
                )}
              </div>

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

              {/* explanatory paragraph */}
              <p>{t("multisig.multisig-assets.explanatory-paragraph")}</p>

              {!isError(transactionStatus.currentOperation) && (
                <div className="col-12 p-0 mt-3">
                  <Button
                    className={`center-text-in-btn ${isBusy ? 'inactive' : ''}`}
                    block
                    type="primary"
                    shape="round"
                    size="large"
                    disabled={!isValidForm()}
                    onClick={() => {
                      if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                        onAcceptModal();
                      } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                        onCloseModal();
                      } else {
                        refreshPage();
                      }
                    }}>
                    {isBusy
                      ? t('multisig.transfer-tokens.main-cta-busy')
                      : transactionStatus.currentOperation === TransactionStatus.Iddle
                        ? getTransactionStartButtonLabel()
                        : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                          ? t('general.cta-finish')
                          : t('general.refresh')
                    }
                  </Button>
                </div>
              )}
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
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
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
                {!(isBusy && transactionStatus !== TransactionStatus.Iddle) && (
                  <div className="row two-col-ctas mt-3 transaction-progress p-2">
                    <div className="col-12">
                      <Button
                        block
                        type="text"
                        shape="round"
                        size="middle"
                        className={`center-text-in-btn thin-stroke ${isBusy ? 'inactive' : ''}`}
                        onClick={() => isError(transactionStatus.currentOperation)
                          ? onAcceptModal()
                          : onCloseModal()}>
                        {(isError(transactionStatus.currentOperation) && transactionStatus.currentOperation !== TransactionStatus.TransactionStartFailure)
                          ? t('general.retry')
                          : t('general.cta-close')
                        }
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        <div className={isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
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

        {isTokenSelectorVisible && (
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
        )}

      </Modal>
    </>
  );
};
