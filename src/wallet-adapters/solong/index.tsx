import { PublicKey, Transaction } from "@solana/web3.js";
import { notify } from "../../utils/notifications";
import EventEmitter from "eventemitter3";
import { Wallet as IWallet } from '@project-serum/anchor/dist/provider';

export class SolongWalletAdapter
  extends EventEmitter
  implements IWallet {
  private _publicKey: PublicKey | null;
  _onProcess: boolean;

  constructor() {
    super();
    this._publicKey = null;
    this._onProcess = false;
    this.connect = this.connect.bind(this);
  }

  get publicKey() {
    return this._publicKey!;
  }

  async signTransaction(transaction: Transaction) {
    return (window as any).solong.signTransaction(transaction);
  }

  async signAllTransactions(transactions: Transaction[]) {
    if (!this._publicKey) {
      throw new Error("Not connected");
    }

    return (window as any).solong.signAllTransactions(transactions);
  }

  async connect() {
    if (this._onProcess) {
      return;
    }

    if ((window as any).solong === undefined) {
      notify({
        message: "Solong Error",
        description: "Please install solong wallet from Chrome ",
      });
      return;
    }

    this._onProcess = true;
    (window as any).solong
      .selectAccount()
      .then((account: any) => {
        this._publicKey = new PublicKey(account);
        this.emit("connect", this._publicKey);
      })
      .catch(() => {
        this.disconnect();
      })
      .finally(() => {
        this._onProcess = false;
      });
  }

  async disconnect() {
    if (this._publicKey) {
      this._publicKey = PublicKey.default;
      this.emit("disconnect");
    }
  }

  public async sign(msg: string): Promise<{
    signature: Buffer;
    publicKey: PublicKey;

  }> {

    let enc = new TextEncoder(),
        buffer = enc.encode(msg),
        data = {
            signature: Buffer.alloc(0),
            publicKey: PublicKey.default
        };

    // if (typeof this.sign === 'function') {
    //     data = await this.sign(buffer, 'utf-8');
    // } else {
    //     throw Error('Invalid provider');
    // }

    return data;
  }

}
