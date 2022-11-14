import { NONCE_ACCOUNT_LENGTH } from "@solana/web3.js";
import { AccountsCoder, Idl } from "@project-serum/anchor";
import { publicKey, struct, u32, u64 } from "@project-serum/borsh";
// import { accountSize } from "@mean-dao/ddca/node_modules/@project-serum/anchor/dist/cjs/coder";
import { IdlAccountDef } from "@project-serum/anchor/dist/cjs/idl";

export class MeanSystemAccountsCoder<A extends string = string> implements AccountsCoder {

  public async encode<T = any>(accountName: A, account: T): Promise<Buffer> {
    switch (accountName) {
      case "nonce": {
        const buffer = Buffer.alloc(NONCE_ACCOUNT_LENGTH);
        const len = NONCE_ACCOUNT_LAYOUT.encode(account, buffer);
        return buffer.slice(0, len);
      }
      default: {
        throw new Error(`Invalid account name: ${accountName}`);
      }
    }
  }

  public decode<T = any>(accountName: A, ix: Buffer): T {
    return this.decodeUnchecked(accountName, ix);
  }

  public decodeUnchecked<T = any>(accountName: A, ix: Buffer): T {
    switch (accountName) {
      case "nonce": {
        return decodeNonceAccount(ix);
      }
      default: {
        throw new Error(`Invalid account name: ${accountName}`);
      }
    }
  }

  // TODO: this won't use the appendData.
  public memcmp(accountName: A, _appendData?: Buffer): any {
    switch (accountName) {
      case "nonce": {
        return {
          dataSize: NONCE_ACCOUNT_LENGTH,
        };
      }
      default: {
        throw new Error(`Invalid account name: ${accountName}`);
      }
    }
  }

  public size(idlAccount: IdlAccountDef): number {
    return 0;
  }
}

function decodeNonceAccount<T = any>(ix: Buffer): T {
  return NONCE_ACCOUNT_LAYOUT.decode(ix) as T;
}

const NONCE_ACCOUNT_LAYOUT = struct([
  u32("version"),
  u32("state"),
  publicKey("authorizedPubkey"),
  publicKey("nonce"),
  struct(
    [u64("lamportsPerSignature")],
    "feeCalculator"
  ),
]);