import { PollyClient } from "@aws-sdk/client-polly";

export interface PollyOptions {
    polly: PollyClient,
    voices: string[],
};