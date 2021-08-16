import { Button, Modal, Row, Col } from "antd";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import { formatAmount, getWrapTxAndSigners, isValidNumber } from "../../utils/utils";
import { IconSwapFlip } from "../../Icons";
import { Identicon } from "../Identicon";
import { consoleOut, percentage } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { TokenInfo } from "@solana/spl-token-registry";
import { useMint, useNativeAccount } from "../../contexts/accounts";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees, findATokenAddress, wrapSol } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";
import { CoinInput } from "../CoinInput";
import { useSwappableTokens, useTokenMap } from "../../contexts/tokenList";
import { useBbo, useMarket, useMarketContext, useOpenOrders, useRouteVerbose } from "../../contexts/market";
import { PublicKey, Signer, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, TOKEN_PROGRAM_ID, USDC_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { useReferral, useSwapContext, useSwapFair } from "../../contexts/swap";
import { useOwnedTokenAccount } from "../../contexts/token";
import BN from "bn.js";
import "./style.less";
import { Token } from "@solana/spl-token";
import { NATIVE_SOL } from "../../utils/tokens";
import { Keypair } from "@solana/web3.js";
import { encode } from "money-streaming/lib/utils";

export const SwapUi = () => {

  const { t } = useTranslation("common");
  const { wallet, connected } = useWallet();
  const connection = useConnection();
  const {
    tokenBalance,
    swapToTokenBalance,
    setSelectedToken,
    refreshTokenBalance,
    refreshSwapToTokenBalance

  } = useContext(AppStateContext);

  const {
    fromMint,
    toMint,
    fromAmount,
    toAmount,
    slippage,
    isStrict,
    isClosingNewAccounts,
    // referral,
    setFromMint,
    setToMint,
    setFromAmount,
    setToAmount,
    swapToFromMints

  } = useSwapContext();

  const { swapClient } = useMarketContext();
  const openOrders = useOpenOrders();
  const route = useRouteVerbose(fromMint, toMint);
  const fromMarket = useMarket(route && route.markets ? route.markets[0] : undefined);
  const toMarket = useMarket(route && route.markets ? route.markets[1] : undefined);
  const fromBbo = useBbo(fromMarket?.address) || { bestBid: 0, mid: 0, bestOffer: 0 };
  const toBbo = useBbo(toMarket?.address) || { bestBid: 0, mid: 0, bestOffer: 0 };
  const tokenMap = useTokenMap();
  // const canSwap = useCanSwap();
  const referral = useReferral(fromMarket);
  const fair = useSwapFair();
  // let fromWallet = useOwnedTokenAccount(fromMint);
  // let toWallet = useOwnedTokenAccount(toMint);
  const quoteMint = fromMarket && fromMarket.quoteMintAddress ? fromMarket.quoteMintAddress : undefined;
  const quoteMintInfo = useMint(quoteMint);
  const quoteWallet = useOwnedTokenAccount(quoteMint);
  const { swappableTokens } = useSwappableTokens();
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [tokenFilter, setTokenFilter] = useState("");
  const filter = tokenFilter.toLowerCase();
  const tokens =
    tokenFilter === ""
      ? swappableTokens
      : swappableTokens.filter((t) =>
          t.symbol.toLowerCase().startsWith(filter) ||
          t.name.toLowerCase().startsWith(filter) ||
          t.address.toLowerCase().startsWith(filter)        
      );

  useEffect(() => {
    if (account && account.lamports !== previousBalance) {
      // Refresh token balance
      refreshTokenBalance();
      refreshSwapToTokenBalance();
      // Update previous balance
      setPreviousBalance(account.lamports);
    }
  }, [
    account,
    previousBalance,
    refreshTokenBalance,
    refreshSwapToTokenBalance,
  ]);

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
    let fee = 0;
    let inputAmount = amount ? parseFloat(amount) : 0;
    if (swapFees) {
      if (swapFees.mspPercentFee) {
        fee = percentage(swapFees.mspPercentFee, inputAmount);
      } else if (swapFees.mspFlatFee) {
        fee = swapFees.mspFlatFee;
      }
    }
    return fee;
  };

  // const getPricePerToken = (token: TokenInfo): number => {
  //   const tokenSymbol = token.symbol.toUpperCase();
  //   const symbol = tokenSymbol[0] === "W" ? tokenSymbol.slice(1) : tokenSymbol;

  //   return coinPrices && coinPrices[symbol] ? coinPrices[symbol] : 0;
  // };

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => setTokenSelectorModalVisibility(false), []);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
  const [swapRateFlipped, setSwapRateFlipped] = useState(false);

  // Event handling
  const handleSwapFromAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromAmount("");
    } else if (isValidNumber(newValue)) {
      setFromAmount(newValue, tokenMap.get(toMint.toBase58())?.decimals || 9);
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

  // Validation

  // TODO: Review validation
  const isSwapAmountValid = (): boolean => {
    return (
      connected &&
      tokenBalance &&
      fromMint &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      parseFloat(fromAmount) > getFeeAmount(fromAmount) &&
      parseFloat(fromAmount) - getFeeAmount(fromAmount) <= tokenBalance

    ) ? true : false;
  };

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t("transactions.validation.not-connected")
      : !fromMint || !tokenBalance
      ? t("transactions.validation.no-balance")
      : !fromAmount
      ? t("transactions.validation.no-amount")
      : parseFloat(fromAmount) > tokenBalance
      ? t("transactions.validation.amount-high")
      // : tokenBalance < getFeeAmount(fromCoinAmount)
      // ? t("transactions.validation.amount-low")
      : t("transactions.validation.valid-approve");
  };

  const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
    return  source && destination &&
            source.name === destination.name &&
            source.address === destination.address
            ? true
            : false;
  }

  const flipMints = () => {
    swapToFromMints();
    setSwapRateFlipped(!swapRateFlipped);
  }

  // const updateTokenPair = (source: TokenInfo, destination: TokenInfo, flip = false) => {
  //   if (flip) {
  //     const tokenFrom = destination;
  //     const tokenTo = source;
  //     setFromMint(tokenFrom ? new PublicKey(tokenFrom.address) : USDC_MINT);
  //     setToMint(tokenTo ? new PublicKey(tokenTo.address) : NATIVE_SOL_MINT);
  //     setFromAmount(toAmount);
  //     setToAmount(fromAmount);
  //   }
  // }

  const swap = async () => {

    if (!fromMint || !toMint) {
      throw new Error("Unable to calculate mint decimals");
    }

    if (!fair) {
      throw new Error("Invalid fair");
    }

    if (!quoteMint || !quoteMintInfo) {
      throw new Error("Quote mint not found");
    }

    const amount = new BN(parseFloat(fromAmount) * 10 ** (tokenMap.get(fromMint.toBase58())?.decimals || 6));
    const isSol = fromMint.equals(NATIVE_SOL_MINT) || toMint.equals(NATIVE_SOL_MINT);
    const walletKey = wallet?.publicKey as PublicKey;
    // const wrappedSolKey = await findATokenAddress(wallet?.publicKey as PublicKey, WRAPPED_SOL_MINT);
    const wrappedAccount = Keypair.generate();
    const fromWalletKey = await findATokenAddress(wallet?.publicKey as PublicKey, fromMint);
    const fromWalletInfo = await connection.getAccountInfo(fromWalletKey);
    const toWalletKey = await findATokenAddress(wallet?.publicKey as PublicKey, toMint);
    const toWalletInfo = await connection.getAccountInfo(toWalletKey);

    // Build the swap.
    let swapTxs = await (async () => {
      if (!fromMarket) {
        throw new Error("Market undefined");
      }

      const fromDecimals = (tokenMap.get(fromMint.toBase58())?.decimals || 6);
      const swapFee = swapFees.mspPercentFee * parseFloat(fromAmount) / 100;
      const minExchangeRate = {
        rate: new BN((10 ** fromDecimals * swapFee) / fair).muln(100 - slippage).divn(100),
        fromDecimals: fromDecimals,
        quoteDecimals: quoteMintInfo.decimals,
        strict: isStrict,
      };

      const fromOpenOrders = fromMarket
        ? openOrders.get(fromMarket?.address.toBase58())
        : undefined;
        
      const toOpenOrders = toMarket
        ? openOrders.get(toMarket?.address.toBase58())
        : undefined;
    
      const fromWalletAddr = fromMint.equals(NATIVE_SOL_MINT)
        ? wrappedAccount.publicKey
        : fromWalletInfo
        ? fromWalletKey
        : undefined;
      
      const toWalletAddr = toMint.equals(NATIVE_SOL_MINT)
        ? wrappedAccount.publicKey
        : toWalletInfo
        ? toWalletKey
        : undefined;
        
      console.log('fromWallet => ', fromWalletAddr);
      console.log('toWallet => ', toWalletAddr);
      
      const swapParams = {
        fromMint,
        toMint,
        quoteMint,
        amount,
        minExchangeRate,
        referral,
        fromMarket,
        toMarket,
        // Automatically created if undefined.
        fromOpenOrders: fromOpenOrders ? fromOpenOrders[0].address : undefined,
        toOpenOrders: toOpenOrders ? toOpenOrders[0].address : undefined,
        fromWallet: fromWalletAddr,
        toWallet: toWalletAddr,
        quoteWallet: quoteWallet ? quoteWallet.publicKey : undefined,
        // Auto close newly created open orders accounts.
        close: isClosingNewAccounts,
      };

      console.log('params => ', swapParams);

      return await swapClient.swapTxs(swapParams);

    })();

    // If swapping SOL, then insert a wrap/unwrap instruction.
    if (isSol) {

      if (swapTxs.length > 1) {
        throw new Error("SOL must be swapped in a single transaction");
      }

      const { tx: wrapTx, signers: wrapSigners } = await getWrapTxAndSigners(
        swapClient.program.provider,
        wrappedAccount,
        fromMint,
        new BN(fromAmount)
      );

      const unwrapTx = new Transaction().add(
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          wrappedAccount.publicKey,
          walletKey,
          walletKey,
          []
        )
      );

      const tx = new Transaction().add(
        wrapTx,
        swapTxs[0].tx,
        unwrapTx
      );

      swapTxs[0].tx = tx;
      swapTxs[0].signers.push(...wrapSigners);
    }

    swapTxs[0].tx.feePayer = wallet?.publicKey;
    const { blockhash } = await connection.getRecentBlockhash(connection.commitment);
    swapTxs[0].tx.recentBlockhash = blockhash;
    swapTxs[0].tx.partialSign(...swapTxs[0].signers as Signer[]);

    return swapTxs[0].tx;
  };

  const renderSourceTokenList = (
    <>
      {tokens ? (
        tokens.map((token, index) => {
          const onClick = () => {
            setSelectedToken(token.address === NATIVE_SOL_MINT.toBase58() ? NATIVE_SOL : token);
            refreshTokenBalance();
            setFromMint(new PublicKey(token.address));
            consoleOut("token selected:", token);
            const validAmount = !toAmount ? 0 : parseFloat(fromAmount);
            const amount = validAmount * getCurrentRate();
            setToAmount(amount ? amount.toString() : "", tokenMap.get(toMint.toBase58())?.decimals || 9);
            onCloseTokenSelector();
          };
          
          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                fromMint && fromMint.toBase58() === token.address
                  ? "selected"
                  : areSameTokens(token, tokenMap.get(fromMint?.toBase58() || USDC_MINT.toBase58()) as TokenInfo)
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
            setToMint(new PublicKey(token.address));
            consoleOut("token selected:", token);
            const validAmount = !fromAmount ? 0 : parseFloat(fromAmount);
            const amount = validAmount / getCurrentRate();
            setFromAmount(amount ? amount.toString() : "", tokenMap.get(fromMint.toBase58())?.decimals || 6);
            onCloseTokenSelector();
          };
          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                toMint && toMint.toBase58() === token.address
                  ? "selected"
                  : areSameTokens(token, tokenMap.get(toMint?.toBase58() || NATIVE_SOL_MINT.toBase58()) as TokenInfo)
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

  // Main action

  const onTransactionStart = async () => {
    consoleOut("Starting swap...", "", "orange");
    const swapTxs = await swap();

    if (wallet) {
      const signedTx = await swapClient.program.provider.wallet.signTransaction(swapTxs);
      console.log('tx => ', signedTx);
      const serializedTx = signedTx.serialize();
      console.log('tx serialized => ', encode(serializedTx));
      const result = await connection.sendRawTransaction(serializedTx);
      console.log('signature => ', result);
    }
  };

  const infoRow = (caption: string, value: string, separator: string = '≈', route: boolean = false) => {
    return (
      <Row>
        <Col span={11} className="text-right">
          {caption}
        </Col>
        <Col span={1} className="text-center fg-secondary-70">
          {separator}
        </Col>
        <Col span={10} className="text-left fg-secondary-70">
          {value}
        </Col>
        {
          route &&
          <Col span={2} className="text-center fg-secondary-70">
            {/* <RouteInfo />  */}
          </Col>
        }
      </Row>
    );
  };

  const getCurrentRate = () => {
    let rate = toMarket ? (fromBbo?.mid || 1) / (toBbo?.mid || 1) : 1 / (fromBbo?.mid || 1);

    if (swapRateFlipped === true) {
      rate = toMarket ? (fromBbo?.mid || 1) / (toBbo?.mid || 1) : (fromBbo?.mid || 1);
    }

    return rate;
  }

  return (
    <div className="swap-wrapper">
      {/* Source token / amount */}
      <CoinInput
        token={tokenMap.get(fromMint.toBase58()) as TokenInfo}
        tokenBalance={tokenBalance}
        tokenAmount={fromAmount}
        onInputChange={handleSwapFromAmountChange}
        onMaxAmount={() => setFromAmount(tokenBalance.toString())}
        onSelectToken={() => {
          setSubjectTokenSelection("source");
          showTokenSelector();
        }}
        translationId="source"
      />

      <div className="flip-button-container">
        <div className="flip-button" onClick={() => flipMints()}>
          <IconSwapFlip className="mean-svg-icons" />
        </div>
      </div>

      {/* Destination token / amount */}
      <CoinInput
        token={tokenMap.get(toMint.toBase58()) as TokenInfo}
        tokenBalance={swapToTokenBalance}
        tokenAmount={toAmount}
        onInputChange={handleSwapToAmountChange}
        onMaxAmount={() => setToAmount(swapToTokenBalance.toString())}
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
        <div className="token-list">
          {subjectTokenSelection === "source"
            ? renderSourceTokenList
            : renderDestinationTokenList}
        </div>
      </Modal>

      {/* Info */}
      {fromMarket && (
        <div className="p-2 mb-2">
          {
            infoRow(
              (fromMarket ? `1 ${tokenMap.get(fromMint.toBase58())?.symbol || "USDC"}` : "--"),
              (
                `${formatAmount(
                  getCurrentRate(),
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
      )}

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
    </div>
  );
};

