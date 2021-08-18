import { Button, Modal, Row, Col } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import { formatAmount, getWrapTxAndSigners, isValidNumber } from "../../utils/utils";
import { IconSwapFlip } from "../../Icons";
import { Identicon } from "../Identicon";
import { consoleOut, percentage } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
// import { AppStateContext } from "../../contexts/appstate";
import { TokenInfo } from "@solana/spl-token-registry";
import { useAccountsContext, useMint } from "../../contexts/accounts";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees, findATokenAddress } from "money-streaming/lib/utils";
import { createATokenAccountInstruction } from "money-streaming/lib/instructions";
import { useTranslation } from "react-i18next";
import { CoinInput } from "../CoinInput";
import { useSwappableTokens, useTokenMap } from "../../contexts/tokenList";
import { useBbo, useMarket, useMarketContext, useOpenOrders, useRouteVerbose } from "../../contexts/market";
import { Account, LAMPORTS_PER_SOL, PublicKey, Signer, Transaction, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, TOKEN_PROGRAM_ID, USDC_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { useReferral, useSwapContext, useSwapFair } from "../../contexts/swap";
import { useOwnedTokenAccount } from "../../contexts/token";
import BN from "bn.js";
import "./style.less";
import { Token } from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { encode } from "money-streaming/lib/utils";
import { OpenOrders } from "@project-serum/serum";
import { SendTxRequest } from "@project-serum/anchor/dist/provider";
import { SystemProgram } from "@solana/web3.js";
import { closeAccount, transfer } from "@project-serum/serum/lib/token-instructions";
import { decode } from "bs58";

export const SwapUi = () => {

  const { t } = useTranslation("common");
  const { publicKey, wallet, connected } = useWallet();
  const connection = useConnection();
  const accounts = useAccountsContext();

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
  const [fromMintTokenBalance, setFromMintTokenBalance] = useState(0);
  const [toMintTokenBalance, setToMintTokenBalance] = useState(0);
  const [fetchingFromTokenBalance, setFetchingFromTokenBalance] = useState(false);
  const [fetchingToTokenBalance, setFetchingToTokenBalance] = useState(false);

  const getTokenAccountBalanceByAddress = useCallback(async (address: string): Promise<number> => {
    if (address) {
      console.log('token address:', address);
      const accountInfo = await connection.getAccountInfo(address.toPublicKey());
      console.log('token accountInfo:', accountInfo);
      if (accountInfo) {
        if (address === publicKey?.toBase58()) {
          return accountInfo.lamports / LAMPORTS_PER_SOL;
        }
        const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
        return tokenAmount.uiAmount || 0;
      }
    }
    return 0;
  }, [
    publicKey,
    connection
  ])

  // Refresh fromMint token balance
  const refreshFromTokenBalance = useCallback(async (mint: PublicKey) => {
    setFetchingFromTokenBalance(true);
    if (mint.equals(NATIVE_SOL_MINT)) {
      getTokenAccountBalanceByAddress(publicKey?.toBase58() as string)
        .then(balance => setFromMintTokenBalance(balance))
        .catch(() => setFetchingFromTokenBalance(false));
    } else {
      findATokenAddress(publicKey as PublicKey, fromMint)
        .then(value => {
          if (value) {
            getTokenAccountBalanceByAddress(value.toBase58())
              .then(balance => setFromMintTokenBalance(balance))
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
  const refreshToTokenBalance = useCallback(async (mint: PublicKey) => {
    setFetchingToTokenBalance(true);
    if (mint.equals(NATIVE_SOL_MINT)) {
      getTokenAccountBalanceByAddress(publicKey?.toBase58() as string)
        .then(balance => setToMintTokenBalance(balance))
        .catch(() => setFetchingToTokenBalance(false));
    } else {
      findATokenAddress(publicKey as PublicKey, toMint)
        .then(value => {
          if (value) {
            getTokenAccountBalanceByAddress(value.toBase58())
              .then(balance => setToMintTokenBalance(balance))
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
    if (publicKey && accounts?.tokenAccounts?.length) {
      if (fromMint && !fetchingFromTokenBalance) {
        refreshFromTokenBalance(fromMint);
      } else {
        setFromMintTokenBalance(0);
      }
    }
  }, [
    publicKey,
    accounts,
    fromMint,
    fetchingFromTokenBalance,
    refreshFromTokenBalance
  ]);

  // Automatically update toMint token balance once
  useEffect(() => {
    if (publicKey && accounts?.tokenAccounts?.length) {
      if (toMint && !fetchingToTokenBalance) {
        refreshToTokenBalance(toMint);
      } else {
        setToMintTokenBalance(0);
      }
    }
  }, [
    publicKey,
    accounts,
    toMint,
    fetchingToTokenBalance,
    refreshToTokenBalance
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
      fromMintTokenBalance &&
      fromMint &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      parseFloat(fromAmount) > getFeeAmount(fromAmount) &&
      parseFloat(fromAmount) - getFeeAmount(fromAmount) <= fromMintTokenBalance

    ) ? true : false;
  };

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t("transactions.validation.not-connected")
      : !fromMint || !fromMintTokenBalance
      ? t("transactions.validation.no-balance")
      : !fromAmount
      ? t("transactions.validation.no-amount")
      : parseFloat(fromAmount) > fromMintTokenBalance
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

    const walletKey = swapClient.program.provider.wallet.publicKey;
    const amount = new BN(parseFloat(fromAmount) * 10 ** (tokenMap.get(fromMint.toBase58())?.decimals || 6));
    const isSol = fromMint.equals(NATIVE_SOL_MINT) || toMint.equals(NATIVE_SOL_MINT);
    // const wrappedSolKey = await findATokenAddress(walletKey, WRAPPED_SOL_MINT);
    const wrappedAccount = Keypair.generate();
    const fromWalletKey = await findATokenAddress(walletKey, fromMint);
    const toWalletKey = await findATokenAddress(walletKey, toMint);

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
    
      const fromWalletAddr = fromMint.equals(NATIVE_SOL_MINT)
        ? wrappedAccount.publicKey
        : fromWalletKey;
      
      const toWalletAddr = toMint.equals(NATIVE_SOL_MINT)
        ? wrappedAccount.publicKey
        : toWalletKey;

      const fromOpenOrders = fromMarket && openOrders.has(fromMarket?.address.toBase58())
        ? openOrders.get(fromMarket?.address.toBase58())
        : undefined;
    
      const toOpenOrders = toMarket
        ? openOrders.get(toMarket?.address.toBase58())
        : undefined;
      
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
        close: true,
        confirmOptions: swapClient.program.provider.opts
      };

      let swapTxs = await swapClient.swapTxs(swapParams);
      const toWalletInfo = await swapClient.program.provider.connection.getAccountInfo(toWalletAddr);

      if (!toWalletInfo && !toMint.equals(NATIVE_SOL_MINT)) {
        const aTokenTx = {
          tx: new Transaction().add(
            await createATokenAccountInstruction(
              toWalletKey,
              walletKey,
              walletKey,
              toMint
            )
          ), signers: []
        };
        
        const tx = new Transaction().add(
          aTokenTx.tx,
          swapTxs[0].tx
        );

        swapTxs[0].tx = tx;
        swapTxs[0].signers.push(...aTokenTx.signers as Signer[]);
      }

      return swapTxs;

    })();

    // If swapping SOL, then insert a wrap/unwrap instruction.
    if (isSol) {
      
      if (swapTxs.length > 1) {
        throw new Error("SOL must be swapped in a single transaction");
      }

      const { tx: wrapTx, signers: wrapSigners } = await getWrapTxAndSigners(
        swapClient.program.provider,
        wrappedAccount as Keypair,
        parseFloat(fromAmount)
      );

      const unwrapTx = new Transaction().add(
        Token.createCloseAccountInstruction(
          TOKEN_PROGRAM_ID,
          wrappedAccount!.publicKey,
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

    swapTxs[0].tx.feePayer = walletKey;
    const { blockhash } = await swapClient.program.provider.connection.getRecentBlockhash(connection.commitment);
    swapTxs[0].tx.recentBlockhash = blockhash;

    if (swapTxs[0].signers.length) {
      swapTxs[0].tx.partialSign(...swapTxs[0].signers as Signer[]);
    }

    return swapTxs[0].tx;
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
            const amount = validAmount * getCurrentRate();
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
            const amount = validAmount / getCurrentRate();
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

  // Main action

  const onTransactionStart = async () => {
    consoleOut("Starting swap...", "", "orange");
    const swapTxs = await swap();
    console.log('swapTxs => ', swapTxs);

    if (wallet) {
      const signedTx = await swapClient.program.provider.wallet.signTransaction(swapTxs);  
      console.log('tx => ', signedTx);
      const serializedTx = signedTx.serialize();
      console.log('tx serialized => ', encode(serializedTx));
      const result = await swapClient.program.provider.connection.sendRawTransaction(serializedTx);
      console.log('tx result => ', result);

      // 
      // let accKey = new PublicKey('8q9ZxWtmWLb8Uu3Tpiq5vsMkv8aELPHNqM1zBWW9PKsf');
      // let tx = new Transaction().add(        
      //   closeAccount({
      //     source: accKey,
      //     destination: swapClient.program.provider.wallet.publicKey,
      //     // amount: 23357760,
      //     owner: new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin')
      //   })
      // );

      // tx.feePayer = swapClient.program.provider.wallet.publicKey;
      // const { blockhash } = await swapClient.program.provider.connection.getRecentBlockhash(connection.commitment);
      // tx.recentBlockhash = blockhash;
      // const signedTx = await swapClient.program.provider.wallet.signTransaction(tx);
      // console.log('tx signed => ', signedTx);
      // const serializedTx = signedTx.serialize();
      // console.log('tx serialized => ', encode(serializedTx));
      // const result = await swapClient.program.provider.connection.sendRawTransaction(serializedTx);
      // console.log('tx result => ', result);
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
        tokenBalance={fromMintTokenBalance}
        tokenAmount={fromAmount}
        onInputChange={handleSwapFromAmountChange}
        onMaxAmount={() => setFromAmount(fromMintTokenBalance.toString())}
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
        tokenBalance={toMintTokenBalance}
        tokenAmount={toAmount}
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

