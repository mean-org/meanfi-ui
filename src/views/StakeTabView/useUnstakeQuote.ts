import { useEffect, useState } from 'react';

import { StakingClient } from '@mean-dao/staking';
import { consoleOut } from 'middleware/ui';
import { formatThousands } from 'middleware/utils';
import { TokenInfo } from 'models/SolanaTokenInfo';

type Args = {
  stakeClient: StakingClient;
  selectedToken: TokenInfo | undefined;
  smeanBalance?: number;
};

const getMeanQuote = async (stakeClient: StakingClient, sMEAN: number) => {
  if (!stakeClient) {
    return 0;
  }

  try {
    const result = await stakeClient.getUnstakeQuote(sMEAN);
    return result.meanOutUiAmount;
  } catch (error) {
    console.error(error);
    return 0;
  }
};

const useUnstakeQuote = ({
  stakeClient,
  selectedToken,
  smeanBalance,
}: Args) => {
  const [meanWorthOfsMean, setMeanWorthOfsMean] = useState<number>(0);

  useEffect(() => {
    if (!selectedToken) return;
    if (!smeanBalance) return;

    if (smeanBalance <= 0) {
      setMeanWorthOfsMean(0);
      return;
    }

    (async () => {
      const value = await getMeanQuote(stakeClient, smeanBalance);

      consoleOut(
        `Quote for ${formatThousands(
          smeanBalance,
          selectedToken?.decimals,
        )} sMEAN`,
        `${formatThousands(value, selectedToken?.decimals)} MEAN`,
        'blue',
      );
      setMeanWorthOfsMean(value);
    })();
  }, [stakeClient, selectedToken, smeanBalance]);

  return meanWorthOfsMean;
};

export default useUnstakeQuote;
