import type { Stream } from '@mean-dao/payment-streaming';

const getV2Beneficiary = (stream: Stream) => {
  if (!stream.beneficiary) {
    return '';
  }
  if (typeof stream.beneficiary === 'string') {
    return stream.beneficiary;
  }

  return stream.beneficiary.toBase58();
};

export default getV2Beneficiary;
