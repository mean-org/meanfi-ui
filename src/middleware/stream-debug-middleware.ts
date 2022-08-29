import { MSP } from "@mean-dao/msp";
import { PublicKey } from "@solana/web3.js";

export const getStreamForDebug = async (address: PublicKey, msp: MSP): Promise<any> => {
    try {

        const response = msp.getStreamRaw(address);
        return response;

    } catch (error: any) {
        console.log(error);
        return null;
    }
};
