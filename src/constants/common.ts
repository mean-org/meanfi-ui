import { Country, Language } from "../models/languages";

export const TRANSACTIONS_PER_PAGE = 15;
export const ACCOUNTS_LOW_BALANCE_LIMIT = 0.1; // Minimum balance to start showing user account tokens in /accounts
export const PRICE_REFRESH_TIMEOUT = 10 * 60 * 1000;
export const STREAMS_REFRESH_TIMEOUT = 5 * 60 * 1000;
export const TRANSACTION_STATUS_RETRY = 3 * 1000;            // Retry fetch transaction status every 3 seconds
export const TRANSACTION_STATUS_RETRY_TIMEOUT = 30 * 1000;   // Max timeout for trying fetch

export const MIN_SLIPPAGE_VALUE = 0.1;
export const DEFAULT_SLIPPAGE_PERCENT = 0.25;
export const MAX_SLIPPAGE_VALUE = 20;

export const INPUT_AMOUNT_PATTERN = /^[0-9]*[.,]?[0-9]*$/;
export const DATEPICKER_FORMAT = 'MM/DD/YYYY';
export const SIMPLE_DATE_FORMAT = 'mm/dd/yyyy';
export const SIMPLE_DATE_TIME_FORMAT = 'mm/dd/yyyy HH:MM TT';
export const SIMPLE_DATE_TIME_FORMAT_WITH_SECONDS = 'mm/dd/yyyy HH:MM:ss';
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
export const MEANFI_SUPPORT_URL = 'https://help.meanfi.com/';
export const MEANFI_METRICS_URL = 'https://metrics.meanfi.com/d/XE-qyJnnk/meanfi-metrics?orgId=1';
export const FALLBACK_COIN_IMAGE = '/assets/coin-error.svg';
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
        flag: '/assets/flags/us.svg',
        locale: 'en-US'
    },
    {
        code: 'es',
        name: 'Español',
        flag: '/assets/flags/es.svg',
        locale: 'es-ES'
    },
    {
        code: 'fr',
        name: 'Français',
        flag: '/assets/flags/fr.svg',
        locale: 'fr-FR'
    },
    {
        code: 'pt',
        name: 'Português',
        flag: '/assets/flags/br.svg',
        locale: 'pt-BR'
    },
];

export const ALLOWED_ADDRESSES_LIST = [
    '657iCEUXfuYRPrxYsMMiG1nQ8CaqsFRVX1GxBXHGUFXi', // ERR
    '7kjcW2QHa9pN5e9Fx7LBM3kVwxCi3KteBtM7BMVzrMX4', // MRP
    'JAMR7AvQSbU3v6tfNidEZE3odxoRCahGFgiA4ksvdDkJ', // MRP
    'GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1', // YAF
    'FkRtTexEwLtYerHRKUku7ZZJx1VuTqxwGF636nAuer3B', // YAF
    'FfdFf3EqcCuytTdeLvoELBh29WrAGVRjrm4595A2bRAR', // YGF
    'DA5hKdQLFQpMM95M1KwbRHnjQbvkvMEPUfaULjjrMPWw', // MT
    '9gB9rcJiaKq6iXcJn8AqD5xoxTr3ZLPHpFGWRaVx99jH', // TAB trader
    '8XkcFZsRcQCtVxRCsqAbtKTsm4mj9CW9vbNPBtjqYWXw', // ???
];

export const ALLOWED_DEBUG_ADDRESSES =[
    '657iCEUXfuYRPrxYsMMiG1nQ8CaqsFRVX1GxBXHGUFXi', // ERR
    'GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1', // YAF
    'FfdFf3EqcCuytTdeLvoELBh29WrAGVRjrm4595A2bRAR', // YGF
    'DA5hKdQLFQpMM95M1KwbRHnjQbvkvMEPUfaULjjrMPWw', // MT
];

// Date.UTC(year, month, day, hour, minute, second, millisecond)

// REAL DATES
// export const IDO_START_DATE = { year: 2021, month: 11, day: 15, hour: 14, minute: 0, second: 0 };
// export const IDO_END_DATE = { year: 2021, month: 11, day: 17, hour: 14, minute: 0, second: 0 };

// RUNNING IDO
export const IDO_START_DATE = { year: 2021, month: 10, day: 24, hour: 13, minute: 0, second: 0 };
export const IDO_END_DATE = { year: 2021, month: 10, day: 26, hour: 13, minute: 0, second: 0 };

export const IDO_MIN_CONTRIBUTION = 100;        // 100 USDC
export const IDO_CAP_VALUATION = 210000000;     // $210m
export const IDO_RAISE_FLOOR = 2100000;         // $2.1m

/*
Start Date: Dec 15 @ 3pm UTC
End Date: Dec 17 @ 3pm UTC
Price: Bonding Curve
Min Contribution: 100 USDC
Max Contribution: Bonding Curve
Cap Valuation: $210m 
Raise Floor: $2.1m
—————————————————
LIVE CHANGES
- Est $MEAN Price
- Max cap allowed
- Guaranteed allocation address list
—————————————————
NOTE: Only one active participation in the price bonding curve per wallet address.
*/

export const IDO_RESTRICTED_COUNTRIES: Country[] = [
    { isoCode: 'AF', name: 'Afghanistan' },
    { isoCode: 'CI', name: 'Ivory Coast' },
    { isoCode: 'CU', name: 'Cuba' },
    { isoCode: 'IQ', name: 'Iraq' },
    { isoCode: 'IR', name: 'Iran' },
    { isoCode: 'LR', name: 'Liberia' },
    { isoCode: 'KP', name: 'North Korea' },
    { isoCode: 'SY', name: 'Syria' },
    { isoCode: 'SD', name: 'Sudan' },
    { isoCode: 'SS', name: 'South Sudan' },
    { isoCode: 'ZW', name: 'Zimbabwe' },
    { isoCode: 'AG', name: 'Antigua' },
    { isoCode: 'US', name: 'United States' },
    { isoCode: 'AS', name: 'American Samoa' },
    { isoCode: 'GU', name: 'Guam' },
    { isoCode: 'MP', name: 'Northern Mariana Islands' },
    { isoCode: 'PR', name: 'Puerto Rico' },
    { isoCode: 'UM', name: 'United States Minor Outlying Islands' },
    { isoCode: 'VI', name: 'US Virgin Islands' },
    { isoCode: 'UA', name: 'Ukraine' },
    { isoCode: 'BY', name: 'Belarus' },
    { isoCode: 'AL', name: 'Albania' },
    { isoCode: 'MM', name: 'Burma' },
    { isoCode: 'CF', name: 'Central African Republic' },
    { isoCode: 'CD', name: 'Democratic Republic of Congo' },
    { isoCode: 'LY', name: 'Libya' },
    { isoCode: 'SO', name: 'Somalia' },
    { isoCode: 'YE', name: 'Yemen' },
    { isoCode: 'GB', name: 'United Kingdom' },
    { isoCode: 'TH', name: 'Thailand' }
];
