import { Button, Modal, Row, Col, Spin } from "antd";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import { formatAmount, getComputedFees, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from "../../utils/utils";
import { Identicon } from "../Identicon";
import { ArrowDownOutlined, CheckOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { consoleOut, getTransactionOperationDescription, getTxFeeAmount } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { TokenInfo } from "@solana/spl-token-registry";
import { useAccountsContext } from "../../contexts/accounts";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees, findATokenAddress } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";
import { CoinInput } from "../CoinInput";
import { useSwappableTokens, useTokenMap } from "../../contexts/tokenList";
import { useMarket, useMarketContext, useRouteVerbose } from "../../contexts/market";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, USDC_MINT, USDT_MINT } from "../../utils/ids";
import { useReferral, useSwapContext, useSwapFair } from "../../contexts/swap";
import { encode } from "money-streaming/lib/utils";
import { TransactionStatus } from "../../models/enums";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { TextInput } from "../TextInput";
import { swap } from "../../utils/swap";
import "./style.less";
import { useMint } from "../../contexts/token";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const SwapUi = () => {

  const { t } = useTranslation("common");
  const { publicKey, wallet, connected } = useWallet();
  const connection = useConnection();
  const accounts = useAccountsContext();
  const {
    transactionStatus,
    previousWalletConnectState,
    setTransactionStatus,
    setPreviousWalletConnectState

  } = useContext(AppStateContext);

  const {
    fromMint,
    toMint,
    fromAmount,
    toAmount,
    slippage,
    isStrict,
    isClosingNewAccounts,
    setFromMint,
    setToMint,
    setFromAmount,
    setToAmount,
    swapToFromMints

  } = useSwapContext();

  const { swapClient, openOrders } = useMarketContext();
  const route = useRouteVerbose(fromMint, toMint);  
  const fromMintInfo = useMint(fromMint);
  const toMintInfo = useMint(toMint);
  const fromMarket = useMarket(route && route.markets ? route.markets[0] : undefined);
  const toMarket = useMarket(route && route.markets ? route.markets[1] : undefined);
  const tokenMap = useTokenMap();
  const referral = useReferral(fromMarket);
  const fair = useSwapFair();
  const quoteMint = fromMarket && fromMarket.quoteMintAddress ? fromMarket.quoteMintAddress : undefined;
  const quoteMintInfo = useMint(quoteMint);
  const { swappableTokens } = useSwappableTokens();
  const [tokenFilter, setTokenFilter] = useState("");
  const filter = tokenFilter.toLowerCase();
  const tokens = tokenFilter === ""
      ? swappableTokens
      : swappableTokens.filter((t) =>
          t.symbol.toLowerCase().startsWith(filter) ||
          t.name.toLowerCase().startsWith(filter) ||
          t.address.toLowerCase().startsWith(filter)        
      );

  // Added by YAF (Token balance)
  const [smallAmount, setSmallAmount] = useState(0);
  const [fromMintTokenBalance, setFromMintTokenBalance] = useState(0);
  const [toMintTokenBalance, setToMintTokenBalance] = useState(0);
  const [fetchingFromTokenBalance, setFetchingFromTokenBalance] = useState(false);
  const [fetchingToTokenBalance, setFetchingToTokenBalance] = useState(false);

  const getTokenAccountBalanceByAddress = useCallback(async (address: string): Promise<number> => {
    if (!address) return 0;
    const accountInfo = await connection.getAccountInfo(address.toPublicKey());
    if (!accountInfo) return 0;
    if (address === publicKey?.toBase58()) {
      return accountInfo.lamports / LAMPORTS_PER_SOL;
    }
    const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
    return tokenAmount.uiAmount || 0;
    
  }, [
    publicKey,
    connection
  ])

  // Refresh fromMint token balance
  const refreshFromTokenBalance = useCallback(async (mint?: PublicKey) => {
    setFetchingFromTokenBalance(true);
    const targetMint = mint || fromMint;
    if (targetMint.equals(NATIVE_SOL_MINT)) {
      getTokenAccountBalanceByAddress(publicKey?.toBase58() as string)
        .then(balance => {
          setFromMintTokenBalance(balance || 0);
          setFetchingFromTokenBalance(false);
        })
        .catch(() => setFetchingFromTokenBalance(false));
    } else {
      findATokenAddress(publicKey as PublicKey, targetMint)
        .then(value => {
          if (value) {
            getTokenAccountBalanceByAddress(value.toBase58())
              .then(balance => {
                setFromMintTokenBalance(balance);
                setFetchingFromTokenBalance(false);
              })
              .catch(() => setFetchingFromTokenBalance(false));
          } else {
            setFetchingFromTokenBalance(false);
          }
        })
        .catch(() => setFetchingFromTokenBalance(false));
    }
  }, [
    fromMint, 
    publicKey, 
    getTokenAccountBalanceByAddress
  ]);

  // Refresh toMint token balance
  const refreshToTokenBalance = useCallback(async (mint?: PublicKey) => {
    setFetchingToTokenBalance(true);
    const targetMint = mint || toMint;
    if (targetMint.equals(NATIVE_SOL_MINT)) {
      getTokenAccountBalanceByAddress(publicKey?.toBase58() as string)
        .then(balance => {
          setToMintTokenBalance(balance);
          setFetchingToTokenBalance(false);
        })
        .catch(() => setFetchingToTokenBalance(false));
    } else {
      findATokenAddress(publicKey as PublicKey, targetMint)
        .then(value => {
          if (value) {
            getTokenAccountBalanceByAddress(value.toBase58())
              .then(balance => {
                setToMintTokenBalance(balance);
                setFetchingToTokenBalance(false);
              })
              .catch(() => setFetchingToTokenBalance(false));
          } else {
            setFetchingToTokenBalance(false);
          }
        })
        .catch(() => setFetchingToTokenBalance(false));
    }
  }, [
    toMint,
    publicKey,
    getTokenAccountBalanceByAddress
  ]);

  // Automatically update fromMint token balance once
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (fromMint) {
      refreshFromTokenBalance(fromMint);
    } else {
      setFromMintTokenBalance(0);
    }
    
    setFetchingFromTokenBalance(false);

    return () => { }

  }, [
    publicKey,
    accounts,
    fromMint,
    fetchingFromTokenBalance,
    refreshFromTokenBalance
  ]);

  // Automatically update toMint token balance once
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (toMint) {
      refreshToTokenBalance(toMint);
    } else {
      setToMintTokenBalance(0);
    }

    setFetchingToTokenBalance(false);

    return () => { }

  }, [
    publicKey,
    accounts,
    toMint,
    fetchingToTokenBalance,
    refreshToTokenBalance
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState === connected) {
      return;
    }

    // User is connecting
    if (!previousWalletConnectState && connected) {
      consoleOut('Refreshing balances...', '', 'blue');
      refreshFromTokenBalance();
      refreshToTokenBalance();
      setPreviousWalletConnectState(true);
    } else if (previousWalletConnectState && !connected) {
      consoleOut('User is disconnecting...', '', 'blue');
      setFromMintTokenBalance(0);
      setToMintTokenBalance(0);
      setPreviousWalletConnectState(false);
    }

    return () => { };

  }, [
    connected, 
    publicKey, 
    previousWalletConnectState, 
    refreshToTokenBalance, 
    refreshFromTokenBalance, 
    setPreviousWalletConnectState
  ]);

  // FEES
  const [swapFees, setSwapFees] = useState<TransactionFees>({
    blockchainFee: 0,
    mspFlatFee: 0,
    mspPercentFee: 0,
  });

  // TODO: Update code to obtain the SWAP fees
  useEffect(() => {

    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.wrapSol);
    };

    if (!swapFees.blockchainFee) {
      getTransactionFees().then((values) => {
        setSwapFees(values);
        console.log("swapFees:", values);
      });
    }

  }, [
    connection,
    swapFees
  ]);

  const getFeeAmount = (amount: any): number => {
    return getTxFeeAmount(swapFees, parseFloat(amount));
  };

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(true);
    setTimeout(() => {
      const input = document.getElementById("token-search-input");
      if (input) {
        input.focus();
      }
    }, 250);
  }, []);

  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    setTokenFilter('');
  }, []);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
  const [swapRateFlipped, setSwapRateFlipped] = useState(false);

  // Event handling
  const handleSwapFromAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromAmount("");
      setSmallAmount(0);
    } else if (isValidNumber(newValue)) {
      setFromAmount(newValue, tokenMap.get(toMint.toBase58())?.decimals || 9);
      const minSwapSize = minimumSwapSize(parseFloat(newValue));
      setSmallAmount(minSwapSize);
    }
  };

  const handleSwapToAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setToAmount("");
    } else if (isValidNumber(e.target.value)) {
      setToAmount(newValue, tokenMap.get(fromMint.toBase58())?.decimals || 6);
    }
  };

  const onTokenSearchInputChange = (e: any) => {
    const newValue = e.target.value as string;
    setTokenFilter(newValue.trim());
  }

  // Validation

  // TODO: Review validation
  const isSwapAmountValid = (): boolean => {
    return (
      connected &&
      fair &&
      fromMintTokenBalance &&
      fromMint &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      parseFloat(fromAmount) >= smallAmount &&
      parseFloat(fromAmount) > getFeeAmount(fromAmount) &&
      parseFloat(fromAmount) - getFeeAmount(fromAmount) <= fromMintTokenBalance

    ) ? true : false;
  };

  const getMinimumSwapAmountLabel = () => {
    const from = tokenMap.get(fromMint.toBase58());
    const toSymbol = tokenMap.get(toMint.toBase58())?.symbol;

    return `${t('transactions.validation.minimum-swap-amount', {
      mintAmount: `${smallAmount} ${from?.symbol}`,
      toMint: `${toSymbol}`
    })}`;

  }

  const getTransactionStartButtonLabel = (): string => {

    if (parseFloat(fromAmount) < smallAmount) {
      return  getMinimumSwapAmountLabel();
    }

    return !connected
      ? t("transactions.validation.not-connected")
      : !fromMint || !fromMintTokenBalance
      ? t("transactions.validation.no-balance")
      : !fromAmount
      ? t("transactions.validation.no-amount")
      : parseFloat(fromAmount) > fromMintTokenBalance
      ? t("transactions.validation.amount-high")
      : t("transactions.validation.valid-approve")
  };

  const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
    return  source && destination &&
            source.name === destination.name &&
            source.address === destination.address
            ? true
            : false;
  }

  const flipMints = () => {
    const oldFrom = fromMint;
    const oldTo = toMint;
    swapToFromMints();
    setSwapRateFlipped(!swapRateFlipped);
    refreshFromTokenBalance(oldTo);
    refreshToTokenBalance(oldFrom);
  }

  const minimumSwapSize = (amount: number) => {
    
    if (!fromMarket) {
      return 0;
    }

    let result = 0;
    const fairAmount = fair || 1;
    const isSol = fromMint.equals(NATIVE_SOL_MINT) || toMint.equals(NATIVE_SOL_MINT);
    const isUSDX = 
      fromMint.equals(USDC_MINT) || 
      fromMint.equals(USDT_MINT) || 
      toMint.equals(USDC_MINT) || 
      toMint.equals(USDT_MINT);

    if (isSol) {
      result = fromMint.equals(NATIVE_SOL_MINT) ? fromMarket.minOrderSize : fromMarket.minOrderSize * fairAmount;
    } else if (isUSDX) {
      const market = toMarket ? toMarket : fromMarket;
      result = amount < (market.minOrderSize * fairAmount) ? (market.minOrderSize * fairAmount) : 0;
    } else {
      if (toMarket) {
        result = amount < (toMarket.minOrderSize * fairAmount) ? (toMarket.minOrderSize * fairAmount) : 0;
      } else {
        result = amount < (fromMarket.minOrderSize * fairAmount) ? (fromMarket.minOrderSize * fairAmount) : 0;
      }
    }

    const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
    const formattedResult = formatAmount(result, fromDecimals);
    result = parseFloat(formattedResult);

    return result;
  };

  const getSwap = async () => {

    if (!fromMint || !toMint || !fromMintInfo || !toMintInfo) {
      throw new Error("Unable to calculate mint decimals");
    }

    if (!fair) {
      throw new Error("Invalid fair");
    }

    if (!quoteMint || !quoteMintInfo) {
      throw new Error("Quote mint not found");
    }

    const fees = getFeeAmount(fromAmount);

    return swap(
      swapClient,
      fromMint,
      fromMintInfo,
      fromMarket,
      parseFloat(fromAmount),
      toMint,
      toMintInfo,
      toMarket,
      quoteMint,
      quoteMintInfo,
      openOrders,
      fees,
      slippage,
      fair,
      isClosingNewAccounts,
      referral,
      isStrict
    );
  };

  const renderSourceTokenList = (
    <>
      {tokens ? (
        tokens.map((token, index) => {
          const onClick = () => {
            const newMint = new PublicKey(token.address);
            setFromMint(newMint);
            consoleOut("token selected:", token);
            const validAmount = !toAmount ? 0 : parseFloat(fromAmount);
            const amount = validAmount * (fair || 1);
            setToAmount(amount ? amount.toString() : "", tokenMap.get(toMint.toBase58())?.decimals || 9);
            refreshFromTokenBalance(newMint);
            onCloseTokenSelector();
          };

          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                fromMint && fromMint.toBase58() === token.address
                  ? "selected"
                  : areSameTokens(token, tokenMap.get(toMint?.toBase58() || USDC_MINT.toBase58()) as TokenInfo)
                  ? 'disabled'
                  : "simplelink"
              }`}
            >
              <div className="token-icon">
                {token.logoURI ? (
                  <img
                    alt={`${token.name}`}
                    width={24}
                    height={24}
                    src={token.logoURI}
                  />
                ) : (
                  <Identicon
                    address={token.address}
                    style={{ width: "24", display: "inline-flex" }}
                  />
                )}
              </div>
              <div className="token-description">
                <div className="token-symbol">{token.symbol}</div>
                <div className="token-name">{token.name}</div>
              </div>
            </div>
          );
        })
      ) : (
        <p>{t("general.loading")}...</p>
      )}
    </>
  );

  const renderDestinationTokenList = (
    <>
      {tokens ? (
        tokens.map((token, index) => {
          const onClick = () => {
            const newMint = new PublicKey(token.address);
            setToMint(newMint);
            consoleOut("token selected:", token);
            const validAmount = !fromAmount ? 0 : parseFloat(fromAmount);
            const amount = validAmount / (fair || 1);
            setFromAmount(amount ? amount.toString() : "", tokenMap.get(fromMint.toBase58())?.decimals || 6);
            refreshToTokenBalance(newMint);
            onCloseTokenSelector();
          };
          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                toMint && toMint.toBase58() === token.address
                  ? "selected"
                  : areSameTokens(token, tokenMap.get(fromMint?.toBase58() || NATIVE_SOL_MINT.toBase58()) as TokenInfo)
                  ? 'disabled'
                  : "simplelink"
              }`}
            >
              <div className="token-icon">
                {token.logoURI ? (
                  <img
                    alt={`${token.name}`}
                    width={24}
                    height={24}
                    src={token.logoURI}
                  />
                ) : (
                  <Identicon
                    address={token.address}
                    style={{ width: "24", display: "inline-flex" }}
                  />
                )}
              </div>
              <div className="token-description">
                <div className="token-symbol">{token.symbol}</div>
                <div className="token-name">{token.name}</div>
              </div>
            </div>
          );
        })
      ) : (
        <p>{t("general.loading")}...</p>
      )}
    </>
  );

  // Transaction execution modal
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const hideTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);

  const getTransactionModalTitle = () => {
    let title: any;
    if (isBusy) {
      title = t("transactions.status.modal-title-executing-transaction");
    } else {
      if (
        transactionStatus.lastOperation === TransactionStatus.Iddle &&
        transactionStatus.currentOperation === TransactionStatus.Iddle
      ) {
        title = null;
      } else if (
        transactionStatus.lastOperation ===
        TransactionStatus.TransactionFinished
      ) {
        title = t("transactions.status.modal-title-transaction-completed");
      } else {
        title = null;
      }
    }
    return title;
  };

  const isSuccess = (): boolean => {
    return (
      transactionStatus.currentOperation ===
      TransactionStatus.TransactionFinished
    );
  };

  const isError = (): boolean => {
    return transactionStatus.currentOperation ===
      TransactionStatus.TransactionStartFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.InitTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.SignTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.SendTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.ConfirmTransactionFailure
      ? true
      : false;
  };

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setFromAmount("");
      setToAmount("");
      hideTransactionModal();
      refreshFromTokenBalance();
      refreshToTokenBalance();
    }
  };

  const onTransactionStart = async () => {

    consoleOut("Starting swap...", "", "orange");
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: string;
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        if (fromMintTokenBalance < getComputedFees(swapFees)) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          return false;
        }

        return await getSwap()
          .then((value) => {
            console.log("SWAP returned transaction:", value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transaction = value;
            return true;
          })
          .catch((error) => {
            console.log("SWAP transaction init error:", error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            return false;
          });
      }
      return false;
    };

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log("Signing transaction...");
        return await swapClient.program.provider.wallet
          .signTransaction(transaction)
          .then((signed) => {
            console.log("signTransaction returned a signed transaction:", signed);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransaction,
            });
            signedTransaction = signed;
            return true;
          })
          .catch((error) => {
            console.log("Signing transaction failed!");
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            return false;
          });
      } else {
        console.log("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure,
        });
        return false;
      }
    };

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        const serializedTx = signedTransaction.serialize();
        console.log('tx serialized => ', encode(serializedTx));
        return await swapClient.program.provider.connection
          .sendRawTransaction(serializedTx)
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionSuccess
            });
            signature = sig;
            return true;
          })
          .catch(error => {
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await swapClient.program.provider.connection
        .confirmTransaction(signature, 'confirmed')
        .then(result => {
          console.log('confirmTransaction result:', result);
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(error => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          return false;
        });
    }

    if (wallet) {

      showTransactionModal();
      const swapTxs = await createTx();
      console.log("initialized:", swapTxs);
      if (swapTxs && !transactionCancelled) {
        const sign = await signTx();
        console.log("signed:", sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          console.log("sent:", sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log("confirmed:", confirmed);
            if (confirmed) {
              // Save signature to the state
              setIsBusy(false);
            } else {
              setIsBusy(false);
            }
          } else {
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  const infoRow = (caption: string, value: string, separator: string = '≈', route: boolean = false) => {
    return (
      <Row>
        <Col span={10} className="text-right">
          {caption}
        </Col>
        <Col span={1} className="text-center fg-secondary-70">
          {separator}
        </Col>
        <Col span={11} className="text-left fg-secondary-70">
          {value}
        </Col>
      </Row>
    );
  };

  const infoMessage = (caption: string) => {
    return (
      <Row>
        <Col span={24} className="text-center fg-secondary-70">
          {caption}
        </Col>
      </Row>
    );
  };

  return (
    <Spin spinning={isBusy || fetchingFromTokenBalance || fetchingToTokenBalance}>
      <div className="swap-wrapper">
        {/* Source token / amount */}
        <CoinInput
          token={tokenMap.get(fromMint.toBase58()) as TokenInfo}
          tokenBalance={fromMintTokenBalance}
          tokenAmount={fromAmount}
          onInputChange={handleSwapFromAmountChange}
          onMaxAmount={() => {
            setFromAmount(fromMintTokenBalance.toString());
            const minSwapSize = minimumSwapSize(fromMintTokenBalance);
            console.log('minSwapSize => ', minSwapSize);
            setSmallAmount(minSwapSize);
          }}
          onSelectToken={() => {
            setSubjectTokenSelection("source");
            showTokenSelector();
          }}
          translationId="source"
        />

        <div className="flip-button-container">
          <div className="flip-button" onClick={() => flipMints()}>
            <ArrowDownOutlined />
          </div>
        </div>

        {/* Destination token / amount */}
        <CoinInput
          token={tokenMap.get(toMint.toBase58()) as TokenInfo}
          tokenBalance={toMintTokenBalance}
          tokenAmount={toAmount}
          readonly={true}
          onInputChange={handleSwapToAmountChange}
          onMaxAmount={() => setToAmount(toMintTokenBalance.toString())}
          onSelectToken={() => {
            setSubjectTokenSelection("destination");
            showTokenSelector();
          }}
          translationId="destination"
        />

        {/* Token selection modal */}
        <Modal
          className="mean-modal unpadded-content"
          visible={isTokenSelectorModalVisible}
          title={
            <div className="modal-title">{t("token-selector.modal-title")}</div>
          }
          onCancel={onCloseTokenSelector}
          width={450}
          footer={null}>
          <div className="token-selector-wrapper">
            <div className="token-search-wrapper">
              <TextInput
                value={tokenFilter}
                placeholder={t('token-selector.search-input-placeholder')}
                onInputChange={onTokenSearchInputChange} />
            </div>
            <div className="token-list vertical-scroll">
              {subjectTokenSelection === "source"
                ? renderSourceTokenList
                : renderDestinationTokenList}
            </div>
          </div>
        </Modal>

        {/* Info */}
        {
          fair ? (
          <div className="p-2 mb-2">
          {
            fair &&
            infoRow(
                (fromMarket ? `1 ${tokenMap.get(fromMint.toBase58())?.symbol || "USDC"}` : "--"),
                (
                  `${formatAmount(
                    1 / fair, //getCurrentRate(),
                    (tokenMap.get(toMint.toBase58())?.decimals || 9)
                  )} ${tokenMap.get(toMint.toBase58())?.symbol || "SOL"}`
                ),
                '≈',
                true
              )
            }
            {
              isSwapAmountValid() &&
              infoRow(
                t("transactions.transaction-info.transaction-fee"),
                formatAmount(
                  getFeeAmount(fromAmount),
                  (tokenMap.get(fromMint.toBase58())?.decimals || 6)
                ) + ` ${tokenMap.get(fromMint.toBase58())?.symbol || "USDC"}`
              )
            }
            {
              isSwapAmountValid() &&
              infoRow(
                t("transactions.transaction-info.recipient-receives"),
                formatAmount(
                  parseFloat(toAmount) - getFeeAmount(toAmount),
                  (tokenMap.get(toMint.toBase58())?.decimals || 9)
                ) + ` ${tokenMap.get(toMint.toBase58())?.symbol || "SOL"}`
              )
            }
          </div>
        ) : (
          <div className="p-2 mb-2">
            {infoMessage(t('swap.insufficient-liquidity'))}
          </div>
        )
          
        }
        {/* Action button */}
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={!isSwapAmountValid()}>
          {getTransactionStartButtonLabel()}
        </Button>

        {/* Transaction execution modal */}
        <Modal
          className="mean-modal"
          maskClosable={false}
          visible={isTransactionModalVisible}
          title={getTransactionModalTitle()}
          onCancel={hideTransactionModal}
          afterClose={onAfterTransactionModalClosed}
          width={280}
          footer={null}
        >
          <div className="transaction-progress">
            {isBusy ? (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">
                  {getTransactionOperationDescription(transactionStatus, t)}
                </h4>
                <p className="operation">
                  {t("transactions.status.tx-swap-operation", {
                    fromAmount: getTokenAmountAndSymbolByTokenAddress(parseFloat(fromAmount), fromMint.toBase58()),
                    toAmount: getTokenAmountAndSymbolByTokenAddress(parseFloat(toAmount), toMint.toBase58())
                    })
                  }
                </p>
                <div className="indication">
                  {t("transactions.status.instructions")}
                </div>
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined
                  style={{ fontSize: 48 }}
                  className="icon"
                />
                <h4 className="font-bold mb-1 text-uppercase">
                  {getTransactionOperationDescription(transactionStatus, t)}
                </h4>
                <p className="operation">
                  {t("transactions.status.tx-swap-operation-success")}.
                </p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideTransactionModal}>
                  {t("general.cta-close")}
                </Button>
              </>
            ) : isError() ? (
              <>
                <WarningOutlined
                  style={{ fontSize: 48 }}
                  className="icon"
                />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t("transactions.status.tx-start-failure", {
                      accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                        fromMintTokenBalance,
                        WRAPPED_SOL_MINT_ADDRESS,
                        true
                      )} SOL`,
                      feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                        getComputedFees(swapFees),
                        WRAPPED_SOL_MINT_ADDRESS,
                        true
                      )} SOL`
                    })}
                  </h4>
                ) : (
                  <h4 className="font-bold mb-1 text-uppercase">
                    {!smallAmount && getTransactionOperationDescription(transactionStatus, t)}
                    {
                      smallAmount && 
                      (t('transactions.status.tx-send-failure-smallamount') || 'Failure submitting transaction. Swap amount too small')
                    }
                  </h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideTransactionModal}
                >
                  {t("general.cta-dismiss")}
                </Button>
              </>
            ) : (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-4 text-uppercase">
                  {t("transactions.status.tx-wait")}...
                </h4>
              </>
            )}
          </div>
        </Modal>

      </div>
    </Spin>
    );
};
