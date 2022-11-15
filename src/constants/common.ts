import { Language } from 'models/languages';

// Intervals
export const ONE_MINUTE_REFRESH_TIMEOUT = 60 * 1000;
export const HALF_MINUTE_REFRESH_TIMEOUT = 30 * 1000;
export const FORTY_SECONDS_REFRESH_TIMEOUT = 40 * 1000;
export const FIVETY_SECONDS_REFRESH_TIMEOUT = 50 * 1000;
export const SEVENTY_SECONDS_REFRESH_TIMEOUT = 70 * 1000;
export const THREE_MINUTES_REFRESH_TIMEOUT = 3 * 60 * 1000;
export const FIVE_MINUTES_REFRESH_TIMEOUT = 5 * 60 * 1000;
export const TEN_MINUTES_REFRESH_TIMEOUT = 10 * 60 * 1000;
export const THIRTY_MINUTES_REFRESH_TIMEOUT = 30 * 60 * 1000;
export const TRANSACTION_STATUS_RETRY = 3 * 1000; // Retry fetch transaction status every 3 seconds
export const TRANSACTION_STATUS_RETRY_TIMEOUT = 40 * 1000; // Max timeout for trying fetch
export const PERFORMANCE_SAMPLE_INTERVAL = 60 * 1000;
export const PERFORMANCE_THRESHOLD = 1400; // Min TPS to show the top bar (1400 but can be changed)
export const INPUT_DEBOUNCE_TIME = 400;
export const MIN_SOL_BALANCE_REQUIRED = 0.05;
export const TRANSACTIONS_PER_PAGE = 15;
export const ACCOUNTS_LOW_BALANCE_LIMIT = 0.01; // Minimum balance to start showing user account tokens in accounts page
export const MIN_SLIPPAGE_VALUE = 0.1;
export const DEFAULT_SLIPPAGE_PERCENT = 1;
export const MAX_SLIPPAGE_VALUE = 20;
export const MAX_TOKEN_LIST_ITEMS = 100;
export const MAX_MULTISIG_PARTICIPANTS = 10;
export const MEAN_MULTISIG_ACCOUNT_LAMPORTS = 1_000_000;
export const CUSTOM_TOKEN_NAME = 'Custom token';
export const INTEGER_INPUT_AMOUNT_PATTERN = /^[1-9]\d*$/;
export const DATEPICKER_FORMAT = 'MM/DD/YYYY';
export const TIMEPICKER_FORMAT = 'h:mm a';
export const SIMPLE_DATE_FORMAT = 'mm/dd/yyyy';
export const SIMPLE_DATE_TIME_FORMAT = 'mm/dd/yyyy HH:MM';
export const SIMPLE_DATE_TIME_FORMAT_WITH_SECONDS = 'mm/dd/yyyy HH:MM:ss';
export const UTC_DATE_TIME_FORMAT = 'UTC:ddd, dd mmm HH:MM:ss';
export const UTC_DATE_TIME_FORMAT2 = 'UTC:ddd, dd mmm HH:MM:ss Z';
export const UTC_FULL_DATE_TIME_FORMAT = "UTC:dddd, mmm dS 'at' HH:MM Z";
export const VERBOSE_DATE_FORMAT = 'ddd mmm dd yyyy';
export const VERBOSE_DATE_TIME_FORMAT = 'ddd mmm dd yyyy HH:MM';
export const GOOGLE_ANALYTICS_PROD_TAG_ID = 'G-5Q840FEC0G';
export const SOLANA_WALLET_GUIDE = 'https://docs.solana.com/wallet-guide';
export const SOLANA_EXPLORER_URI_INSPECT_ADDRESS = 'https://solana.fm/account/';
export const SOLANA_EXPLORER_URI_INSPECT_TRANSACTION = 'https://solana.fm/tx/';
export const SOLANA_STATUS_PAGE = 'https://status.solana.com/';
export const MEAN_FINANCE_WEBSITE_URL = 'https://meanfi.com';
export const MEAN_FINANCE_APP_ALLBRIDGE_URL = 'https://app.allbridge.io';
export const MEAN_FINANCE_APP_RENBRIDGE_URL =
  'https://bridge.renproject.io/mint';
export const MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL =
  'https://forms.gle/buhxAR44YFGQxVX57';
export const MEAN_FINANCE_DISCORD_URL = 'https://discord.gg/qBKDgm49js';
export const MEAN_FINANCE_TWITTER_URL = 'https://twitter.com/meanfinance';
export const MEAN_DAO_GITHUB_ORG_URL = 'https://github.com/mean-dao';
export const MEAN_DAO_GITBOOKS_URL = 'https://meandao.gitbook.io/meanfi';
export const MEAN_DAO_MEDIUM_BLOG_URL = 'https://meandao.medium.com/';
export const WRAPPED_SOL_MINT_ADDRESS =
  'So11111111111111111111111111111111111111112';
export const SOLANA_ACCOUNT_INCINERATOR =
  '1nc1nerator11111111111111111111111111111111';
export const MEANFI_DOCS_URL = 'https://docs.meandao.org/';
export const MEANFI_SUPPORT_URL = 'https://help.meanfi.com/';
export const MEANFI_METRICS_URL =
  'https://metrics.meanfi.com/d/XE-qyJnnk/meanfi-metrics?orgId=1';
export const MSP_FEE_TREASURY = '3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw';
export const FALLBACK_COIN_IMAGE = '/assets/coin-error.svg';
export const fallbackImgSrc =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6UAAABRWlDQ1BJQ0MgUHJvZmlsZQAAKJFjYGASSSwoyGFhYGDIzSspCnJ3UoiIjFJgf8LAwSDCIMogwMCcmFxc4BgQ4ANUwgCjUcG3awyMIPqyLsis7PPOq3QdDFcvjV3jOD1boQVTPQrgSkktTgbSf4A4LbmgqISBgTEFyFYuLykAsTuAbJEioKOA7DkgdjqEvQHEToKwj4DVhAQ5A9k3gGyB5IxEoBmML4BsnSQk8XQkNtReEOBxcfXxUQg1Mjc0dyHgXNJBSWpFCYh2zi+oLMpMzyhRcASGUqqCZ16yno6CkYGRAQMDKMwhqj/fAIcloxgHQqxAjIHBEugw5sUIsSQpBobtQPdLciLEVJYzMPBHMDBsayhILEqEO4DxG0txmrERhM29nYGBddr//5/DGRjYNRkY/l7////39v///y4Dmn+LgeHANwDrkl1AuO+pmgAAADhlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAAqACAAQAAAABAAAAwqADAAQAAAABAAAAwwAAAAD9b/HnAAAHlklEQVR4Ae3dP3PTWBSGcbGzM6GCKqlIBRV0dHRJFarQ0eUT8LH4BnRU0NHR0UEFVdIlFRV7TzRksomPY8uykTk/zewQfKw/9znv4yvJynLv4uLiV2dBoDiBf4qP3/ARuCRABEFAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghggQAQZQKAnYEaQBAQaASKIAQJEkAEEegJmBElAoBEgghgg0Aj8i0JO4OzsrPv69Wv+hi2qPHr0qNvf39+iI97soRIh4f3z58/u7du3SXX7Xt7Z2enevHmzfQe+oSN2apSAPj09TSrb+XKI/f379+08+A0cNRE2ANkupk+ACNPvkSPcAAEibACyXUyfABGm3yNHuAECRNgAZLuYPgEirKlHu7u7XdyytGwHAd8jjNyng4OD7vnz51dbPT8/7z58+NB9+/bt6jU/TI+AGWHEnrx48eJ/EsSmHzx40L18+fLyzxF3ZVMjEyDCiEDjMYZZS5wiPXnyZFbJaxMhQIQRGzHvWR7XCyOCXsOmiDAi1HmPMMQjDpbpEiDCiL358eNHurW/5SnWdIBbXiDCiA38/Pnzrce2YyZ4//59F3ePLNMl4PbpiL2J0L979+7yDtHDhw8vtzzvdGnEXdvUigSIsCLAWavHp/+qM0BcXMd/q25n1vF57TYBp0a3mUzilePj4+7k5KSLb6gt6ydAhPUzXnoPR0dHl79WGTNCfBnn1uvSCJdegQhLI1vvCk+fPu2ePXt2tZOYEV6/fn31dz+shwAR1sP1cqvLntbEN9MxA9xcYjsxS1jWR4AIa2Ibzx0tc44fYX/16lV6NDFLXH+YL32jwiACRBiEbf5KcXoTIsQSpzXx4N28Ja4BQoK7rgXiydbHjx/P25TaQAJEGAguWy0+2Q8PD6/Ki4R8EVl+bzBOnZY95fq9rj9zAkTI2SxdidBHqG9+skdw43borCXO/ZcJdraPWdv22uIEiLA4q7nvvCug8WTqzQveOH26fodo7g6uFe/a17W3+nFBAkRYENRdb1vkkz1CH9cPsVy/jrhr27PqMYvENYNlHAIesRiBYwRy0V+8iXP8+/fvX11Mr7L7ECueb/r48eMqm7FuI2BGWDEG8cm+7G3NEOfmdcTQw4h9/55lhm7DekRYKQPZF2ArbXTAyu4kDYB2YxUzwg0gi/41ztHnfQG26HbGel/crVrm7tNY+/1btkOEAZ2M05r4FB7r9GbAIdxaZYrHdOsgJ/wCEQY0J74TmOKnbxxT9n3FgGGWWsVdowHtjt9Nnvf7yQM2aZU/TIAIAxrw6dOnAWtZZcoEnBpNuTuObWMEiLAx1HY0ZQJEmHJ3HNvGCBBhY6jtaMoEiJB0Z29vL6ls58vxPcO8/zfrdo5qvKO+d3Fx8Wu8zf1dW4p/cPzLly/dtv9Ts/EbcvGAHhHyfBIhZ6NSiIBTo0LNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiECRCjUbEPNCRAhZ6NSiAARCjXbUHMCRMjZqBQiQIRCzTbUnAARcjYqhQgQoVCzDTUnQIScjUohAkQo1GxDzQkQIWejUogAEQo121BzAkTI2agUIkCEQs021JwAEXI2KoUIEKFQsw01J0CEnI1KIQJEKNRsQ80JECFno1KIABEKNdtQcwJEyNmoFCJAhELNNtScABFyNiqFCBChULMNNSdAhJyNSiEC/wGgKKC4YMA4TAAAAABJRU5ErkJggg==';

// Route base paths
export const MULTISIG_ROUTE_BASE_PATH = '/super-safe';
export const VESTING_ROUTE_BASE_PATH = '/vesting';
export const STAKING_ROUTE_BASE_PATH = '/staking';
export const CREATE_SAFE_ROUTE_PATH = '/create-safe';

export const UNAUTHENTICATED_ROUTES = ['/stats', '/custody'];

export const meanFiHeaders = new Headers();
meanFiHeaders.append('X-Api-Version', '1.0');
meanFiHeaders.append('content-type', 'application/json;charset=UTF-8');
export const requestOptions: RequestInit = {
  headers: meanFiHeaders,
};

export const LANGUAGES: Language[] = [
  {
    code: 'en',
    isoName: 'English',
    name: 'English',
    flag: '/assets/flags/us.svg',
    locale: 'en-US',
  },
  {
    code: 'es',
    isoName: 'Spanish',
    name: 'Español',
    flag: '/assets/flags/es.svg',
    locale: 'es-ES',
  },
  {
    code: 'fa',
    isoName: 'Farsi',
    name: 'فارسی',
    flag: '/assets/flags/ir.svg',
    locale: 'fa-IR',
  },
  {
    code: 'fr',
    isoName: 'French',
    name: 'Français',
    flag: '/assets/flags/fr.svg',
    locale: 'fr-FR',
  },
  {
    code: 'pt',
    isoName: 'Portuguese',
    name: 'Português',
    flag: '/assets/flags/br.svg',
    locale: 'pt-BR',
  },
  {
    code: 'tr',
    isoName: 'Turkish',
    name: 'Türkçe',
    flag: '/assets/flags/tr.svg',
    locale: 'tr-TR',
  },
  {
    code: 'zh',
    isoName: 'Chinese',
    name: '中國人',
    flag: '/assets/flags/cn.svg',
    locale: 'zh-CN',
  },
  {
    code: 'vi',
    isoName: 'Vietnamese',
    name: 'Tiếng Việt',
    flag: '/assets/flags/vn.svg',
    locale: 'vi-VN',
  },
  {
    code: 'ko',
    isoName: 'Korean',
    name: 'T한국인',
    flag: '/assets/flags/kr.svg',
    locale: 'ko-KR',
  },
  // {
  //     code: 'ru',
  //     isoName: 'Russian',
  //     name: 'Russian',
  //     flag: '/assets/flags/ru.svg',
  //     locale: 'ru-RU'
  // },
];

export const DAO_CORE_TEAM_WHITELIST = [
  '657iCEUXfuYRPrxYsMMiG1nQ8CaqsFRVX1GxBXHGUFXi', // ERR
  '7kjcW2QHa9pN5e9Fx7LBM3kVwxCi3KteBtM7BMVzrMX4', // MRP
  'JAMR7AvQSbU3v6tfNidEZE3odxoRCahGFgiA4ksvdDkJ', // MRP
  '8XkcFZsRcQCtVxRCsqAbtKTsm4mj9CW9vbNPBtjqYWXw', // MRP
  'ETo8bzsqfqS1ZcNK7W49vNe5pHh2qgE6jKaC2JTPyJDE', // MRP
  'CmbwXRT5z5aCxCzATqm5aZr7XpTh2AN7ToG35csw7YV', // Moe
  'GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1', // YAF
  'FkRtTexEwLtYerHRKUku7ZZJx1VuTqxwGF636nAuer3B', // YAF
  'DG6nJknzbAq8xitEjMEqUbc77PTzPDpzLjknEXn3vdXZ', // YAF
  'DA5hKdQLFQpMM95M1KwbRHnjQbvkvMEPUfaULjjrMPWw', // MT
  '746bzDBsHjjTG6UByDhj8z3ozdqV1sfujH9pAKMdeyuU', // MT
  'HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv', // PNL
  'eKWANE4MKkxq6HgQ1EWjW6WY158fHUMgyJWnhCD9kPi', // PNL
  '49XcDH9tWX67uw53TzNrPE5ovGsXd7VxgH735jBg6K64', // PL
  '9gB9rcJiaKq6iXcJn8AqD5xoxTr3ZLPHpFGWRaVx99jH', // TAB trader
  '4esXsAJjoExvhPZf1EMvDaajJeCTm72EYt3aurn3fFUG', // J
  'EjchiDcivSQnC282UF4d751JDd7vMb2VCFrQaNeUAjwz', // J
  'c8fLDB5oFSwGnwAV1LGQqaadHt2WbvWv7o79YnnUWxd', // J
  '5rtv52oecUAYAMXN9UzYBwoHGsRD1arLQN6WmRfcMDBP', // J
  'B1HWEeZCC6Hy3PF24TUmnW8x23oxQirkKwootk27kQTb', // D
  'F4cjCGtoG3Q58c8Qm3DQSq7m74nDYvUBFwSqReRAeZ23', // D
  '468Z5p52439dAqjLzBm2FCNxvDSnpbMsNx85b7Kmz3TQ', // Ayaz
  '4gCGAWB4bVva2tsEsjmK8iVEKobs3ZsZB7n9HShGnN4o', // Ayaz
  'Ej5zJzej7rrUoDngsJ3jcpfuvfVyWpcDcK7uv9cE2LdL', // Maxim Credix
  '63cUbJ3yecyduEPPYbPERPSJzAy6ZnRWvjE6u4qkkAVd', // Maxim Credix 2
  'E9Z6RHa2Bhf7d5T455FKCag9gNbvqHuAcF3vgwkYHWGy', // INNA
];

export const BIGNUMBER_FORMAT = {
  prefix: '',
  decimalSeparator: '.',
  groupSeparator: ',',
  groupSize: 3,
  secondaryGroupSize: 0,
  fractionGroupSeparator: ' ',
  fractionGroupSize: 0,
  suffix: '',
};

// Date.UTC(year, month, day, hour, minute, second, millisecond)
// REAL DATES
export const IDO_START_DATE = {
  year: 2021,
  month: 11,
  day: 22,
  hour: 15,
  minute: 0,
  second: 0,
};
export const IDO_FETCH_FREQUENCY = 5 * 60 * 1000; // IDO data fetch polling interval

export const NO_FEES = {
  blockchainFee: 0,
  mspFlatFee: 0,
  mspPercentFee: 0,
};

export const sentreAppId = 'meanfi';
