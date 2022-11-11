import type {
  SendTransactionOptions,
  WalletName,
} from '@solana/wallet-adapter-base';
import {
  scopePollingDetectionStrategy,
  BaseMessageSignerWalletAdapter,
  WalletReadyState,
} from '@solana/wallet-adapter-base';
import {
  Connection,
  Transaction,
  TransactionSignature,
  VersionedTransaction,
} from '@solana/web3.js';

// Check if wallet runs inside of extension, we pass query param to iframe there
const isInXnftWalletParam =
  Object.fromEntries(new URLSearchParams(window.location.search))
    .isInXnftWallet === 'true';

declare global {
  interface Window {
    xnft: any; // TODO
  }
}

const xnft = window.xnft;

let connected = false;
xnft?.once?.('connect', () => {
  connected = true;
});

export const isInXnftWallet = () => {
  return !!xnft && isInXnftWalletParam;
};

export const XnftWalletName = 'Xnft' as WalletName<'Xnft'>;

const xnftIcon =
  'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKIHdpZHRoPSIxNTEuMDAwMDAwcHQiIGhlaWdodD0iMTUxLjAwMDAwMHB0IiB2aWV3Qm94PSIwIDAgMTUxLjAwMDAwMCAxNTEuMDAwMDAwIgogcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCI+Cgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLjAwMDAwMCwxNTEuMDAwMDAwKSBzY2FsZSgwLjEwMDAwMCwtMC4xMDAwMDApIgpmaWxsPSIjRDE0QzQ2IiBzdHJva2U9Im5vbmUiPgo8cGF0aCBkPSJNNjYwIDE0OTcgYy01OCAtMTYgLTExMyAtNTAgLTEzNCAtODIgLTkgLTEzIC0xNiAtMjYgLTE2IC0yNyAwIC0yCjEwOCAtMyAyNDAgLTMgMTMyIDAgMjQwIDMgMjQwIDggMCAyMCAtODAgODQgLTEyMCA5NiAtNjQgMTkgLTE1OCAyMyAtMjEwIDh6Ii8+CjxwYXRoIGQ9Ik01MTggMTI2MSBjLTczIC0yNCAtMTE2IC01MSAtMTY2IC0xMDUgLTkwIC05NyAtMTEzIC0xNzcgLTExOSAtNDE3Ci01IC0xNjUgLTQgLTE4NyAxMSAtMjAyIDE2IC0xNiA2MCAtMTcgNTA0IC0xNyAyOTAgMCA0OTMgNCA1MDIgMTAgMjQgMTUgMjEKMzQyIC00IDQzMyAtNDMgMTU2IC0xNDkgMjYyIC0zMDMgMzAyIC04NiAyMiAtMzUwIDIwIC00MjUgLTR6IG0zMjQgLTEzNyBjMTM5Ci04OSA2OSAtMzA0IC05OCAtMzA0IC05MyAwIC0xNzcgMTAxIC0xNjAgMTkzIDIzIDEyMyAxNTIgMTc5IDI1OCAxMTF6Ii8+CjxwYXRoIGQ9Ik0yNDYgMzk0IGMtMTMgLTEzIC0xNiAtNDIgLTE2IC0xNTggMCAtMTY4IDkgLTIwMiA1NiAtMjIyIDQ5IC0yMQo4NzkgLTIxIDkyOCAwIDQ3IDIwIDU2IDU0IDU2IDIyMiAwIDExNiAtMyAxNDUgLTE2IDE1OCAtMTQgMTQgLTczIDE2IC01MDQgMTYKLTQzMSAwIC00OTAgLTIgLTUwNCAtMTZ6Ii8+CjwvZz4KPC9zdmc+';

export class XnftWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = XnftWalletName;
  url = 'https://www.backpack.app/';
  icon = xnftIcon;

  readonly supportedTransactionVersions = null;
  private _status: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private _readyState: WalletReadyState = isInXnftWallet()
    ? WalletReadyState.NotDetected
    : WalletReadyState.Unsupported;

  constructor(config = {}) {
    super();

    if (this._readyState === WalletReadyState.Unsupported) return;

    scopePollingDetectionStrategy(() => {
      this.emit('readyStateChange', WalletReadyState.Installed);
      return true;
    });
  }

  get publicKey() {
    return xnft.publicKey;
  }

  get connecting() {
    return this._status === 'connecting';
  }

  get connected() {
    return this._status === 'connected';
  }

  get readyState() {
    return this._readyState;
  }

  async connect(): Promise<void> {
    if (this._status !== 'disconnected') return;

    this._status = 'connecting';
    if (connected) {
      this._onConnected();
      return undefined;
    }

    return new Promise((resolve, reject) => {
      xnft.once('connect', () => {
        this._onConnected();
        resolve();
      });
    });
  }

  _onConnected = () => {
    this.emit('connect', xnft.publicKey);
    this._status = 'connected';
  };

  async disconnect(): Promise<void> {}

  async sendTransaction(
    transaction: Transaction,
    connection: Connection,
    options: SendTransactionOptions = {},
  ): Promise<TransactionSignature> {
    return await xnft.solana.send(transaction, undefined, options);
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(
    transaction: T,
  ): Promise<T> {
    return await xnft.solana.signTransaction(transaction);
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    transactions: T[],
  ): Promise<T[]> {
    return await xnft.solana.signAllTransaction(transactions);
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    return await xnft.solana.signMessage(message);
  }
}
