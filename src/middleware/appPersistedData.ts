import { readFromCache, writeToCache } from "cache/persistentCache";
import { LooseObject } from "types/LooseObject";

export const saveAppData = (lsKey: string, data: any, accountAddress: string) => {
    const currentValue = readFromCache(lsKey);
    const keyValueData: LooseObject = {};

    if (currentValue !== null) {
        // Try to keep existing values
        if (typeof currentValue.data !== 'string') {
            const collection = currentValue.data;
            for (const key in collection) {
                if (collection.hasOwn(collection, key)) {
                    keyValueData[key] = collection[key];
                }
            }
        }
    }

    // Add / Override 
    keyValueData[accountAddress] = data;
    writeToCache(lsKey, keyValueData);
}
