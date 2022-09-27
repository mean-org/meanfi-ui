/* eslint-disable @typescript-eslint/no-var-requires */
import { environment } from "../environments/environment";
import { osName, isBrowser, browserName, browserVersion } from "react-device-detect";
import { isLocal, isProd } from "../middleware/ui";
import { appConfig } from "..";
import { WALLET_PROVIDERS } from "../contexts/wallet";

export function objectToJson(obj: any): string {
    return JSON.stringify(obj, null, 2);
}

const Loggly = require('loggly-jslogger');
export const logger = new Loggly.LogglyTracker();

export class LoggerJsonData {
    Application!: string;
    Environment!: string;
    Level!: LogLevel;
    osName!: string;
    MachineName!: string;
    Architecture?: string;
    Process?: string;
    Browser?: string;
    Message!: string;
    WalletAdapter?: string;
    Data?: any;
    Elapsed?: number;
    timestamp!: string;
}

export enum LogLevel {
    Info = 'Information',
    Warn = 'Warning',
    Error = 'Error'
}

export class CustomLoggerService {

    public applicationName: string;
    private walletProviderKey: string;
    private _canLogToConsole: boolean;

    constructor() {
        this._canLogToConsole = false;
        this.applicationName = appConfig.getConfig().logglyTag;
        this.walletProviderKey = 'walletName';
        logger.push({
            'logglyKey': appConfig.getConfig().logglyCustomerKey,
            'tag': this.applicationName,
            'subdomain': 'intelerit.com',
            'useDomainProxy': false
        });
        console.log(`%cLogger initialized!`, 'color:brown');
    }

    public set canLogToConsole(setting : boolean) {
        this._canLogToConsole = setting;
    }

    public get canLogToConsole() : boolean {
        return this._canLogToConsole;
    }

    public async logInfo(message: string, data?: any) {
        const infoData = this.getLoggerJsonData(message, LogLevel.Info, data);
        logger.push(infoData);
    }

    public async logWarning(message: string, data?: any) {
        const warningData = this.getLoggerJsonData(message, LogLevel.Warn, data);
        logger.push(warningData);
    }

    public async logError(message: string, data?: any) {
        const errorData = this.getLoggerJsonData(message, LogLevel.Error, data);
        if (isLocal()) {
            this.print('Loggly logger not available for localhost', 'print then', 'orange');
            this.print('loggerJsonData:', errorData, 'blue');
            return;
        }
        logger.push(errorData);
    }

    public print(msg: any, value?: any, color = 'black') {
        if (this._canLogToConsole || isLocal()) {
            if (msg) {
                if (value === undefined) {
                    console.log(`%c${msg}`, `color: ${color}`);
                } else {
                    console.log(`%c${msg}`, `color: ${color}`, value);
                }
            }
        }
    }

    private getEnv(): string {
        switch (environment) {
            case 'production':
                return 'Production'
            case 'staging':
                return 'Staging'
            default:
                return 'Development'
        }
    }

    private getBrowser(): string {
        return `${browserName} ${browserVersion}`;
    }

    private getLoggerJsonData(message: string, level: LogLevel, data?: any): LoggerJsonData {
        const logBody: LoggerJsonData = {
            Application: this.applicationName,
            Environment: this.getEnv(),
            Level: level,
            osName,
            MachineName: window.location.hostname,
            Architecture: process.arch,
            Message: message,
            timestamp: new Date().toISOString()
        };

        if (isBrowser) {
            logBody.Browser = this.getBrowser();
        } else {
            logBody.Process = process.title;
        }

        try {
            const item = window.localStorage.getItem(this.walletProviderKey);
            if (item) {
                const walletName = JSON.parse(item);
                const provider = WALLET_PROVIDERS.find(p => p.name === walletName);
                if (provider) {
                    logBody.WalletAdapter = provider.name;
                }
            }
        } catch (error) {
            console.warn(`Error reading localStorage key “${this.walletProviderKey}”:`, error);
        }

        if (data) {
            logBody.Data = isLocal() ? data : objectToJson(data);
        }
        return logBody;
    }
}
