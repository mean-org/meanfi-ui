import { AccountInfo, Commitment, Connection, PublicKey } from "@solana/web3.js"

export async function getFilteredProgramAccounts(
  connection: Connection,
  programId: PublicKey,
  filters: any
  
): Promise<{ publicKey: PublicKey; accountInfo: AccountInfo<Buffer> }[]> {

  // @ts-ignore
  const resp = await connection._rpcRequest('getProgramAccounts', [
    programId.toBase58(),
    {
      commitment: connection.commitment,
      filters,
      encoding: 'base64'
    }
  ]);

  if (resp.error) {
    throw new Error(resp.error.message);
  }

  // @ts-ignore
  return resp.result.map(({ pubkey, account: { data, executable, owner, lamports } }) => ({
    publicKey: new PublicKey(pubkey),
    accountInfo: {
      data: Buffer.from(data[0], 'base64'),
      executable,
      owner: new PublicKey(owner),
      lamports
    }
  }));
}
  
export async function getFilteredProgramAccountsCache(
  connection: Connection,
  programId: PublicKey,
  filters: any

): Promise<{ publicKey: PublicKey; accountInfo: AccountInfo<Buffer> }[]> {

  try {
    const resp = await (
      await fetch('https://api.raydium.io/cache/rpc', {
        method: 'POST',
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getProgramAccounts',
          params: [
            programId.toBase58(),
            {
              commitment: connection.commitment,
              filters,
              encoding: 'base64'
            }
          ]
        })
      })
    ).json();

    if (resp.error) {
      throw new Error(resp.error.message);
    }

    // @ts-ignore
    return resp.result.map(({ pubkey, account: { data, executable, owner, lamports } }) => ({
      publicKey: new PublicKey(pubkey),
      accountInfo: {
        data: Buffer.from(data[0], 'base64'),
        executable,
        owner: new PublicKey(owner),
        lamports
      }
    }));

  } catch (e) {
    return getFilteredProgramAccounts(connection, programId, filters);
  }
}

// getMultipleAccounts
export async function getMultipleAccounts(
  connection: Connection,
  publicKeys: PublicKey[],
  commitment?: Commitment

): Promise<Array<null | { publicKey: PublicKey; account: AccountInfo<Buffer> }>> {

  const keys: PublicKey[][] = [];
  let tempKeys: PublicKey[] = [];

  publicKeys.forEach((k) => {
    if (tempKeys.length >= 100) {
      keys.push(tempKeys);
      tempKeys = [];
    }
    tempKeys.push(k)
  });

  if (tempKeys.length > 0) {
    keys.push(tempKeys);
  }

  const accounts: Array<null | {
    executable: any
    owner: PublicKey
    lamports: any
    data: Buffer
  }> = []

  const resArray: { [key: number]: any } = {};

  await Promise.all(
    keys.map(async (key, index) => {
      const res = await connection.getMultipleAccountsInfo(key, commitment);
      resArray[index] = res;
    })
  );

  Object.keys(resArray)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .forEach((itemIndex) => {
      const res = resArray[parseInt(itemIndex)]
      for (const account of res) {
        accounts.push(account)
      }
    });

  return accounts.map((account, idx) => {
    if (account === null) {
      return null
    }
    return {
      publicKey: publicKeys[idx],
      account
    }
  });
}