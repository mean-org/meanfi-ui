export let environment: string;

export interface AppConfig {
    streamProgramAddress: string;
    influxDbUrl: string;
    influxDbToken: string;
    influxDbOrg: string;
    influxDbBucket: string;
}

export class AppConfigService {

    private readonly CONFIG: { [env: string]: AppConfig } = {
        production: {
            streamProgramAddress: 'H6wJxgkcc93yeUFnsZHgor3Q3pSWgGpEysfqKrwLtMko',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'AcVhBSCQ8XE9nTpR5cf2Gv8aU420BG-eKbxYDX-_PQ_qwyE4YS0oXeZFd8drfMkossPRs-fKqFMf7cbqxXatng==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-prod'
        },
        staging: {
            streamProgramAddress: '37z61WhJCAaDADwcpJRHgr66FUhHB9TfkS49Ssvp3Cdb',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'T4-kVufYOioZNKsVvIeWrIcNlqdrQkc3gxvQSHxw7jZVgN7YOfF-1MpcSpcarKdt9ptkjkZGPl6VuA7s7WLXcw==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-stage'
        },
        // dev and local will have same config
        development: {
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'TJZtqtjU7WWWXs6OOP4xXqBB2O1G7bew53NJbU5nhbxou_Oo6TGw5owVwSxsBJbrJ70zeusJydAUwhr8L5mB-A==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev'
        },
        local: {
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            influxDbUrl: 'https://metrics.meanfi.com:8086',
            influxDbToken: 'TJZtqtjU7WWWXs6OOP4xXqBB2O1G7bew53NJbU5nhbxou_Oo6TGw5owVwSxsBJbrJ70zeusJydAUwhr8L5mB-A==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev'
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
