import { Connection, MemcmpFilter, PublicKey } from "@solana/web3.js";
import { ProgramAccounts } from "models/accounts";
import { BPF_LOADER_UPGRADEABLE_PID } from "./ids";
import { consoleOut } from "./ui";

export const getProgramsByUpgradeAuthority = async (
  connection: Connection,
  selectedAccountAddress: string,
): Promise<ProgramAccounts[]> => {

  if (!connection || !selectedAccountAddress) {
    return [];
  }

  const execDataAccountsFilter: MemcmpFilter = {
    memcmp: { offset: 13, bytes: selectedAccountAddress },
  };

  const execDataAccounts = await connection.getProgramAccounts(
    BPF_LOADER_UPGRADEABLE_PID,
    {
      filters: [execDataAccountsFilter],
    },
  );

  if (execDataAccounts.length === 0) {
    return [];
  }

  const programs: ProgramAccounts[] = [];
  const group = (size: number, data: any) => {
    const result = [];
    for (let i = 0; i < data.length; i += size) {
      result.push(data.slice(i, i + size));
    }
    return result;
  };

  const sleep = (ms: number, log = true) => {
    if (log) {
      consoleOut('Sleeping for', ms / 1000, 'seconds');
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  const getProgramAccountsPromise = async (execDataAccount: any) => {
    const execAccountsFilter: MemcmpFilter = {
      memcmp: { offset: 4, bytes: execDataAccount.pubkey.toBase58() },
    };

    const execAccounts = await connection.getProgramAccounts(
      BPF_LOADER_UPGRADEABLE_PID,
      {
        dataSlice: { offset: 0, length: 0 },
        filters: [execAccountsFilter],
      },
    );

    if (execAccounts.length === 0) {
      return;
    }

    if (execAccounts.length > 1) {
      throw new Error(
        `More than one program was found for program data account '${execDataAccount.pubkey.toBase58()}'`,
      );
    }

    consoleOut('programAccounts from middleware:', execAccounts, 'blue');

    programs.push({
      pubkey: execAccounts[0].pubkey,
      owner: execAccounts[0].account.owner,
      executable: execDataAccount.pubkey,
      upgradeAuthority: new PublicKey(selectedAccountAddress),
      size: execDataAccount.account.data.byteLength,
    } as ProgramAccounts);
  };

  const execDataAccountsGroups = group(8, execDataAccounts);

  for (const groupItem of execDataAccountsGroups) {
    const promises: Promise<any>[] = [];
    for (const dataAcc of groupItem) {
      promises.push(getProgramAccountsPromise(dataAcc));
    }
    await Promise.all(promises);
    sleep(1_000, false);
  }

  return programs;
}
