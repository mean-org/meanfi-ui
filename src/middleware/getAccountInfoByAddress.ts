import { AccountInfo, Connection, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { consoleOut } from './ui';

const getAccountInfoByAddress = async (connection: Connection, address: PublicKey) => {
  let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
  try {
    accInfo = (await connection.getParsedAccountInfo(address)).value;
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
    console.error(error);
    return null;
  }
};

export default getAccountInfoByAddress;
