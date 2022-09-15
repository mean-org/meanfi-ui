import { AccountTokenParsedInfo } from ".";
import { UserTokenAccount } from "../transactions";

export interface UserTokensResponse {
    nativeBalance: number;
    wSolBalance: number;
    accountTokens: UserTokenAccount[];
    selectedAsset: UserTokenAccount | undefined;
    userTokenAccouns: AccountTokenParsedInfo[] | undefined;
    tokenAccountGroups: Map<string, AccountTokenParsedInfo[]> | undefined;
}
