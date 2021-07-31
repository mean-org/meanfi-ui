import type Transport from "@ledgerhq/hw-transport";
import type { Transaction } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
import { notify } from "../../utils/notifications";
import { getPublicKey, signTransaction } from "./core";
import EventEmitter from "eventemitter3";
import { Wallet as IWallet } from '@project-serum/anchor/dist/provider';

export class LedgerWalletAdapter
  extends EventEmitter
  implements IWallet {
  _connecting: boolean;
  _publicKey: PublicKey | null;
  _transport: Transport | null;

  constructor() {
    super();
    this._connecting = false;
    this._publicKey = null;
    this._transport = null;
  }

  get publicKey() {
    return this._publicKey as PublicKey;
  }

  async signTransaction(transaction: Transaction) {
    if (!this._transport || !this.publicKey) {
      throw new Error("Not connected to Ledger");
    }

    // @TODO: account selection (derivation path changes with account)
    const signature = await signTransaction(this._transport, transaction);

    transaction.addSignature(this.publicKey, signature);

    return transaction;
  }

  async signAllTransactions(transactions: Transaction[]) {
    if (!this._transport || !this.publicKey) {
      throw new Error("Not connected to Ledger");
    }

    // @TODO: account selection (derivation path changes with account)
    for (let tx of transactions) {
      const signature = await signTransaction(this._transport, tx);
      tx.addSignature(this.publicKey, signature);
    }

    return transactions;
  }

  async connect(t?: any) {
    if (this._connecting) {
      return;
    }

    this._connecting = true;

    try {
      // @TODO: transport selection (WebUSB, WebHID, bluetooth, ...)
      this._transport = await TransportWebUSB.create();
      // @TODO: account selection
      this._publicKey = await getPublicKey(this._transport);
      this.emit("connect", this.publicKey);
    } catch (error) {
      if (t) {
        notify({
          message: t('notifications.error-ledger-title'),
          description: error.message,
          type: 'error'
        });
      } else {
        notify({
          message: "Ledger Error",
          description: error.message,
        });
      }
      await this.disconnect();
    } finally {
      this._connecting = false;
    }
  }

  async disconnect() {
    let emit = false;
    if (this._transport) {
      await this._transport.close();
      this._transport = null;
      emit = true;
    }

    this._connecting = false;
    this._publicKey = null;

    if (emit) {
      this.emit("disconnect");
    }
  }
}
