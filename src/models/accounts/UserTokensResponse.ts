import type { AccountTokenParsedInfo } from '.';
import type { UserTokenAccount } from './UserTokenAccount';

export interface UserTokensResponse {
  nativeBalance: number;
  wSolBalance: number;
  accountTokens: UserTokenAccount[];
  selectedAsset: UserTokenAccount | undefined;
  userTokenAccouns: AccountTokenParsedInfo[] | undefined;
  tokenAccountGroups: Map<string, AccountTokenParsedInfo[]> | undefined;
}
