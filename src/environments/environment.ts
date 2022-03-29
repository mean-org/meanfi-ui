export let environment: string;

export interface AppConfig {
    appUrl: string;
    apiUrl: string;
    transakUrl: string;
    transakApiKey: string;
    streamProgramAddress: string;
    streamV2ProgramAddress: string;
    segmentAnalyticsKey: string;
    influxDbUrl: string;
    influxDbToken: string;
    influxDbOrg: string;
    influxDbBucket: string;
    logglyCustomerKey: string;
    logglyTag: string;
    idoAccountAddress: string;
    idoAirdropTreasuryAddress: string;
    idoAirdropTreasurerAddress: string;
    exchangeFeeAccountOwner: string;
    exchangeFlatFee: number;
    stakingRewardsAcl: string[];
    meanStakingVault: string;
}

export class AppConfigService {

    private readonly CONFIG: { [env: string]: AppConfig } = {
        production: {
            appUrl: 'https://app.meanfi.com',
            apiUrl: 'https://tempo-api.meanops.com',
            transakUrl: 'https://global.transak.com',
            transakApiKey: 'ba0eae8b-fed1-4c2f-8e62-2b8a69ac60d0',
            streamProgramAddress: 'H6wJxgkcc93yeUFnsZHgor3Q3pSWgGpEysfqKrwLtMko',
            streamV2ProgramAddress: 'MSPCUMbLfy2MeT6geLMMzrUkv1Tx88XRApaVRdyxTuu',
            segmentAnalyticsKey: 'TPMrxxFTOatu7SCEMDBfMTThsPdqp4VU',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'AcVhBSCQ8XE9nTpR5cf2Gv8aU420BG-eKbxYDX-_PQ_qwyE4YS0oXeZFd8drfMkossPRs-fKqFMf7cbqxXatng==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-prod',
            logglyCustomerKey: '8aaea666-b5e8-469b-828a-89c9ca60cdef',
            logglyTag: 'MeanFiWebApp',
            idoAccountAddress: 'E7hiYsz4SRAXjadPYbjML2VDSfY1CwGUYFkHWU9yvk7n',
            idoAirdropTreasuryAddress: 'GFfFaytdGYtiXWfNuJXPusWjS5T792hvr4t6xnAJXEd6',
            idoAirdropTreasurerAddress: '9KYCrkB4LLC3HxLEPqE2PJpvYoDLszgWPKNVWp74uhC5',
            exchangeFeeAccountOwner: 'CLazQV1BhSrxfgRHko4sC8GYBU3DoHcX4xxRZd12Kohr',
            exchangeFlatFee: 0.25,
            stakingRewardsAcl: [],
            meanStakingVault: ''
        },
        // dev and local will have same config
        development: {
            appUrl: 'https://app-dev.meanfi.com',
            apiUrl: 'https://tempo-api-dev.meanops.com',
            transakUrl: 'https://staging-global.transak.com',
            transakApiKey: '7ad31a0c-3cf3-4c1e-bb59-e92973007787',
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            streamV2ProgramAddress: 'MSPCUMbLfy2MeT6geLMMzrUkv1Tx88XRApaVRdyxTuu',
            segmentAnalyticsKey: '1VSk356IiaThR9fBBDko2QMJFDas33Yf',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'TJZtqtjU7WWWXs6OOP4xXqBB2O1G7bew53NJbU5nhbxou_Oo6TGw5owVwSxsBJbrJ70zeusJydAUwhr8L5mB-A==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev',
            logglyCustomerKey: '8aaea666-b5e8-469b-828a-89c9ca60cdef',
            logglyTag: 'MeanFiWebApp',
            idoAccountAddress: '7Aq5qVfeubLqYmrjQr8gPwL4JPHCA51QG69VeLYrtvHG',
            idoAirdropTreasuryAddress: '7AoKzQPk16CVHdy2k3T2G41K8jfCdf2wgkMkwXmYWv54',
            idoAirdropTreasurerAddress: 'GYHuK9gPVPJm7VqgFX7wKQ93U9rPCwKqjzLh32P1Ed4G',
            exchangeFeeAccountOwner: 'CLazQV1BhSrxfgRHko4sC8GYBU3DoHcX4xxRZd12Kohr',
            exchangeFlatFee: 0.25,
            stakingRewardsAcl: [
                '657iCEUXfuYRPrxYsMMiG1nQ8CaqsFRVX1GxBXHGUFXi',
                'GFefRR6EASXvnphnJApp2PRH1wF1B5pJijKBZGFzq1x1',
                'HGb43H86jJNLN4MW1sDWKruUZYrs3rkNQkf3acF8uXiv',
                '49XcDH9tWX67uw53TzNrPE5ovGsXd7VxgH735jBg6K64'
            ],
            meanStakingVault: 'EaGj1rHR8HmfYPMDZiEU2qqntbqmZVtWNsmVviw31EiD'
        },
        local: {
            appUrl: 'http://localhost:3000',
            apiUrl: 'https://tempo-api-dev.meanops.com',
            transakUrl: 'https://staging-global.transak.com',
            transakApiKey: '7ad31a0c-3cf3-4c1e-bb59-e92973007787',
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            streamV2ProgramAddress: 'MSPCUMbLfy2MeT6geLMMzrUkv1Tx88XRApaVRdyxTuu',
            segmentAnalyticsKey: '1VSk356IiaThR9fBBDko2QMJFDas33Yf',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'TJZtqtjU7WWWXs6OOP4xXqBB2O1G7bew53NJbU5nhbxou_Oo6TGw5owVwSxsBJbrJ70zeusJydAUwhr8L5mB-A==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev',
            logglyCustomerKey: '8aaea666-b5e8-469b-828a-89c9ca60cdef',
            logglyTag: 'MeanFiWebApp',
            idoAccountAddress: '7Aq5qVfeubLqYmrjQr8gPwL4JPHCA51QG69VeLYrtvHG',
            idoAirdropTreasuryAddress: '7AoKzQPk16CVHdy2k3T2G41K8jfCdf2wgkMkwXmYWv54',
            idoAirdropTreasurerAddress: 'GYHuK9gPVPJm7VqgFX7wKQ93U9rPCwKqjzLh32P1Ed4G',
            exchangeFeeAccountOwner: 'CLazQV1BhSrxfgRHko4sC8GYBU3DoHcX4xxRZd12Kohr',
            exchangeFlatFee: 0.25,
            stakingRewardsAcl: [],
            meanStakingVault: 'EaGj1rHR8HmfYPMDZiEU2qqntbqmZVtWNsmVviw31EiD'
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
