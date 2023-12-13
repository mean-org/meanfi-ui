import { TokenInfo } from 'models/SolanaTokenInfo';

interface SwapRateProps {
  swapRate: boolean;
  srcChainTokenIn: TokenInfo | undefined;
  dstChainTokenOut: TokenInfo | undefined;
  inputAmount: number;
  outputAmount: number;
  onFlipRate: () => void;
}

const SwapRate = ({
  swapRate,
  srcChainTokenIn,
  dstChainTokenOut,
  inputAmount,
  outputAmount,
  onFlipRate,
}: SwapRateProps) => {
  const areSameTokens =
    srcChainTokenIn?.address === dstChainTokenOut?.address && srcChainTokenIn?.chainId === dstChainTokenOut?.chainId;

  return (
    <>
      {srcChainTokenIn && dstChainTokenOut && !areSameTokens && outputAmount ? (
        <span className="simplelink underline-on-hover" onClick={onFlipRate}>
          {swapRate ? (
            <>
              1 {srcChainTokenIn.symbol} ≈ {(outputAmount / inputAmount).toFixed(4)} {dstChainTokenOut.symbol}
            </>
          ) : (
            <>
              1 {dstChainTokenOut.symbol} ≈ {(inputAmount / outputAmount).toFixed(4)} {srcChainTokenIn.symbol}
            </>
          )}
        </span>
      ) : (
        <span>&nbsp;</span>
      )}
    </>
  );
};

export default SwapRate;
