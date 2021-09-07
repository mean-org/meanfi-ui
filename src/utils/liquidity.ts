import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { LIQUIDITY_POOL_PROGRAM_ID_V4, NATIVE_SOL_MINT, SERUM_PROGRAM_ID_V3, WRAPPED_SOL_MINT } from "./ids";
import { Market, MARKET_STATE_LAYOUT_V2, OpenOrders } from "@project-serum/serum/lib/market";
import { ACCOUNT_LAYOUT, AMM_INFO_LAYOUT, AMM_INFO_LAYOUT_V3, AMM_INFO_LAYOUT_V4, MINT_LAYOUT } from "./layouts";
import { getFilteredProgramAccountsCache, getMultipleAccounts } from "./accounts";
import { LP_TOKENS, TokenInfo, TOKENS } from "./tokens";
import { BN } from "bn.js";
import { createAmmAuthority } from "./utils";
import { getAddressForWhat, LiquidityPoolInfo, LIQUIDITY_POOLS } from "./pools";
import { cloneDeep } from "lodash-es";
import { TokenAmount } from "./safe-math";
import { MARKETS as SERUM_MARKETS } from '@project-serum/serum/lib/tokens_and_markets'

export const getLiquidityPools = async (connection: Connection) => {
  
  let liquidityPools = {} as any;
  let ammAll: any; // { publicKey: PublicKey, accountInfo: AccountInfo<Buffer> }[] = [];
  let marketAll: any; //{ publicKey: PublicKey, accountInfo: AccountInfo<Buffer> }[] = [];

  // let LIQUIDITY_POOLS = LIQUIDITY_POOLS.filter(lp => {
  //   return (lp.coin.address === fromMint.toBase58() && lp.pc.address === toMint.toBase58()) || 
  //     (lp.coin.address === toMint.toBase58() && lp.pc.address === fromMint.toBase58());
  // });

  await Promise.all([
    await (async () => {
      ammAll = await getMultipleAccounts(
        connection,
        LIQUIDITY_POOLS.map(p => new PublicKey(p.ammId)),
        connection.commitment
      )
    })(),
    await (async () => {
      marketAll = await getMultipleAccounts(
        connection, 
        SERUM_MARKETS.map(m => m.address),
        connection.commitment
      )
    })()
  ]);

  const marketToLayout: { [name: string]: any } = {};

  marketAll.forEach((item: any) => {
    marketToLayout[item.publicKey.toString()] = MARKET_STATE_LAYOUT_V2.decode(item.account.data)
  });

  const lpMintAddressList: string[] = [];

  ammAll.forEach((item: any) => {
    const ammLayout = AMM_INFO_LAYOUT_V4.decode(Buffer.from(item.account.data));

    if (
      ammLayout.pcMintAddress.toString() === ammLayout.serumMarket.toString() ||
      ammLayout.lpMintAddress.toString() === NATIVE_SOL_MINT.toString()
    ) {
      return liquidityPools;
    }

    lpMintAddressList.push(ammLayout.lpMintAddress.toString());
  });

  const lpMintListDecimls = await getLpMintListDecimals(connection, lpMintAddressList);

  for (let indexAmmInfo = 0; indexAmmInfo < ammAll.length; indexAmmInfo += 1) {
    const ammInfo = AMM_INFO_LAYOUT_V4.decode(Buffer.from(ammAll[indexAmmInfo].account.data))
  
    if (
      !Object.keys(lpMintListDecimls).includes(ammInfo.lpMintAddress.toString()) ||
      ammInfo.pcMintAddress.toString() === ammInfo.serumMarket.toString() ||
      ammInfo.lpMintAddress.toString() === NATIVE_SOL_MINT.toString() ||
      !Object.keys(marketToLayout).includes(ammInfo.serumMarket.toString())
    ) {
      continue;
    }
  
    const fromCoin = ammInfo.coinMintAddress.equals(WRAPPED_SOL_MINT)
      ? NATIVE_SOL_MINT.toBase58()
      : ammInfo.coinMintAddress.toString();
      
    const toCoin = ammInfo.pcMintAddress.equals(WRAPPED_SOL_MINT)
      ? NATIVE_SOL_MINT.toBase58()
      : ammInfo.pcMintAddress.toString();
    
    let coin = Object
      .values(TOKENS)
      .find((item) => item.address === fromCoin);
    
    if (!coin) {
      TOKENS[`unknow-${ammInfo.coinMintAddress.toString()}`] = {
        symbol: 'unknown',
        name: 'unknown',
        address: ammInfo.coinMintAddress.toString(),
        decimals: new BN(ammInfo.coinDecimals).toNumber(),
        cache: true,
        tags: []
      }
      coin = TOKENS[`unknow-${ammInfo.coinMintAddress.toString()}`];
    }

    if (!coin.tags.includes('unofficial')) {
      coin.tags.push('unofficial');
    }

    let pc = Object
      .values(TOKENS)
      .find((item) => item.address === toCoin);

    if (!pc) {
      TOKENS[`unknow-${ammInfo.pcMintAddress.toString()}`] = {
        symbol: 'unknown',
        name: 'unknown',
        address: ammInfo.pcMintAddress.toString(),
        decimals: new BN(ammInfo.pcDecimals),
        cache: true,
        tags: []
      }
      pc = TOKENS[`unknow-${ammInfo.pcMintAddress.toString()}`];
    }
    
    if (!pc.tags.includes('unofficial')) {
      pc.tags.push('unofficial');
    }

    if (coin.address === WRAPPED_SOL_MINT.toBase58()) {
      coin.symbol = 'SOL'
      coin.name = 'SOL'
      coin.address = NATIVE_SOL_MINT.toBase58()
    }

    if (pc.address === WRAPPED_SOL_MINT.toBase58()) {
      pc.symbol = 'SOL'
      pc.name = 'SOL'
      pc.address = NATIVE_SOL_MINT.toBase58()
    }
    
    const lp = Object.values(LP_TOKENS).find((item) => item.address === ammInfo.lpMintAddress) ?? {
      symbol: `${coin.symbol}-${pc.symbol}`,
      name: `${coin.symbol}-${pc.symbol}`,
      coin,
      pc,
      address: ammInfo.lpMintAddress.toString(),
      decimals: lpMintListDecimls[ammInfo.lpMintAddress]
    };

    const { publicKey } = await createAmmAuthority(new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));
    const market = marketToLayout[ammInfo.serumMarket];

    const serumVaultSigner = await PublicKey.createProgramAddress(
      [ammInfo.serumMarket.toBuffer(), market.vaultSignerNonce.toArrayLike(Buffer, 'le', 8)],
      new PublicKey(SERUM_PROGRAM_ID_V3)
    );

    const itemLiquidity: LiquidityPoolInfo = {
      name: `${coin.symbol}-${pc.symbol}`,
      coin,
      pc,
      lp,
      version: 4,
      programId: LIQUIDITY_POOL_PROGRAM_ID_V4,
      ammId: ammAll[indexAmmInfo].publicKey.toString(),
      ammAuthority: publicKey.toString(),
      ammOpenOrders: ammInfo.ammOpenOrders.toString(),
      ammTargetOrders: ammInfo.ammTargetOrders.toString(),
      ammQuantities: NATIVE_SOL_MINT.toBase58(),
      poolCoinTokenAccount: ammInfo.poolCoinTokenAccount.toString(),
      poolPcTokenAccount: ammInfo.poolPcTokenAccount.toString(),
      poolWithdrawQueue: ammInfo.poolWithdrawQueue.toString(),
      poolTempLpTokenAccount: ammInfo.poolTempLpTokenAccount.toString(),
      serumProgramId: SERUM_PROGRAM_ID_V3,
      serumMarket: ammInfo.serumMarket.toString(),
      serumBids: market.bids.toString(),
      serumAsks: market.asks.toString(),
      serumEventQueue: market.eventQueue.toString(),
      serumCoinVaultAccount: market.baseVault.toString(),
      serumPcVaultAccount: market.quoteVault.toString(),
      serumVaultSigner: serumVaultSigner.toString(),
      official: false
    };
    
    if (!LIQUIDITY_POOLS.find((item) => item.ammId === itemLiquidity.ammId)) {
      LIQUIDITY_POOLS.push(itemLiquidity);
    } else {
      for (let itemIndex = 0; itemIndex < LIQUIDITY_POOLS.length; itemIndex += 1) {
        if (
          LIQUIDITY_POOLS[itemIndex].ammId === itemLiquidity.ammId &&
          LIQUIDITY_POOLS[itemIndex].name !== itemLiquidity.name &&
          !LIQUIDITY_POOLS[itemIndex].official
        ) {
          LIQUIDITY_POOLS[itemIndex] = itemLiquidity;
        }
      }
    }

    const publicKeys = [] as any;

    LIQUIDITY_POOLS.forEach((pool) => {
      const { 
        poolCoinTokenAccount, 
        poolPcTokenAccount, 
        ammOpenOrders, 
        ammId, 
        coin, 
        pc, 
        lp 
      } = pool;

      publicKeys.push(
        new PublicKey(poolCoinTokenAccount),
        new PublicKey(poolPcTokenAccount),
        new PublicKey(ammOpenOrders),
        new PublicKey(ammId),
        new PublicKey(lp.address)
      )

      const poolInfo = cloneDeep(pool);
      poolInfo.coin.balance = new TokenAmount(0, coin.decimals);
      poolInfo.pc.balance = new TokenAmount(0, pc.decimals);
      liquidityPools[lp.address] = poolInfo;
    });

    const multipleInfo = await getMultipleAccounts(connection, publicKeys, connection.commitment);

    multipleInfo.forEach((info) => {
      if (info) {
        const address = info.publicKey.toBase58();
        const data = Buffer.from(info.account.data);
        const { key, lpMintAddress, version } = getAddressForWhat(address);

        if (key && lpMintAddress) {
          const poolInfo = liquidityPools[lpMintAddress];

          switch (key) {
            case 'poolCoinTokenAccount': {
              const parsed = ACCOUNT_LAYOUT.decode(data);
              // quick fix: Number can only safely store up to 53 bits
              poolInfo.coin.balance.wei = poolInfo.coin.balance.wei.plus(parseFloat(parsed.amount.toString()));
              break;
            }
            case 'poolPcTokenAccount': {
              const parsed = ACCOUNT_LAYOUT.decode(data);
              poolInfo.pc.balance.wei = poolInfo.pc.balance.wei.plus(parseFloat(parsed.amount.toString()));
              break;
            }
            case 'ammOpenOrders': {
              const OPEN_ORDERS_LAYOUT = OpenOrders.getLayout(new PublicKey(poolInfo.serumProgramId));
              const parsed = OPEN_ORDERS_LAYOUT.decode(data);
              const { baseTokenTotal, quoteTokenTotal } = parsed;
              poolInfo.coin.balance.wei = poolInfo.coin.balance.wei.plus(parseFloat(baseTokenTotal.toString()));
              poolInfo.pc.balance.wei = poolInfo.pc.balance.wei.plus(parseFloat(quoteTokenTotal.toString()));
              break;
            }
            case 'ammId': {
              let parsed;
              if (version === 2) {
                parsed = AMM_INFO_LAYOUT.decode(data);
              } else if (version === 3) {
                parsed = AMM_INFO_LAYOUT_V3.decode(data);
              } else {
                parsed = AMM_INFO_LAYOUT_V4.decode(data);
                const { swapFeeNumerator, swapFeeDenominator } = parsed;
                poolInfo.fees = {
                  swapFeeNumerator: parseFloat(swapFeeNumerator.toString()),
                  swapFeeDenominator: parseFloat(swapFeeDenominator.toString())
                };
              }

              const { status, needTakePnlCoin, needTakePnlPc } = parsed;
              poolInfo.status = new BN(status).toNumber();
              poolInfo.coin.balance.wei = poolInfo.coin.balance.wei.minus(parseFloat(needTakePnlCoin.toString()));
              poolInfo.pc.balance.wei = poolInfo.pc.balance.wei.minus(parseFloat(needTakePnlPc.toString()));
              break;
            }
            // getLpSupply
            case 'lpMintAddress': {
              const parsed = MINT_LAYOUT.decode(data);
              poolInfo.lp.totalSupply = new TokenAmount(parseFloat(parsed.supply.toString()), poolInfo.lp.decimals);
              break;
            }
          }
        }
      }
    });
  }

  return liquidityPools;
};

export async function getLpMintInfo(connection: any, address: string, coin: any, pc: any): Promise<TokenInfo> {
  let lpInfo = Object
    .values(LP_TOKENS)
    .find((item) => item.address === address);

  if (!lpInfo) {
    const mintAll = await getMultipleAccounts(
      connection, 
      [new PublicKey(address)], 
      connection.commitment
    );

    if (mintAll !== null) {
      const data = Buffer.from(mintAll[0]?.account.data ?? '');
      const mintLayoutData = MINT_LAYOUT.decode(data);

      lpInfo = {
        symbol: 'unknown',
        name: 'unknown',
        coin,
        pc,
        address: address,
        decimals: mintLayoutData.decimals
      }
    }
  }

  return lpInfo;
}
  
export async function getLpMintListDecimals(
  connection: any,
  mintAddressInfos: string[]

): Promise<{ [name: string]: number }> {

  const reLpInfoDict: { [name: string]: number } = {};
  const mintList = [] as PublicKey[];
  
  mintAddressInfos.forEach((item) => {
    let lpInfo = Object
      .values(LP_TOKENS)
      .find((itemLpToken) => itemLpToken.address === item);
      
    if (!lpInfo) {
      mintList.push(new PublicKey(item));
      lpInfo = { decimals: null };
    }
    reLpInfoDict[item] = lpInfo.decimals;
  });
  
  const mintAll = await getMultipleAccounts(connection, mintList, connection.commitment);

  for (let mintIndex = 0; mintIndex < mintAll.length; mintIndex += 1) {
    const itemMint = mintAll[mintIndex];
  
    if (itemMint) {
      const mintLayoutData = MINT_LAYOUT.decode(Buffer.from(itemMint.account.data));
      reLpInfoDict[mintList[mintIndex].toString()] = mintLayoutData.decimals;
    }
  }

  const reInfo: { [name: string]: number } = {};
  
  for (const key of Object.keys(reLpInfoDict)) {
    if (reLpInfoDict[key] !== null) {
      reInfo[key] = reLpInfoDict[key];
    }
  }

  return reInfo;
}

export function getLiquidityInfoSimilar(
  ammIdOrMarket: PublicKey, 
  from: PublicKey, 
  to: PublicKey

) {
  
  const fromCoin = from.equals(WRAPPED_SOL_MINT) ? NATIVE_SOL_MINT : from;
  const toCoin = to.equals(WRAPPED_SOL_MINT) ? NATIVE_SOL_MINT : to;

  const knownLiquidity = LIQUIDITY_POOLS.find((item) => {

    if (
      ammIdOrMarket !== undefined && 
      !(item.ammId === ammIdOrMarket.toBase58() || item.serumMarket === ammIdOrMarket.toBase58())
    ) 
    {
      return false;
    }
    
    if (fromCoin && item.pc.address !== fromCoin.toBase58() && item.coin.address !== fromCoin.toBase58()) {
      return false;
    }
    
    if (toCoin && item.pc.address !== toCoin.toBase58() && item.coin.address !== toCoin.toBase58()) {
      return false;
    }
    
    if (ammIdOrMarket || (fromCoin && toCoin)) {
      return true;
    }

    return false;
  });

  return knownLiquidity;
}