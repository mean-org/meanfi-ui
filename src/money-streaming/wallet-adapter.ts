import { Wallet as IWallet } from '@project-serum/anchor/dist/provider';
import { PublicKey, Transaction } from '@solana/web3.js';
import EventEmitter from 'eventemitter3';

export interface WalletAdapter extends EventEmitter, IWallet {
    publicKey: PublicKey;
    signTransaction: (transaction: Transaction) => Promise<Transaction>;
    connect: () => any;
    disconnect: () => any;
}

// export class WalletAdapter implements IWalletAdapter {

    // provider: any;

    // constructor(provider: any, network: string) {
    //     console.log('provider ctor', provider);
    //     // super(provider, network);
    //     this.provider = provider;
    // }

    // get publicKey(): PublicKey {
    //     return super.publicKey || PublicKey.default;
    // }

    // set publicKey(value: PublicKey) {
    //     this.publicKey = value;
    // }

    // public async signMessage(msg: string): Promise<{
    //     signature: Buffer;
    //     publicKey: PublicKey | null;

    // }> {

    //     let self = this;
    //     let enc = new TextEncoder(),
    //         buffer = enc.encode(msg),
    //         data = {
    //             signature: Buffer.alloc(0),
    //             publicKey: PublicKey.default
    //         };

    //     if (!self.provider) {
    //         throw Error('Invalid provider');
    //     }

    //     console.log('Mi clase:', self);
    //     if (typeof self.sign === 'function') {
    //         data = await super.sign(buffer, 'hex');
    //     } else if (typeof self.provider.signMessage === 'function') {
    //         data = self.provider.signMessage(buffer, 'utf-8');
    //     } else {
    //         throw Error('Invalid provider');
    //     }

    //     return data;
    // }
// }
