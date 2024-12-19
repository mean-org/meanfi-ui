import { BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { type Connection, PublicKey } from '@solana/web3.js';
import { ACCOUNT_LAYOUT } from 'src/middleware/layouts';
import type { MultisigAsset } from 'src/models/multisig';

export const getMultisigVaults = async (
  connection: Connection,
  multisigId: PublicKey,
  multisigAddressPK: PublicKey,
) => {
  const [multisigSigner] = PublicKey.findProgramAddressSync([multisigId.toBuffer()], multisigAddressPK);

  // TODO: Do this better, this kills us
  const accountInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 32, bytes: multisigSigner.toBase58() } }, { dataSize: ACCOUNT_LAYOUT.span }],
  });

  if (!accountInfos?.length) {
    return [];
  }

  return accountInfos.map(t => {
    const tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
    return {
      mint: tokenAccount.mint,
      owner: tokenAccount.owner,
      amount: new BN(tokenAccount.amount),
      delegateOption: tokenAccount.delegateOption,
      delegate: tokenAccount.delegate,
      state: tokenAccount.state,
      isNativeOption: tokenAccount.isNativeOption,
      isNative: tokenAccount.isNative,
      delegatedAmount: tokenAccount.delegatedAmount,
      closeAuthorityOption: tokenAccount.closeAuthorityOption,
      closeAuthority: tokenAccount.closeAuthority,
      address: t.pubkey,
      decimals: tokenAccount.decimals,
    } as MultisigAsset;
  });
};
