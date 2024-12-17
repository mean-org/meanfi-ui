import type { PaymentStreaming, PaymentStreamingAccount } from '@mean-dao/payment-streaming';
import { PerformanceCounter } from 'src/middleware/perf-counter';
import { consoleOut, delay, isProd } from 'src/middleware/ui';
import type { LooseObject } from 'src/types/LooseObject';

const streamTemplatesPerformanceCounter = new PerformanceCounter();

const getStreamTemplates = async ({
  tokenStreamingV2,
  vestingContracts,
}: {
  tokenStreamingV2: PaymentStreaming | undefined;
  vestingContracts: PaymentStreamingAccount[] | undefined;
}) => {
  if (!tokenStreamingV2) {
    throw new Error('Missing token streaming client');
  }

  consoleOut('Fetching stream templates...', '', 'orange');

  const compiledTemplates: LooseObject = {};

  if (!vestingContracts) return compiledTemplates;

  // Reset counters
  streamTemplatesPerformanceCounter.reset();
  streamTemplatesPerformanceCounter.start();

  for (const contract of vestingContracts) {
    // Delay before each call to avoid too many requests (devnet ONLY)
    if (!isProd()) {
      if (vestingContracts.length < 20) {
        await delay(150);
      } else if (vestingContracts.length < 40) {
        await delay(200);
      } else if (vestingContracts.length < 60) {
        await delay(250);
      } else if (vestingContracts.length < 80) {
        await delay(300);
      } else if (vestingContracts.length < 100) {
        await delay(350);
      } else {
        await delay(380);
      }
    }
    try {
      const templateData = await tokenStreamingV2.getStreamTemplate(contract.id);
      compiledTemplates[contract.id.toBase58()] = templateData;
    } catch (error) {
      console.error('Error fetching template data:', error);
    }
  }

  streamTemplatesPerformanceCounter.stop();
  consoleOut(
    `getStreamTemplates took ${streamTemplatesPerformanceCounter.elapsedTime.toLocaleString()} ms`,
    '',
    'crimson',
  );

  return compiledTemplates;
};

export default getStreamTemplates;
