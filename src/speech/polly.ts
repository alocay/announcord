import { PollyClient } from "@aws-sdk/client-polly";

class PollyWrapper {
    client: PollyClient;

    private static instance: PollyWrapper;

    private constructor() {
        this.client = new PollyClient({ region: "us-east-1" });
    }

    public static getInstance(): PollyWrapper {
        if(!PollyWrapper.instance) {
            PollyWrapper.instance = new PollyWrapper();
        }

        return PollyWrapper.instance;
    }
}

export const Polly: PollyWrapper = PollyWrapper.getInstance();