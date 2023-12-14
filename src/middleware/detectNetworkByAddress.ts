import { validate as validateAddress } from 'multicoin-address-validator';

const detectNetworkByAddress = (address: string) => {
  if (validateAddress(address, 'BTC')) return 'BTC'
  if (validateAddress(address, 'ETH')) return 'ETH'
  if (validateAddress(address, 'SOL')) return 'SOL'

  return 'unknown'
}

export default detectNetworkByAddress;