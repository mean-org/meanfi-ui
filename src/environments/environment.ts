export let environment: string;

export interface AppConfig {
    appUrl: string;
    apiUrl: string;
    transakUrl: string;
    transakApiKey: string;
    streamProgramAddress: string;
    influxDbUrl: string;
    influxDbToken: string;
    influxDbOrg: string;
    influxDbBucket: string;
    logglyCustomerKey: string;
    logglyTag: string;
    idoAccountAddress: string;
}

export class AppConfigService {

    private readonly CONFIG: { [env: string]: AppConfig } = {
        production: {
            appUrl: 'https://app.meanfi.com',
            apiUrl: 'https://tempo-api.meanops.com',
            transakUrl: 'https://global.transak.com',
            transakApiKey: 'ba0eae8b-fed1-4c2f-8e62-2b8a69ac60d0',
            streamProgramAddress: 'H6wJxgkcc93yeUFnsZHgor3Q3pSWgGpEysfqKrwLtMko',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'AcVhBSCQ8XE9nTpR5cf2Gv8aU420BG-eKbxYDX-_PQ_qwyE4YS0oXeZFd8drfMkossPRs-fKqFMf7cbqxXatng==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-prod',
            logglyCustomerKey: '8aaea666-b5e8-469b-828a-89c9ca60cdef',
            logglyTag: 'MeanFiWebApp',
            idoAccountAddress: ''
        },
        staging: {
            appUrl: 'https://app-stage.meanfi.com',
            apiUrl: 'https://tempo-api-dev.meanops.com',
            transakUrl: 'https://staging-global.transak.com',
            transakApiKey: '7ad31a0c-3cf3-4c1e-bb59-e92973007787',
            streamProgramAddress: '37z61WhJCAaDADwcpJRHgr66FUhHB9TfkS49Ssvp3Cdb',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'T4-kVufYOioZNKsVvIeWrIcNlqdrQkc3gxvQSHxw7jZVgN7YOfF-1MpcSpcarKdt9ptkjkZGPl6VuA7s7WLXcw==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-stage',
            logglyCustomerKey: '8aaea666-b5e8-469b-828a-89c9ca60cdef',
            logglyTag: 'MeanFiWebApp',
            idoAccountAddress: ''
        },
        // dev and local will have same config
        development: {
            appUrl: 'https://app-dev.meanfi.com',
            apiUrl: 'https://tempo-api-dev.meanops.com',
            transakUrl: 'https://staging-global.transak.com',
            transakApiKey: '7ad31a0c-3cf3-4c1e-bb59-e92973007787',
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'TJZtqtjU7WWWXs6OOP4xXqBB2O1G7bew53NJbU5nhbxou_Oo6TGw5owVwSxsBJbrJ70zeusJydAUwhr8L5mB-A==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev',
            logglyCustomerKey: '8aaea666-b5e8-469b-828a-89c9ca60cdef',
            logglyTag: 'MeanFiWebApp',
            idoAccountAddress: '4BQaqFFec8c4SKJQZj19d4KaHF94dntNQP9gKPx5q6Xv'
        },
        local: {
            appUrl: 'http://localhost:3000',
            apiUrl: 'https://tempo-api-dev.meanops.com',
            transakUrl: 'https://staging-global.transak.com',
            transakApiKey: '7ad31a0c-3cf3-4c1e-bb59-e92973007787',
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'TJZtqtjU7WWWXs6OOP4xXqBB2O1G7bew53NJbU5nhbxou_Oo6TGw5owVwSxsBJbrJ70zeusJydAUwhr8L5mB-A==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev',
            logglyCustomerKey: '8aaea666-b5e8-469b-828a-89c9ca60cdef',
            logglyTag: 'MeanFiWebApp',
            idoAccountAddress: '4BQaqFFec8c4SKJQZj19d4KaHF94dntNQP9gKPx5q6Xv'
        },
    };

    constructor(private envName = '') {
        if (envName) {
            environment = envName;
        } else if (!environment) {
            environment = 'production';
        }
    }

    public getConfig(env: string = '') {
        if (env) {
            return this.CONFIG[env];
        }
        return this.CONFIG[environment];
    }

}
