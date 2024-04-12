import { type AccountInfo, type Connection, type ParsedAccountData, PublicKey } from '@solana/web3.js';
import { consoleOut, isValidAddress } from './ui';

/**
 * Fetch parsed account info for the specified public key
 * @param connection A Solana connection object
 * @param address The account Public Key to be inspected
 * @returns The account info for the inspected account or null if no info found
 */
const getAccountInfoByAddress = async (connection: Connection, address: string | PublicKey) => {
  let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
  let addressPk: PublicKey;
  if (typeof address === 'string' && isValidAddress(address)) {
    addressPk = new PublicKey(address);
  } else if (address instanceof PublicKey) {
    addressPk = address;
  } else {
    return null;
  }

  try {
    accInfo = (await connection.getParsedAccountInfo(addressPk)).value;
    if (!accInfo) {
      return null;
    }
    if (!(accInfo as any).data['parsed']) {
      const info = Object.assign({}, accInfo, {
        owner: accInfo.owner.toString(),
      }) as AccountInfo<Buffer>;
      consoleOut('Normal accountInfo', info, 'blue');
      return { accountInfo: accInfo as AccountInfo<Buffer>, parsedAccountInfo: null };
    } else {
      const info = Object.assign({}, accInfo, {
        owner: accInfo.owner.toString(),
      }) as AccountInfo<ParsedAccountData>;
      consoleOut('Parsed accountInfo:', info, 'blue');
      return { accountInfo: null, parsedAccountInfo: accInfo as AccountInfo<ParsedAccountData> };
    }
  } catch (error) {
    console.error('getParsedAccountInfo error:', error);
    return null;
  }
};

export default getAccountInfoByAddress;
