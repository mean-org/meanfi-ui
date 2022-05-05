/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from 'buffer';

if (typeof window !== 'undefined' && window.Buffer === undefined) {
    (window as any).Buffer = Buffer;
}

export {};