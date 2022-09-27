/**
 * Simple in-memory cache. It uses the least-recently used (LRU) cache eviction strategy.
 * When iterating over the Map, the first item is the one which was inserted first.
 * In result, values.keys().next() returns the least-recently used key.
 * In order to “remember” the most-recently used items, we need to re-insert them
 * followed by .delete() and followed by .set() (when reading items from the cache)
 */
export class LruCache<T> {

    private values: Map<string, T> = new Map<string, T>();
    private _maxEntries: number;

    constructor(maxEntries = 20) {
        this._maxEntries = maxEntries;
    }

    public get(key: string): T | undefined {
        const hasKey = this.values.has(key);
        let entry: T | undefined;
        if (hasKey) {
            // peek the entry, re-insert for LRU strategy
            entry = this.values.get(key);
            if (entry) {
                this.values.delete(key);
                this.values.set(key, entry);
            }
        }

        return entry;
    }

    public put(key: string, value: T) {

        if (this.values.size >= this._maxEntries) {
            // least-recently used cache eviction strategy
            const keyToDelete = this.values.keys().next().value;

            this.values.delete(keyToDelete);
        }

        this.values.set(key, value);
    }

}
