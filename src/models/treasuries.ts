import { TreasuryType } from "@mean-dao/money-streaming/lib/types";
import { PublicKey } from "@solana/web3.js";

export interface TreasuryTypeOption {
    name: string;
    type: TreasuryType;
    translationId: string;
    disabled: boolean;
}

export type StreamTreasuryType = "open" | "locked" | "unknown";

export interface TreasuryCreateOptions {
    treasuryName: string;
    treasuryType: TreasuryType;
    multisigId: string;
}

export interface StreamTreasuryInfo {
    id: string;
    isMultisigTreasury: boolean;
}

const treasuriesCache = new Map<string, StreamTreasuryInfo>();

export const streamTreasuryInfoCache = {
    add: (
        id: PublicKey | string,
        obj: StreamTreasuryInfo,
    ) => {
        if (!obj || !obj.id) {
            return;
        }

        const address = typeof id === "string" ? id : id?.toBase58();
        const isNew = !treasuriesCache.has(address);

        if (isNew) {
            treasuriesCache.set(address, obj);
        }
        return obj;
    },
    get: (pubKey: string | PublicKey) => {
        let key: string;
        if (typeof pubKey !== "string") {
            key = pubKey.toBase58();
        } else {
            key = pubKey;
        }

        return treasuriesCache.get(key);
    },
    delete: (pubKey: string | PublicKey) => {
        let key: string;
        if (typeof pubKey !== "string") {
            key = pubKey.toBase58();
        } else {
            key = pubKey;
        }

        if (treasuriesCache.get(key)) {
            treasuriesCache.delete(key);
            return true;
        }
        return false;
    },
    clear: () => {
        treasuriesCache.clear();
    },
};
