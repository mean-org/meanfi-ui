import { StreamInfo } from '@mean-dao/money-streaming';

const getV1Beneficiary = (stream: StreamInfo) => {
  if (!stream.beneficiaryAddress) {
    return '';
  }
  if (typeof stream.beneficiaryAddress === 'string') {
    return stream.beneficiaryAddress;
  }

  return stream.beneficiaryAddress.toBase58();
};

export default getV1Beneficiary;
