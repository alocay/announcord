import winston from "winston";
import Path from 'path'
import { logLevel } from "./config.json";

const { combine, timestamp, label, printf } = winston.format;

const logFormat = winston.format.printf(info => {
    return `[${info.moduleName}]: ${info.timestamp} [${info.level}]: ${info.message}`;
});

const winstonLogger = winston.createLogger({
    level: (logLevel ? logLevel : 'error'),
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
            format: 'DD-MM-YYYY HH:mm:ss'
        }),
        logFormat
    ),
    transports: [
        new winston.transports.Console()
    ]
});

export default (path: string) =>
    winstonLogger.child({
        moduleName: Path.parse(path).name
    });