export let environment: string;

export interface AppConfig {
    streamProgramAddress: string;
}

export class AppConfigService {

    private readonly CONFIG: { [env: string]: AppConfig } = {
        production: {
            streamProgramAddress: '7GsGvccB8LMbVhbhB1Zo8erVC82xDpoEgrm4EBbxBWcj'
        },
        development: {
            streamProgramAddress: '7GsGvccB8LMbVhbhB1Zo8erVC82xDpoEgrm4EBbxBWcj'
        },
        staging: {
            streamProgramAddress: '37z61WhJCAaDADwcpJRHgr66FUhHB9TfkS49Ssvp3Cdb'
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
