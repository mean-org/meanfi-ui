import { Button, Modal, Row, Col } from "antd";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection } from "../../contexts/connection";
import {
  formatAmount,
  getTokenAmountAndSymbolByTokenAddress,
  isValidNumber,
} from "../../utils/utils";
import { IconSwapFlip } from "../../Icons";
import { Identicon } from "../Identicon";
import { consoleOut, percentage } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { TokenInfo } from "@solana/spl-token-registry";
import { useNativeAccount } from "../../contexts/accounts";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";
import { CoinInput } from "../CoinInput";
import "./style.less";

export const SwapUi = () => {
  const connection = useConnection();
  const { connected } = useWallet();
  const {
    tokenList,
    selectedToken,
    tokenBalance,
    fromCoinAmount,
    swapToToken,
    swapToTokenBalance,
    swapToTokenAmount,
    effectiveRate,
    coinPrices,
    setSelectedToken,
    setFromCoinAmount,
    setSwapToToken,
    setSwapToTokenAmount,
    setEffectiveRate,
    refreshTokenBalance,
    refreshSwapToTokenBalance,
  } = useContext(AppStateContext);
  const { t } = useTranslation("common");
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);

  useEffect(() => {
    if (account?.lamports !== previousBalance) {
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
  }, [connection, swapFees]);

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

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => setTokenSelectorModalVisibility(false), []);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");

  // Event handling

  const handleSwapFromAmountChange = (e: any) => {
    console.log("swapToToken:", swapToToken);
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const handleSwapToAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setSwapToTokenAmount("");
    } else if (isValidNumber(newValue)) {
      setSwapToTokenAmount(newValue);
    }
  };

  // Validation

  // TODO: Review validation
  const isSwapAmountValid = (): boolean => {
    return connected &&
      selectedToken &&
      tokenBalance &&
      fromCoinAmount &&
      parseFloat(fromCoinAmount) > 0 &&
      // parseFloat(fromCoinAmount) > getFeeAmount(fromCoinAmount) &&
      parseFloat(fromCoinAmount) <= tokenBalance
      ? true
      : false;
  };

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t("transactions.validation.not-connected")
      : !selectedToken || !tokenBalance
      ? t("transactions.validation.no-balance")
      : !fromCoinAmount ||
        !isValidNumber(fromCoinAmount) ||
        !parseFloat(fromCoinAmount)
      ? t("transactions.validation.no-amount")
      : parseFloat(fromCoinAmount) > tokenBalance
      ? t("transactions.validation.amount-high")
      // : tokenBalance < getFeeAmount(fromCoinAmount)
      // ? t("transactions.validation.amount-low")
      : t("transactions.validation.valid-approve");
  };

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === "W" ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol] ? coinPrices[symbol] : 0;
  };

  const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
    return  source && destination &&
            source.name === destination.name &&
            source.address === destination.address
            ? true
            : false;
  }

  const updateTokenPair = (source: TokenInfo, destination: TokenInfo, flip = false) => {
    const tokenUp = JSON.parse(JSON.stringify(flip ? destination : source)) as TokenInfo;
    const tokenDn = JSON.parse(JSON.stringify(flip ? source : destination)) as TokenInfo;
    setSelectedToken(tokenUp);
    setSwapToToken(tokenDn);
    if (flip) {
      const valueUp = fromCoinAmount.slice();
      const valueDn = swapToTokenAmount.slice()
      setFromCoinAmount(valueDn);
      setSwapToTokenAmount(valueUp);
    }
  }

  // Prefabrics

  const renderSourceTokenList = (
    <>
      {tokenList ? (
        tokenList.map((token, index) => {
          const onClick = () => {
            setSelectedToken(token);
            consoleOut("token selected:", token);
            setEffectiveRate(getPricePerToken(token));
            onCloseTokenSelector();
          };
          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                selectedToken && selectedToken.address === token.address
                  ? "selected"
                  : areSameTokens(token, swapToToken as TokenInfo)
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
      {tokenList ? (
        tokenList.map((token, index) => {
          const onClick = () => {
            setSwapToToken(token);
            consoleOut("token selected:", token);
            setEffectiveRate(getPricePerToken(token));
            onCloseTokenSelector();
          };
          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                swapToToken && swapToToken.address === token.address
                  ? "selected"
                  : areSameTokens(token, selectedToken as TokenInfo)
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
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="text-right pr-1">
          {caption}
        </Col>
        <Col span={12} className="text-left pl-1 fg-secondary-70">
          {value}
        </Col>
      </Row>
    );
  };

  return (
    <div className="swap-wrapper">
      {/* Source token / amount */}
      <CoinInput
        token={selectedToken as TokenInfo}
        tokenBalance={tokenBalance}
        tokenAmount={fromCoinAmount}
        onInputChange={handleSwapFromAmountChange}
        onMaxAmount={() =>
          setFromCoinAmount(
            getTokenAmountAndSymbolByTokenAddress(
              tokenBalance,
              selectedToken?.address as string,
              true,
              true
            )
          )
        }
        onSelectToken={() => {
          setSubjectTokenSelection("source");
          showTokenSelector();
        }}
        translationId="source"
      />

      <div className="flip-button-container">
        <div className="flip-button" onClick={() => updateTokenPair(selectedToken as TokenInfo, swapToToken as TokenInfo, true)}>
          <IconSwapFlip className="mean-svg-icons" />
        </div>
      </div>

      {/* Destination token / amount */}
      <CoinInput
        token={swapToToken as TokenInfo}
        tokenBalance={swapToTokenBalance}
        tokenAmount={swapToTokenAmount}
        onInputChange={handleSwapToAmountChange}
        onMaxAmount={() =>
          setFromCoinAmount(
            getTokenAmountAndSymbolByTokenAddress(
              swapToTokenBalance,
              swapToToken?.address as string,
              true,
              true
            )
          )
        }
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
      {/* {selectedToken && (
        <div className="p-2 mb-2">
          {infoRow(
            `1 ${selectedToken.symbol}:`,
            effectiveRate ? `$${formatAmount(effectiveRate, 2)}` : "--"
          )}
          {isSwapAmountValid() &&
            infoRow(
              t("transactions.transaction-info.transaction-fee") + ":",
              "~" +
                getTokenAmountAndSymbolByTokenAddress(
                  getFeeAmount(fromCoinAmount),
                  selectedToken?.address
                )
            )}
          {isSwapAmountValid() &&
            infoRow(
              t("transactions.transaction-info.recipient-receives") + ":",
              "~" +
                getTokenAmountAndSymbolByTokenAddress(
                  parseFloat(fromCoinAmount) - getFeeAmount(fromCoinAmount),
                  selectedToken?.address
                )
            )}
        </div>
      )} */}

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
