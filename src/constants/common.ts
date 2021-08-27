import { Language } from "../models/languages";

export const PRICE_REFRESH_TIMEOUT = 10 * 60 * 1000;
export const STREAMS_REFRESH_TIMEOUT = 5 * 60 * 1000;
export const NON_NEGATIVE_AMOUNT_PATTERN = /^(0*[0-9][0-9]*(\.[0-9]*)?|0*\.[0-9]*[1-9][0-9]*)$/;
export const POSITIVE_NUMBER_PATTERN = /^([0]*?([1-9]\d*)(\.0{1,2})?)$/;
export const DATEPICKER_FORMAT = 'MM/DD/YYYY';
export const SIMPLE_DATE_FORMAT = 'mm/dd/yyyy';
export const SIMPLE_DATE_TIME_FORMAT = 'mm/dd/yyyy HH:MM TT';
export const VERBOSE_DATE_FORMAT = 'ddd mmm dd yyyy';
export const VERBOSE_DATE_TIME_FORMAT = 'ddd mmm dd yyyy HH:MM TT';
export const SOLANA_EXPLORER_URI_INSPECT_ADDRESS = 'https://explorer.solana.com/address/';
export const SOLANA_EXPLORER_URI_INSPECT_TRANSACTION = 'https://explorer.solana.com/tx/';
export const MEAN_FINANCE_WEBSITE_URL = 'https://meanfi.com';
export const MEAN_FINANCE_APP_ALLBRIDGE_URL = 'https://app.allbridge.io';
export const MEAN_FINANCE_APP_RENBRIDGE_URL = 'https://bridge.renproject.io/mint';
export const MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL = 'https://forms.gle/buhxAR44YFGQxVX57';
export const MEAN_FINANCE_ABOUT_URL = 'https://about.meanfi.com/';
export const MEAN_FINANCE_HOWTOS_URL = 'https://docs.meanfi.com/';
export const MEAN_FINANCE_DISCORD_URL = 'https://discord.gg/GMMS3whn';
export const MEAN_FINANCE_WALLET_GUIDE_URL = 'https://bearemet.gitbook.io/meanfi/wallet-guide';
export const WRAPPED_SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';
export const MEANFI_METRICS_URL = 'https://metrics.meanfi.com/d/XE-qyJnnk/meanfi-metrics?orgId=1&var-meanfi_env=meanfi-dev&refresh=5m&kiosk=tv';

export const LANGUAGES: Language[] = [
    {
        code: 'en',
        flag: 'assets/flags/us.svg'
    },
    {
        code: 'es',
        flag: 'assets/flags/es.svg'
    },
    {
        code: 'fr',
        flag: 'assets/flags/fr.svg'
    },
    {
        code: 'pt',
        flag: 'assets/flags/br.svg'
    },
];
