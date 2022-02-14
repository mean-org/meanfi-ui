import { Country, Language } from "../models/languages";

export const TRANSACTIONS_PER_PAGE = 15;
export const ACCOUNTS_LOW_BALANCE_LIMIT = 0.1; // Minimum balance to start showing user account tokens in /accounts
export const EXCHANGE_ROUTES_REFRESH_TIMEOUT = 60 * 1000;
export const PRICE_REFRESH_TIMEOUT = 10 * 60 * 1000;
export const STREAMS_REFRESH_TIMEOUT = 5 * 60 * 1000;
export const TRANSACTION_STATUS_RETRY = 3 * 1000;            // Retry fetch transaction status every 3 seconds
export const TRANSACTION_STATUS_RETRY_TIMEOUT = 30 * 1000;   // Max timeout for trying fetch
export const PERFORMANCE_SAMPLE_INTERVAL = 20 * 1000;
export const PERFORMANCE_SAMPLE_INTERVAL_FAST = 5 * 1000;
export const PERFORMANCE_THRESHOLD = 1100;  // Min TPS to show the top bar (1100 but can be changed)

export const MIN_SLIPPAGE_VALUE = 0.1;
export const DEFAULT_SLIPPAGE_PERCENT = 1;
export const MAX_SLIPPAGE_VALUE = 20;
export const MAX_TOKEN_LIST_ITEMS = 50;
export const MAX_MULTISIG_PARTICIPANTS = 10;

export const INPUT_AMOUNT_PATTERN = /^[0-9]*[.,]?[0-9]*$/;
export const DATEPICKER_FORMAT = 'MM/DD/YYYY';
export const SIMPLE_DATE_FORMAT = 'mm/dd/yyyy';
export const SIMPLE_DATE_TIME_FORMAT = 'mm/dd/yyyy HH:MM';
export const SIMPLE_DATE_TIME_FORMAT_WITH_SECONDS = 'mm/dd/yyyy HH:MM:ss';
export const UTC_DATE_TIME_FORMAT = "UTC:ddd, dd mmm HH:MM:ss";
export const UTC_DATE_TIME_FORMAT2 = "UTC:ddd, dd mmm HH:MM:ss Z";
export const UTC_FULL_DATE_TIME_FORMAT = "UTC:dddd, mmm dS 'at' HH:MM Z";
export const VERBOSE_DATE_FORMAT = 'ddd mmm dd yyyy';
export const VERBOSE_DATE_TIME_FORMAT = 'ddd mmm dd yyyy HH:MM';
export const GOOGLE_ANALYTICS_PROD_TAG_ID = 'G-5Q840FEC0G';
export const SOLANA_WALLET_GUIDE = 'https://docs.solana.com/wallet-guide';
export const SOLANA_EXPLORER_URI_INSPECT_ADDRESS = 'https://solscan.io/account/';
export const SOLANA_EXPLORER_URI_INSPECT_TRANSACTION = 'https://solscan.io/tx/';
export const SOLANA_STATUS_PAGE = 'https://status.solana.com/';
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
export const MEANFI_DOCS_URL = 'https://docs.meanfi.com/';
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
meanFiHeaders.append('content-type', 'application/json;charset=UTF-8');
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
    {
        code: 'tr',
        name: 'Türkçe',
        flag: '/assets/flags/tr.svg',
        locale: 'tr-TR'
    },
    {
        code: 'zh',
        name: '中國人',
        flag: '/assets/flags/cn.svg',
        locale: 'zh-CN'
    },
];

export const ALLOWED_ADDRESSES_LIST = [
    '657iCEUXfuYRPrxYsMMiG1nQ8CaqsFRVX1GxBXHGUFXi', // ERR
    '7kjcW2QHa9pN5e9Fx7LBM3kVwxCi3KteBtM7BMVzrMX4', // MRP
    'JAMR7AvQSbU3v6tfNidEZE3odxoRCahGFgiA4ksvdDkJ', // MRP
    '8XkcFZsRcQCtVxRCsqAbtKTsm4mj9CW9vbNPBtjqYWXw', // MRP
    'ETo8bzsqfqS1ZcNK7W49vNe5pHh2qgE6jKaC2JTPyJDE', // MRP
    'GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1', // YAF
    'FkRtTexEwLtYerHRKUku7ZZJx1VuTqxwGF636nAuer3B', // YAF
    'FfdFf3EqcCuytTdeLvoELBh29WrAGVRjrm4595A2bRAR', // YGF
    'DA5hKdQLFQpMM95M1KwbRHnjQbvkvMEPUfaULjjrMPWw', // MT
    '9PLqBWNkjegBdz4UD5LYSswWVXfxMf8hUsK2R9b3Lj23', // AMA
    'HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv', // PNL
    '49XcDH9tWX67uw53TzNrPE5ovGsXd7VxgH735jBg6K64', // PL
    'HvPJ1eSqAnUtoC1dfKCAaDDFaWviHkbfBWoYJmP1BUDa', // TBM
    '9gB9rcJiaKq6iXcJn8AqD5xoxTr3ZLPHpFGWRaVx99jH', // TAB trader
];

// Date.UTC(year, month, day, hour, minute, second, millisecond)
// REAL DATES
export const IDO_START_DATE = { year: 2021, month: 11, day: 22, hour: 15, minute: 0, second: 0 };
export const IDO_FETCH_FREQUENCY = 5 * 60 * 1000;       // IDO data fetch polling interval

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
