
export const MAX_CACHE_TTL = 86400; // 1 Day

export type CacheItem = {
    timestamp: number;
    data: any;
}

export const readFromCache = (key: string): CacheItem | null => {

    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const item = window.localStorage.getItem(key)
        return item ? (JSON.parse(item) as CacheItem) : null;
    } catch (error) {
        console.warn(`Error reading localStorage key “${key}”:`, error);
        return null;
    }
}

export const writeToCache = (key: string, value: any) => {

    if (typeof window === 'undefined') {
        return;
    }

    if (!key) {
        console.warn('Error setting localStorage on empty key');
    }
    if (!value) {
        window.localStorage.removeItem(key);
    } else {
        try {
            const data: CacheItem = {
                timestamp: Date.now(),
                data: value
            };
            window.localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.warn(`Error setting localStorage key “${key}”:`, error)
        }
    }
}

/**
 * Determines if a cache item, if found, is aged/old and needs to be refreshed
 * @param {string} key The key/name of the item in the local storage
 * @param {number} maxAge Max age of cache item in seconds. Defaults to 1 Day.
 * @returns {boolean} The boolean value indicating if the cache item is old.
 */
export const isCacheItemExpired = (key: string, maxAge = MAX_CACHE_TTL) => {
    const item = readFromCache(key);
    if (item) {
        const now = Date.now();
        const itemMaxAge = item.timestamp + (maxAge * 1000);
        const isExpired = now > itemMaxAge ? true : false;
        return isExpired;
    }
    return true;
}
