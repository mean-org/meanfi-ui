export let environment: string;

export interface AppConfig {
    streamProgramAddress: string;
}

export class AppConfigService {

    private readonly CONFIG: { [env: string]: AppConfig } = {
        production: {
            streamProgramAddress: 'H6wJxgkcc93yeUFnsZHgor3Q3pSWgGpEysfqKrwLtMko'
        },
        staging: {
            streamProgramAddress: '37z61WhJCAaDADwcpJRHgr66FUhHB9TfkS49Ssvp3Cdb'
        },
        development: {
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k'
        },
        local: {
            streamProgramAddress: '9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k'
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
