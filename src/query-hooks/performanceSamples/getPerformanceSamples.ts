import type { Connection } from '@solana/web3.js';
import { consoleOut } from 'middleware/ui';

const getPerformanceSamples = async (connection: Connection) => {
  if (!connection) {
    return null;
  }

  const round = (series: number[]) => {
    return series.map(n => Math.round(n));
  };

  try {
    const samples = await connection.getRecentPerformanceSamples(60);

    if (samples.length < 1) {
      // no samples to work with (node has no history).
      return null; // we will allow for a timeout instead of throwing an error
    }

    let tpsValues = samples
      .filter(sample => {
        return sample.numTransactions !== 0;
      })
      .map(sample => {
        return sample.numTransactions / sample.samplePeriodSecs;
      });

    tpsValues = round(tpsValues);
    if (tpsValues.length === 0) {
      return null;
    }
    return Math.round(tpsValues[0]);
  } catch (error) {
    consoleOut('getRecentPerformanceSamples', '', 'darkred');
    return null;
  }
};

export default getPerformanceSamples;
