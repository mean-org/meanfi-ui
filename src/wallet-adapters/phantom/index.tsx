import { PublicKey, Transaction } from "@solana/web3.js";
import { notify } from "../../utils/notifications";
import { WalletAdapter } from "../../money-streaming/wallet-adapter";
import { EventEmitter } from "eventemitter3";

type PhantomEvent = "disconnect" | "connect";
type PhantomRequestMethod =
  | "connect"
  | "disconnect"
  | "signTransaction"
  | "signAllTransactions";

interface PhantomProvider {
  publicKey?: PublicKey;
  isConnected?: boolean;
  autoApprove?: boolean;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  on: (event: PhantomEvent, handler: (args: any) => void) => void;
  request: (method: PhantomRequestMethod, params: any) => Promise<any>;
  listeners: (event: PhantomEvent) => (() => void)[];
  signMessage: (
    message: Uint8Array | string, encoding: string
  ) => Promise<{
    signature: Buffer;
    publicKey: PublicKey;
  }>;
}

export class PhantomWalletAdapter
  extends EventEmitter
  implements WalletAdapter {
  constructor() {
    super();
    this.connect = this.connect.bind(this);
  }

  private get _provider(): PhantomProvider | undefined {
    if ((window as any)?.solana?.isPhantom) {
      return (window as any).solana;
    }
    return undefined;
  }

  private _handleConnect = (...args: any) => {
    this.emit("connect", ...args);
  };

  private _handleDisconnect = (...args: any) => {
    this.emit("disconnect", ...args);
  };

  get connected() {
    return this._provider?.isConnected || false;
  }

  get autoApprove() {
    return this._provider?.autoApprove || false;
  }

  // eslint-disable-next-line
  async signAllTransactions(
    transactions: Transaction[]
  ): Promise<Transaction[]> {
    if (!this._provider) {
      return transactions;
    }

    return this._provider.signAllTransactions(transactions);
  }

  get publicKey() {
    return this._provider?.publicKey!;
  }

  // eslint-disable-next-line
  async signTransaction(transaction: Transaction) {
    if (!this._provider) {
      return transaction;
    }

    return this._provider.signTransaction(transaction);
  }

  async connect() {
    if (!this._provider) {
      return;
    }

    if (!(window as any).solana.isPhantom) {
      notify({
        message: "Phantom Error",
        description: "Please install Phantom wallet from Chrome ",
      });
      return;
    }

    if (this._provider && !this._provider.listeners("connect").length) {
      this._provider?.on("connect", this._handleConnect);
    }
    if (!this._provider.listeners("disconnect").length) {
      this._provider?.on("disconnect", this._handleDisconnect);
    }
    return await this._provider?.connect();
  }

  async disconnect() {
    if (this._provider) {
      await this._provider.disconnect();
    }
  }

  public async signMessage(msg: string): Promise<{
    signature: Buffer;
    publicKey: PublicKey;

  }> {

    let enc = new TextEncoder(),
        buffer = enc.encode(msg),
        data = {
            signature: Buffer.alloc(0),
            publicKey: PublicKey.default
        };

    console.log('_provider in signMessage', this._provider);
    if (!this._provider) {
        throw Error('Invalid provider');
    }

    if (typeof this._provider.signMessage === 'function') {
        data = await this._provider.signMessage(buffer, 'utf-8');
    } else {
      console.log('_provider has NO signMessage function');
      throw Error('Invalid provider');
    }

    return data;
  }

}
