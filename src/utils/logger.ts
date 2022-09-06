/* eslint-disable @typescript-eslint/no-var-requires */
import { environment } from "../environments/environment";
import { osName, isBrowser, browserName, browserVersion } from "react-device-detect";
import { consoleOut, isLocal } from "./ui";
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

    constructor() {
        this.applicationName = appConfig.getConfig().logglyTag;
        this.walletProviderKey = 'walletName';
        logger.push({
            'logglyKey': appConfig.getConfig().logglyCustomerKey,
            'tag': this.applicationName,
            'subdomain': 'intelerit.com',
            'useDomainProxy': false
        });
        console.log(`%cLoggly logger initialized!`, 'color:brown');
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
            consoleOut('Loggly logger not available for localhost', 'consoleOut then', 'orange');
            consoleOut('loggerJsonData:', errorData, 'blue');
            return;
        }
        logger.push(errorData);
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
