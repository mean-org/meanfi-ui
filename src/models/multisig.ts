import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BPF_LOADER_PROGRAM_ID, Keypair, PublicKey } from "@solana/web3.js";
import { MEAN_MULTISIG } from "../utils/ids";
import { OperationType } from "./enums";

export enum MultisigTransactionStatus {
  // No enough signatures
  Pending = 0,
  // Approved by the required amount of signers
  Approved = 1,
  // Successfully executed (didExecute = true)
  Executed = 2
};

export type MultisigAccountInfo = {
  id: PublicKey;
  label: string;
  address: PublicKey;
  owners: PublicKey[];
  threshold: number;
  nounce: number;
  ownerSeqNumber: number;
  createdOnUtc: Date;
  pendingTxsAmount: number;
};

export type MultisigTransactionInfo = {
  id: PublicKey;
  operation: OperationType;
  multisig: PublicKey;
  programId: PublicKey;
  signers: number;
  createdOn: Date;
  executedOn: Date | undefined,
  status: MultisigTransactionStatus
}


export const TestMultisigAccounts: MultisigAccountInfo[] = [];
export const TestMultisigTransactions: Array<any> = new Array<any>();

const initMultisigAccounts = async () => {
  const TestMultisigAccount1 = Keypair.generate();
  const TestMultisigAccount2 = Keypair.generate();
  const [multisigAddressOne, nounceOne] = await PublicKey.findProgramAddress(
    [TestMultisigAccount1.publicKey.toBuffer()],
    MEAN_MULTISIG
  );

  const [multisigAddressTwo, nounceTwo] = await PublicKey.findProgramAddress(
    [TestMultisigAccount2.publicKey.toBuffer()],
    MEAN_MULTISIG
  );

  TestMultisigAccounts.push(...[
    {
      id: TestMultisigAccount1.publicKey,
      address: multisigAddressOne,
      label: "Test Multisig One",
      nounce: nounceOne,
      owners: [
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ],
      threshold: 2,
      createdOnUtc: new Date(),
      ownerSeqNumber: 0,
      pendingTxsAmount: 2,
    },
    {
      id: TestMultisigAccount2.publicKey,
      address: multisigAddressTwo,
      label: "Test Multisig Two",
      nounce: nounceTwo,
      owners: [
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ],
      threshold: 3,
      createdOnUtc: new Date(),
      ownerSeqNumber: 0,
      pendingTxsAmount: 7,
    },
  ]);    

  TestMultisigTransactions.push(...[
      {
        id: Keypair.generate().publicKey,
        operation: OperationType.MintToken,
        multisig: TestMultisigAccount1.publicKey,
        programId: TOKEN_PROGRAM_ID,
        signers: 2,
        status: MultisigTransactionStatus.Approved,
        createdOn: new Date(),
        executedOn: undefined,
      },
      {
        id: Keypair.generate().publicKey,
        operation: OperationType.TransferTokens,
        multisig: TestMultisigAccount1.publicKey,
        programId: TOKEN_PROGRAM_ID,
        signers: 1,
        status: MultisigTransactionStatus.Pending,
        createdOn: new Date(),
        executedOn: undefined,
      },
      {
        id: Keypair.generate().publicKey,
        operation: OperationType.UpgradeProgram,
        multisig: TestMultisigAccount2.publicKey,
        programId: BPF_LOADER_PROGRAM_ID,
        signers: 0,
        status: MultisigTransactionStatus.Pending,
        createdOn: new Date(),
        executedOn: new Date(),
      },
      {
        id: Keypair.generate().publicKey,
        operation: OperationType.CreateVault,
        multisig: TestMultisigAccount2.publicKey,
        programId: MEAN_MULTISIG,
        signers: 3,
        status: MultisigTransactionStatus.Executed,
        createdOn: new Date(),
        executedOn: new Date(),
      },
    ]
  );

};

initMultisigAccounts().then(() => {}).catch(e => console.error(e));
