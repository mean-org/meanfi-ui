import type { Connection } from '@solana/web3.js';

const getPerformanceSamples = async (connection: Connection) => {
  if (!connection) return;

  const round = (series: number[]) => {
    return series.map(n => Math.round(n));
  };

  const samples = await connection.getRecentPerformanceSamples(60);

  if (samples.length < 1) {
    // no samples to work with (node has no history).
    return; // we will allow for a timeout instead of throwing an error
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
    return;
  }
  return Math.round(tpsValues[0]);
};

export default getPerformanceSamples;
