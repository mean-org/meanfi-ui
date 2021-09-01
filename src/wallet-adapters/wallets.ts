import { MessageSignerWalletAdapter, SignerWalletAdapter, WalletAdapter } from '@solana/wallet-adapter-base';
import { Coin98WalletAdapter, Coin98WalletAdapterConfig } from './coin98';
import { MathWalletWalletAdapter, MathWalletWalletAdapterConfig } from './mathwallet';
import { PhantomWalletAdapter, PhantomWalletAdapterConfig } from './phantom';
import { SolflareWalletAdapter, SolflareWalletAdapterConfig } from './solflare';
import { SolongWalletAdapter, SolongWalletAdapterConfig } from './solong';
import { WalletConnectWalletAdapter, WalletConnectWalletAdapterConfig } from './walletconnect';

export enum WalletName {
    Bitpie = 'Bitpie',
    Coin98 = 'Coin98',
    Ledger = 'Ledger',
    MathWallet = 'MathWallet',
    Phantom = 'Phantom',
    Solflare = 'Solflare',
    SolflareWeb = 'Solflare (Web)',
    Sollet = 'Sollet',
    Solong = 'Solong',
    Torus = 'Torus',
    WalletConnect = 'WalletConnect',
}

export interface Wallet {
    name: WalletName;
    url: string;
    icon: string;
    adapter: () => WalletAdapter | SignerWalletAdapter | MessageSignerWalletAdapter;
}

const ICONS_URL = "/assets/wallets/";

export const getCoin98Wallet = (config?: Coin98WalletAdapterConfig): Wallet => ({
    name: WalletName.Coin98,
    url: 'https://coin98.com',
    icon: `${ICONS_URL}/coin98.svg`,
    adapter: () => new Coin98WalletAdapter(config),
});

export const getMathWallet = (config?: MathWalletWalletAdapterConfig): Wallet => ({
    name: WalletName.MathWallet,
    url: 'https://mathwallet.org',
    icon: `${ICONS_URL}/mathwallet.svg`,
    adapter: () => new MathWalletWalletAdapter(config),
});

export const getPhantomWallet = (config?: PhantomWalletAdapterConfig): Wallet => ({
    name: WalletName.Phantom,
    url: 'https://www.phantom.app',
    icon: `${ICONS_URL}/phantom.svg`,
    adapter: () => new PhantomWalletAdapter(config),
});

export const getSolflareWallet = (config?: SolflareWalletAdapterConfig): Wallet => ({
    name: WalletName.Solflare,
    url: 'https://solflare.com',
    icon: `${ICONS_URL}/solflare.svg`,
    adapter: () => new SolflareWalletAdapter(config),
});

export const getSolongWallet = (config?: SolongWalletAdapterConfig): Wallet => ({
    name: WalletName.Solong,
    url: 'https://solongwallet.com',
    icon: `${ICONS_URL}/solong.png`,
    adapter: () => new SolongWalletAdapter(config),
});

export const getWalletConnectWallet = (config: WalletConnectWalletAdapterConfig): Wallet => ({
    name: WalletName.WalletConnect,
    url: 'https://walletconnect.org',
    icon: `${ICONS_URL}/walletconnect.svg`,
    adapter: () => new WalletConnectWalletAdapter(config),
});

// export const getTorusWallet = (config: TorusWalletAdapterConfig): Wallet => ({
//     name: WalletName.Torus,
//     url: 'https://tor.us',
//     icon: `${ICONS_URL}/torus.svg`,
//     adapter: () => new TorusWalletAdapter(config),
// });
