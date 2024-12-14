import { AccountLayout } from '@solana/spl-token';
import { type Connection, PublicKey } from '@solana/web3.js';

const getWalletOwnerOfTokenAccount = async (connection: Connection, tokenAccountAddress: string): Promise<string> => {
  // Convert the token account address to a PublicKey
  const tokenAccountPublicKey = new PublicKey(tokenAccountAddress);

  // Fetch the account info
  const accountInfo = await connection.getAccountInfo(tokenAccountPublicKey);

  if (!accountInfo) {
    throw new Error(`Account not found: ${tokenAccountAddress}`);
  }

  // Parse the account data using SPL Token's AccountLayout
  const accountData = AccountLayout.decode(accountInfo.data);

  // Get the owner's address from the parsed data
  const ownerPublicKey = new PublicKey(accountData.owner);

  return ownerPublicKey.toBase58(); // Return the owner's wallet address
};

export default getWalletOwnerOfTokenAccount;
