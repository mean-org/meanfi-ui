import type { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import type { StreamInfo } from '@mean-dao/money-streaming/lib/types';
import type { PaymentStreaming, Stream } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { PerformanceCounter } from 'middleware/perf-counter';
import { consoleOut, isProd } from 'middleware/ui';
import { shortenAddress } from 'middleware/utils';

const listStreamsPerformanceCounter = new PerformanceCounter();

const getStreamList = async ({
  tokenStreamingV1,
  tokenStreamingV2,
  srcAccountPk,
}: {
  tokenStreamingV1: MoneyStreaming | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
  srcAccountPk: PublicKey | undefined;
}) => {
  if (!srcAccountPk) {
    throw new Error('Missing source account public key');
  }

  if (!tokenStreamingV1 || !tokenStreamingV2) {
    throw new Error('Missing token streaming client');
  }

  consoleOut('Fetching streams for:', srcAccountPk?.toBase58(), 'orange');

  const streamAccumulator: (Stream | StreamInfo)[] = [];

  // Reset counters
  listStreamsPerformanceCounter.reset();
  listStreamsPerformanceCounter.start();

  try {
    const rawStreamsv2 = await tokenStreamingV2.listStreams({
      psAccountOwner: srcAccountPk,
      beneficiary: srcAccountPk,
    });
    streamAccumulator.push(...rawStreamsv2);

    const rawStreamsv1 = await tokenStreamingV1.listStreams({
      treasurer: srcAccountPk,
      beneficiary: srcAccountPk,
    });
    streamAccumulator.push(...rawStreamsv1);

    streamAccumulator.sort((a, b) => (new BN(a.createdBlockTime).lt(new BN(b.createdBlockTime)) ? 1 : -1));

    // Start debugging block
    if (!isProd()) {
      const debugTable: unknown[] = [];
      for (const item of streamAccumulator) {
        debugTable.push({
          version: item.version,
          name: item.version < 2 ? (item as StreamInfo).streamName : (item as Stream).name.trim(),
          streamId: shortenAddress(`${item.id}`, 8),
        });
      }
      console.table(debugTable);
    }
    // End of debugging block

    return streamAccumulator;
  } catch (error) {
    console.error(error);
    return [];
  } finally {
    listStreamsPerformanceCounter.stop();
    consoleOut(`listStreams took ${listStreamsPerformanceCounter.elapsedTime.toLocaleString()} ms`, '', 'crimson');
  }
};

export default getStreamList;
