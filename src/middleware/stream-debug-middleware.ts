import type { PaymentStreaming, StreamEventData } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';

export const getStreamForDebug = async (address: PublicKey, msp: PaymentStreaming): Promise<StreamEventData | null> => {
  try {
    const response = await msp.getStreamRaw(address);
    return response;
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  } catch (error: any) {
    console.log(error);
    return null;
  }
};
