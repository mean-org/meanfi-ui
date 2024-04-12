import type { PublicKey, Transaction } from '@solana/web3.js';
import type EventEmitter from 'eventemitter3';

export interface WalletAdapter extends EventEmitter {
  publicKey: PublicKey;
  connect: () => void;
  disconnect: () => void;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAllTransactions: (txs: Transaction[]) => Promise<Transaction[]>;
}
