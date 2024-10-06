import { TokenOwnerRecord, getGovernanceAccounts, pubkeyFilter } from '@solana/spl-governance';
import { type Connection, PublicKey } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { useEffect, useState } from 'react';

import { useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { appConfig } from 'src/main';

const getTokenOwnerRecordsForRealmMintMapByOwner = async (connection: Connection) => {
  const governingTokenMintPk = new PublicKey(appConfig.getConfig().realmsGoverningTokenMintPk);
  const programId = new PublicKey(appConfig.getConfig().realmsProgramId);
  const realmId = new PublicKey(appConfig.getConfig().realmId);

  const filter1 = pubkeyFilter(1, realmId);
  const filter2 = pubkeyFilter(1 + 32, governingTokenMintPk);
  if (!filter1 || !filter2) return [];

  return getGovernanceAccounts(connection, programId, TokenOwnerRecord, [filter1, filter2]);
};

type Args = {
  decimals: number;
};
const useRealmsDeposit = ({ decimals }: Args) => {
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [depositAmount, setDepositAmount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!publicKey) {
      setDepositAmount(0);
      return;
    }

    (async () => {
      if (!decimals) return;
      const records = await getTokenOwnerRecordsForRealmMintMapByOwner(connection);
      const record = records.find(r => r.account.governingTokenOwner.equals(publicKey));
      if (!record) return;

      setDepositAmount(
        new BigNumber(record.account.governingTokenDepositAmount.toNumber()).shiftedBy(-decimals).toNumber(),
      );
    })();
  }, [connection, publicKey, decimals]);

  return {
    depositAmount,
  };
};

export default useRealmsDeposit;
