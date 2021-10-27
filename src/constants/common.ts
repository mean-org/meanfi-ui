import { Language } from "../models/languages";

export const TRANSACTIONS_PER_PAGE = 15;
export const ACCOUNTS_LOW_BALANCE_LIMIT = 0.1; // Minimum balance to start showing user account tokens in /accounts
export const PRICE_REFRESH_TIMEOUT = 10 * 60 * 1000;
export const STREAMS_REFRESH_TIMEOUT = 5 * 60 * 1000;
export const TRANSACTION_STATUS_RETRY = 3 * 1000;            // Retry fetch transaction status every 3 seconds
export const TRANSACTION_STATUS_RETRY_TIMEOUT = 30 * 1000;   // Max timeout for trying fetch
export const NON_NEGATIVE_AMOUNT_PATTERN = /^(0*[0-9][0-9]*(\.[0-9]*)?|0*\.[0-9]*[1-9][0-9]*)$/;
export const POSITIVE_NUMBER_PATTERN = /^([0]*?([1-9]\d*)(\.0{1,2})?)$/;
export const DATEPICKER_FORMAT = 'MM/DD/YYYY';
export const SIMPLE_DATE_FORMAT = 'mm/dd/yyyy';
export const SIMPLE_DATE_TIME_FORMAT = 'mm/dd/yyyy HH:MM TT';
export const VERBOSE_DATE_FORMAT = 'ddd mmm dd yyyy';
export const VERBOSE_DATE_TIME_FORMAT = 'ddd mmm dd yyyy HH:MM TT';
export const GOOGLE_ANALYTICS_PROD_TAG_ID = 'G-5Q840FEC0G';
export const SOLANA_WALLET_GUIDE = 'https://docs.solana.com/wallet-guide';
export const SOLANA_EXPLORER_URI_INSPECT_ADDRESS = 'https://explorer.solana.com/address/';
export const SOLANA_EXPLORER_URI_INSPECT_TRANSACTION = 'https://explorer.solana.com/tx/';
export const MEAN_FINANCE_WEBSITE_URL = 'https://meanfi.com';
export const MEAN_FINANCE_APP_ALLBRIDGE_URL = 'https://app.allbridge.io';
export const MEAN_FINANCE_APP_RENBRIDGE_URL = 'https://bridge.renproject.io/mint';
export const MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL = 'https://forms.gle/buhxAR44YFGQxVX57';
export const MEAN_FINANCE_DISCORD_URL = 'https://discord.gg/qBKDgm49js';
export const MEAN_FINANCE_TWITTER_URL = 'https://twitter.com/meanfinance';
export const MEAN_DAO_GITHUB_ORG_URL = 'https://github.com/mean-dao';
export const MEAN_DAO_GITBOOKS_URL = 'https://meandao.gitbook.io/meanfi';
export const MEAN_DAO_MEDIUM_BLOG_URL = 'https://meandao.medium.com/';
export const WRAPPED_SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';
export const MEANFI_METRICS_URL = 'https://metrics.meanfi.com/d/XE-qyJnnk/meanfi-metrics?orgId=1';
export const FALLBACK_COIN_IMAGE = 'assets/coin-error.svg';
export const BANNED_TOKENS = [
    'CRT',
    'FROG',
    'DGX',
    'DOGA',
    'CHIH',
    'INO',
    'GSTONKS'
];

export const meanFiHeaders = new Headers();
meanFiHeaders.append('X-Api-Version', '1.0');
export const requestOptions: RequestInit = {
  headers: meanFiHeaders
}

export const LANGUAGES: Language[] = [
    {
        code: 'en',
        name: 'English',
        flag: 'assets/flags/us.svg',
        locale: 'en-US'
    },
    {
        code: 'es',
        name: 'Español',
        flag: 'assets/flags/es.svg',
        locale: 'es-ES'
    },
    {
        code: 'fr',
        name: 'Français',
        flag: 'assets/flags/fr.svg',
        locale: 'fr-FR'
    },
    {
        code: 'pt',
        name: 'Português',
        flag: 'assets/flags/br.svg',
        locale: 'pt-BR'
    },
];
