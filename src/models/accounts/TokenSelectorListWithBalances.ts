import type { LooseObject } from 'src/types/LooseObject';
import type { UserTokenAccount } from './UserTokenAccount';

export interface TokenSelectorListWithBalances {
  balancesMap: LooseObject;
  tokenList: UserTokenAccount[];
}
