import type { PaymentStreaming } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';

export const getStreamForDebug = async (address: PublicKey, msp: PaymentStreaming): Promise<any> => {
  try {
    const response = await msp.getStreamRaw(address);
    return response;
  } catch (error: any) {
    console.log(error);
    return null;
  }
};
