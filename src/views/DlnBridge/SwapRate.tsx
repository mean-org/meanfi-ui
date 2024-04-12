import { SwapOutlined } from '@ant-design/icons';
import type { TokenInfo } from 'models/SolanaTokenInfo';

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
      {srcChainTokenIn && dstChainTokenOut && !areSameTokens && inputAmount && outputAmount ? (
        <span className='secondary-link highlight-on-hover' onClick={onFlipRate}>
          {swapRate ? (
            <>
              1 {srcChainTokenIn.symbol} ≈ {(outputAmount / inputAmount).toFixed(4)} {dstChainTokenOut.symbol}
            </>
          ) : (
            <>
              1 {dstChainTokenOut.symbol} ≈ {(inputAmount / outputAmount).toFixed(4)} {srcChainTokenIn.symbol}
            </>
          )}
          <SwapOutlined rotate={90} style={{ marginLeft: 4 }} />
        </span>
      ) : (
        <span>&nbsp;</span>
      )}
    </>
  );
};

export default SwapRate;
