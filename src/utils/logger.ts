import { environment } from "../environments/environment";
import { osName } from "react-device-detect";

const Loggly = require('loggly-jslogger');
export const logger = new Loggly.LogglyTracker();
logger.push({
    'logglyKey': process.env.REACT_APP_LOGGLY_CUSTOMER_TOKEN,
    'tag': process.env.REACT_APP_LOGGLY_TAG,
    'subdomain': 'intelerit.com'
});
console.log('logger:', logger);

export class LoggerJsonData {
    Application!: string;
    Environment!: string;
    Level!: LogLevel;
    osName!: string;
    MachineName!: string;
    Architecture?: string;
    Process?: string;
    Message!: string;
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

    constructor() {
        this.applicationName = process.env.REACT_APP_LOGGLY_TAG as string;
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

    private getLoggerJsonData(message: string, level: LogLevel, data?: any): LoggerJsonData {
        let logBody: LoggerJsonData = {
            Application: this.applicationName,
            Environment: this.getEnv(),
            Level: level,
            osName,
            MachineName: window.location.hostname,
            Architecture: process.arch,
            Process: process.title,
            Message: message,
            timestamp: new Date().toISOString()
        };
        if (data) {
            logBody.Data = data;
        }
        return logBody;
    }
}
