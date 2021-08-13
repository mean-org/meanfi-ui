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
            influxDbUrl: 'http://sql-dev.realdax.com:8086',
            influxDbToken: 'a4i5iXSy1-ECMwrpIXyTr_3nniXV_ewwwwCy9yNpYw2YT4jsj6zxiSQ35ylhTljFKWGJXxK0BVmbNTlaAWWFQg==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev'
        },
        staging: {
            streamProgramAddress: '37z61WhJCAaDADwcpJRHgr66FUhHB9TfkS49Ssvp3Cdb',
            influxDbUrl: 'http://sql-dev.realdax.com:8086',
            influxDbToken: 'a4i5iXSy1-ECMwrpIXyTr_3nniXV_ewwwwCy9yNpYw2YT4jsj6zxiSQ35ylhTljFKWGJXxK0BVmbNTlaAWWFQg==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev'
        },
        // dev and local will have same config
        development: {
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            influxDbUrl: 'http://sql-dev.realdax.com:8086',
            influxDbToken: 'a4i5iXSy1-ECMwrpIXyTr_3nniXV_ewwwwCy9yNpYw2YT4jsj6zxiSQ35ylhTljFKWGJXxK0BVmbNTlaAWWFQg==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev'
        },
        local: {
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k',
            influxDbUrl: 'http://sql-dev.realdax.com:8086',
            influxDbToken: 'a4i5iXSy1-ECMwrpIXyTr_3nniXV_ewwwwCy9yNpYw2YT4jsj6zxiSQ35ylhTljFKWGJXxK0BVmbNTlaAWWFQg==',
            influxDbOrg: 'meanops',
            influxDbBucket: 'meanfi-dev'
        },
    };

    constructor(private envName = '') {
        if (envName) {
            environment = envName;
        } else if (!environment) {
            environment = 'staging';
        }
    }

    public getConfig(env: string = '') {
        if (env) {
            return this.CONFIG[env];
        }
        return this.CONFIG[environment];
    }

}
