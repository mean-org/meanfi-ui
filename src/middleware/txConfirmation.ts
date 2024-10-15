import type { Connection, SignatureStatus, TransactionConfirmationStatus, TransactionSignature } from '@solana/web3.js';

interface ConfirmTransactionOptions {
  connection: Connection;
  signature: TransactionSignature;
  desiredConfirmationStatus: TransactionConfirmationStatus;
  timeout?: number;
  pollInterval?: number;
  searchTransactionHistory?: boolean;
}

const confirmTransaction = async ({
  connection,
  signature,
  desiredConfirmationStatus = 'confirmed',
  timeout = 30_000,
  pollInterval = 1000,
  searchTransactionHistory = false,
}: ConfirmTransactionOptions): Promise<SignatureStatus> => {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const { value: statuses } = await connection.getSignatureStatuses([signature], { searchTransactionHistory });

    if (!statuses || statuses.length === 0) {
      throw new Error('Failed to get signature status');
    }

    const status = statuses[0];

    if (status === null) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      continue;
    }

    if (status.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
    }

    if (status.confirmationStatus && status.confirmationStatus === desiredConfirmationStatus) {
      return status;
    }

    if (status.confirmationStatus === 'finalized') {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
};

export default confirmTransaction;
