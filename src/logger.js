const winston = require('winston');
const { combine, timestamp, label, printf } = winston.format;
const { logLevel } = require('./config.json');

const logFormat = winston.format.printf(info => {
  return `${info.timestamp} [${info.level}]: ${info.message}`;
});

const logger = winston.createLogger({
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

export default logger;