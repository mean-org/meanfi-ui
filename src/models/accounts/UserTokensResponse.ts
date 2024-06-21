import type { AccountTokenParsedInfo } from '.';
import type { UserTokenAccount } from './UserTokenAccount';

export interface UserTokensResponse {
  nativeBalance: number;
  wSolBalance: number;
  accountTokens: UserTokenAccount[];
  selectedAsset: UserTokenAccount | undefined;
  userTokenAccounts: AccountTokenParsedInfo[] | undefined;
  tokenAccountGroups: Map<string, AccountTokenParsedInfo[]> | undefined;
}
