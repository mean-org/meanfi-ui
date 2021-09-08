import {
  AMM_ASSOCIATED_SEED,
  LIQUIDITY_POOL_PROGRAM_ID_V4,
  SERUM_PROGRAM_ID_V3,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID

} from '../utils/ids';

import { TOKENS } from '../utils/tokens';
import { Market as MarketSerum } from '@project-serum/serum'
import { getMintDecimals, Orderbook } from '@project-serum/serum/lib/market.js'
import { closeAccount, initializeAccount, transfer } from '@project-serum/serum/lib/token-instructions'
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token } from '@solana/spl-token'
import {
  Account,
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction

} from '@solana/web3.js'

import { ACCOUNT_LAYOUT, MINT_LAYOUT } from '../utils/layouts'
import { LIQUIDITY_POOLS } from '../utils/pools'
import { sendTransaction } from '../utils/utils';
import { getMultipleAccounts } from '../contexts/accounts';
import BN from 'bn.js';

const BufferLayout = require('buffer-layout');

export async function getMarket(
  connection: Connection, 
  marketAddress: string

): Promise<any | any> {

  try {

    const [expectAmmId, ] = await PublicKey.findProgramAddress([
      new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4).toBuffer(), 
      new PublicKey(marketAddress).toBuffer(), 
      Buffer.from(AMM_ASSOCIATED_SEED)

    ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

    if (LIQUIDITY_POOLS.find((item) => item.ammId === expectAmmId.toBase58())) {
      throw new Error('There is already a pool for this Serum Market');
    }

    const marketAddressPubKey = new PublicKey(marketAddress)
    const market = await Market.load(connection, marketAddressPubKey, undefined, new PublicKey(SERUM_PROGRAM_ID_V3))
    const {
      asksAddress,
      bidsAddress,
      quoteMint
      // baseMint
    } = market;

    let coinOrPcInTokenFlag = false;

    for (const item of [TOKENS.USDT, TOKENS.USDC, TOKENS.RAY, TOKENS.WSOL, TOKENS.SRM, TOKENS.PAI]) {
      if (quoteMint?.toBase58() === item.mintAddress) {
        coinOrPcInTokenFlag = true
        break
      }
    }
    if (!coinOrPcInTokenFlag) {
      throw new Error(
        'Only markets that contain USDC, USDT, SOL, RAY, SRM or PAI as the Quote Token are currently supported.'
      )
    }
    const asks: number[] = []
    const bids: number[] = []

    const orderBookMsg = await getMultipleAccounts(
      connection, 
      [
        bidsAddress.toBase58(), 
        asksAddress.toBase58()
      ], 
      connection.commitment as string
    );

    orderBookMsg.array.forEach((info) => {
      // @ts-ignore
      const data = info.account.data;
      // @ts-ignore
      const orderbook = Orderbook.decode(market, data);
      const { isBids, slab } = orderbook;

      if (isBids) {
        for (const item of slab.items(true)) {
          bids.push(market?.priceLotsToNumber(item.key.ushrn(64)) || 0);
        }
      } else {
        for (const item of slab.items(false)) {
          asks.push(market?.priceLotsToNumber(item.key.ushrn(64)) || 0);
        }
      }
    });

    const price = asks.length > 0 && bids.length > 0 ? (asks[0] + bids[0]) / 2 : NaN;
    const baseMintDecimals = new BN(await getMintDecimals(connection, market.baseMintAddress as PublicKey));
    const quoteMintDecimals = new BN(await getMintDecimals(connection, market.quoteMintAddress as PublicKey));

    return { 
      market, 
      price, 
      msg: '', 
      baseMintDecimals, 
      quoteMintDecimals 
    };

  } catch (error: any) {
    if (error.message === 'Non-base58 character') {
      return { market: null, price: null, msg: 'market input error', baseMintDecimals: 0, quoteMintDecimals: 0 };
    } else {
      return { market: null, price: null, msg: error.message, baseMintDecimals: 0, quoteMintDecimals: 0 };
    }
  }
}

export async function createAmm(
  connection: any,
  wallet: any,
  market: any,
  userInputBaseValue: number,
  userInputQuoteValue: number

) {
  const transaction = new Transaction();
  const signers: any = [];
  const owner = wallet.publicKey;

  const [publicKey, nonce]  = await PublicKey.findProgramAddress(
    [new Uint8Array(Buffer.from('amm authority'.replace('\u00A0', ' '), 'utf-8'))],
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4)
  );

  const ammAuthority = publicKey;

  const [ammId, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  const [poolCoinTokenAccount, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  const [poolPcTokenAccount, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  const [lpMintAddress, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  const [poolTempLpTokenAccount, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  const [ammTargetOrders, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  const [poolWithdrawQueue, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  const [ammOpenOrders, ] = await PublicKey.findProgramAddress([
    new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4), 
    market.address.toBuffer(), 
    Buffer.from(AMM_ASSOCIATED_SEED)

  ], new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4));

  let accountSuccessFlag = false;
  let accountAllSuccessFlag = false;
  const multipleInfo = await getMultipleAccounts(
    connection, 
    [
        lpMintAddress.toBase58()
    ], 
    connection.commitment as string
  );

  if (multipleInfo.array.length > 0 && multipleInfo.array[0] !== null) {
    const tempLpMint = MINT_LAYOUT.decode(multipleInfo.array[0]?.data);

    if (new BN(tempLpMint.supply).toNumber() === 0) {
      accountSuccessFlag = true
    } else {
      accountAllSuccessFlag = true;
    }
  } else {
    accountSuccessFlag = false;
  }

  console.log('init flag: ', accountSuccessFlag, accountAllSuccessFlag);

  transaction.add(
    preInitialize(
      new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4),
      ammTargetOrders,
      poolWithdrawQueue,
      ammAuthority,
      lpMintAddress,
      market.baseMintAddress,
      market.quoteMintAddress,
      poolCoinTokenAccount,
      poolPcTokenAccount,
      poolTempLpTokenAccount,
      market.address,
      owner,
      nonce
    )
  )

  const destLpToken = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    owner, 
    lpMintAddress
  );

  const destLpTokenInfo = await connection.getAccountInfo(destLpToken);

  if (!destLpTokenInfo) {
    transaction.add(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        lpMintAddress,
        destLpToken,
        owner,
        owner
      )
    );
  }

  if (!accountSuccessFlag) {
    const txid = await sendTransaction(connection, wallet, transaction, signers);
    console.log('txid', txid);
    let txidSuccessFlag = 0;

    await connection.onSignature(txid, function (_signatureResult: any, _context: any) {
      if (_signatureResult.err) {
        txidSuccessFlag = -1
      } else {
        txidSuccessFlag = 1
      }
    })

    const timeAwait = new Date().getTime()
    let outOfWhile = false
    while (!outOfWhile) {
      console.log('txid', outOfWhile, txidSuccessFlag, (new Date().getTime() - timeAwait) / 1000)
      if (txidSuccessFlag !== 0) {
        outOfWhile = true
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (txidSuccessFlag !== 1) {
      throw new Error('create tx1 error')
    }
  }

  const ammKeys = {
    ammId,
    ammAuthority,
    poolCoinTokenAccount,
    poolPcTokenAccount,
    lpMintAddress,
    ammOpenOrders,
    ammTargetOrders,
    poolWithdrawQueue,
    poolTempLpTokenAccount,
    destLpToken,
    nonce
  }

  if (!accountAllSuccessFlag) {
    await initAmm(
      connection,
      wallet,
      market,
      new PublicKey(LIQUIDITY_POOL_PROGRAM_ID_V4),
      new PublicKey(SERUM_PROGRAM_ID_V3),
      // ammId,
      ammKeys,
      userInputBaseValue,
      userInputQuoteValue,
      poolCoinTokenAccount,
      poolPcTokenAccount
    )
  }

  return ammId.toBase58()
}

async function initAmm(
  connection: Connection,
  wallet: any,
  market: any,
  ammProgramId: PublicKey,
  dexProgramId: PublicKey,
  // ammKeypair: PublicKey,
  ammKeys: any,
  userInputBaseValue: number,
  userInputQuoteValue: number,
  poolCoinTokenAccount: PublicKey,
  poolPcTokenAccount: PublicKey

) {

  const transaction = new Transaction();
  const signers: any = [];
  const owner = wallet.publicKey;
  const baseMintDecimals = await getMintDecimals(connection, market.baseMintAddress as PublicKey);
  const quoteMintDecimals = await getMintDecimals(connection, market.quoteMintAddress as PublicKey);
  const coinVol = new BN(10 ** baseMintDecimals).muln(userInputBaseValue);
  const pcVol = new BN(10 ** quoteMintDecimals).muln(userInputQuoteValue);
  const baseTokenAccount = await connection.getTokenAccountsByOwner(owner, market.baseMintAddress);
  const quoteTokenAccount = await connection.getTokenAccountsByOwner(owner, market.quoteMintAddress);

  const baseTokenList: any = baseTokenAccount.value.map((item: any) => {
    if (item.account.data.parsed.info.tokenAmount.amount >= coinVol.toNumber()) {
      return item.pubkey;
    }
    return null
  });

  const quoteTokenList: any = quoteTokenAccount.value.map((item: any) => {
    if (item.account.data.parsed.info.tokenAmount.amount >= pcVol.toNumber()) {
      return item.pubkey
    }
    return null
  });

  let baseToken: string | null = null;

  for (const item of baseTokenList) {
    if (item !== null) {
      baseToken = item;
    }
  }

  let quoteToken: string | null = null;

  for (const item of quoteTokenList) {
    if (item !== null) {
      quoteToken = item;
    }
  }

  if (
    (baseToken === null && market.baseMintAddress.toString() !== TOKENS.WSOL.mintAddress) ||
    (quoteToken === null && market.quoteMintAddress.toString() !== TOKENS.WSOL.mintAddress)
  ) {
    throw new Error('no money');
  }

  if (market.baseMintAddress.toString() === TOKENS.WSOL.mintAddress) {
    const newAccount = new Account();

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: newAccount.publicKey,
        lamports: parseInt(coinVol.toNumber().toFixed()) + 1e7,
        space: ACCOUNT_LAYOUT.span,
        programId: TOKEN_PROGRAM_ID
      }),
      initializeAccount({
        account: newAccount.publicKey,
        mint: new PublicKey(TOKENS.WSOL.mintAddress),
        owner
      }),
      transfer({
        source: newAccount.publicKey, 
        destination: poolCoinTokenAccount, 
        owner, 
        amount: coinVol.toNumber()
      }),
      closeAccount({
        source: newAccount.publicKey,
        destination: owner,
        owner
      })
    );

    signers.push(newAccount);

  } else {
    transaction.add(
      transfer({
        source: new PublicKey(baseToken as string), 
        destination: poolCoinTokenAccount, 
        owner, 
        amount: coinVol.toNumber()
      })
    )
  }

  if (market.quoteMintAddress.toString() === TOKENS.WSOL.mintAddress) {
    const newAccount = new Account();

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: newAccount.publicKey,
        lamports: pcVol.toNumber() + 1e7,
        space: ACCOUNT_LAYOUT.span,
        programId: TOKEN_PROGRAM_ID
      }),
      initializeAccount({
        account: newAccount.publicKey,
        mint: new PublicKey(TOKENS.WSOL.mintAddress),
        owner
      }),
      transfer({
        source: newAccount.publicKey, 
        destination: poolPcTokenAccount, 
        owner, amount: pcVol.toNumber()
      }),
      closeAccount({
        source: newAccount.publicKey,
        destination: owner,
        owner
      })
    );

    signers.push(newAccount);

  } else {
    transaction.add(
      transfer({
        source: new PublicKey(quoteToken as string), 
        destination: poolPcTokenAccount, 
        owner, 
        amount: pcVol.toNumber()
      })
    );
  }

  transaction.add(
    initialize(
      ammProgramId,
      ammKeys.ammId,
      ammKeys.ammAuthority,
      ammKeys.ammOpenOrders,
      ammKeys.lpMintAddress,
      market.baseMintAddress,
      market.quoteMintAddress,
      ammKeys.poolCoinTokenAccount,
      ammKeys.poolPcTokenAccount,
      ammKeys.poolWithdrawQueue,
      ammKeys.ammTargetOrders,
      ammKeys.destLpToken,
      ammKeys.poolTempLpTokenAccount,
      dexProgramId,
      market.address,
      owner,
      ammKeys.nonce
    )
  )

  const txid = await sendTransaction(connection, wallet, transaction, signers);
  let txidSuccessFlag = 0;

  connection.onSignature(txid, function (_signatureResult: any, _context: any) {
    if (_signatureResult.err) {
      txidSuccessFlag = -1;
    } else {
      txidSuccessFlag = 1;
    }
  });

  const timeAwait = new Date().getTime();
  let outOfWhile = false;

  while (!outOfWhile) {
    console.log('txid3', outOfWhile, txidSuccessFlag, (new Date().getTime() - timeAwait) / 1000);

    if (txidSuccessFlag !== 0) {
      outOfWhile = true
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (txidSuccessFlag !== 1) {
    throw new Error('Transaction failed');
  }

  clearLocal();
}

export function initialize(
  ammProgramId: PublicKey,
  ammId: PublicKey,
  ammAuthority: PublicKey,
  ammOpenOrders: PublicKey,
  lpMintAddress: PublicKey,
  coinMint: PublicKey,
  pcMint: PublicKey,
  poolCoinTokenAccount: PublicKey,
  poolPcTokenAccount: PublicKey,
  poolWithdrawQueue: PublicKey,
  ammTargetOrders: PublicKey,
  poolLpTokenAccount: PublicKey,
  poolTempLpTokenAccount: PublicKey,
  serumProgramId: PublicKey,
  serumMarket: PublicKey,
  owner: PublicKey,
  nonce: number

): TransactionInstruction {

  const dataLayout = BufferLayout.struct([
    BufferLayout.u8('instruction'), 
    BufferLayout.u8('nonce')
  ]);

  const keys = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: ammId, isSigner: false, isWritable: true },
    { pubkey: ammAuthority, isSigner: false, isWritable: false },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: lpMintAddress, isSigner: false, isWritable: true },
    { pubkey: coinMint, isSigner: false, isWritable: true },
    { pubkey: pcMint, isSigner: false, isWritable: true },
    { pubkey: poolCoinTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolPcTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolWithdrawQueue, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: poolLpTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolTempLpTokenAccount, isSigner: false, isWritable: true },
    { pubkey: serumProgramId, isSigner: false, isWritable: false },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: true, isWritable: true }
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: 0,
      nonce
    },
    data
  );

  return new TransactionInstruction({
    keys,
    programId: ammProgramId,
    data
  });
}

export function preInitialize(
  programId: PublicKey,
  ammTargetOrders: PublicKey,
  poolWithdrawQueue: PublicKey,
  ammAuthority: PublicKey,
  lpMintAddress: PublicKey,
  coinMintAddress: PublicKey,
  pcMintAddress: PublicKey,
  poolCoinTokenAccount: PublicKey,
  poolPcTokenAccount: PublicKey,
  poolTempLpTokenAccount: PublicKey,
  market: PublicKey,
  owner: PublicKey,
  nonce: number

): TransactionInstruction {

  const dataLayout = BufferLayout.struct([
    BufferLayout.u8('instruction'), 
    BufferLayout.u8('nonce')
  ])

  const keys = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: true },
    { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: true },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },

    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: poolWithdrawQueue, isSigner: false, isWritable: true },
    { pubkey: ammAuthority, isSigner: false, isWritable: false },
    { pubkey: lpMintAddress, isSigner: false, isWritable: true },
    { pubkey: coinMintAddress, isSigner: false, isWritable: false },
    { pubkey: pcMintAddress, isSigner: false, isWritable: false },
    { pubkey: poolCoinTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolPcTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolTempLpTokenAccount, isSigner: false, isWritable: true },
    { pubkey: market, isSigner: false, isWritable: false },
    { pubkey: owner, isSigner: true, isWritable: true }
  ];

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: 10,
      nonce
    },
    data
  );

  return new TransactionInstruction({
    keys,
    programId,
    data
  });
}

export class Market extends MarketSerum {
    
  public baseVault: PublicKey | null = null;
  public quoteVault: PublicKey | null = null;
  public requestQueue: PublicKey | null = null;
  public eventQueue: PublicKey | null = null;
  public bids: PublicKey | null = null;
  public asks: PublicKey | null = null;
  public baseLotSize: number = 0;
  public quoteLotSize: number = 0;
  public quoteMint: PublicKey | null = null;
  public baseMint: PublicKey | null = null;

  static async load(
      connection: Connection, 
      address: PublicKey, 
      options: any = {}, 
      programId: PublicKey

  ) {

    const info = await connection.getAccountInfo(address);

    if (!info) {
      throw Error('Market not found');
    }

    if (!info.owner.equals(programId)) {
      throw new Error('Address not owned by program: ' + info.owner.toBase58())
    }

    const decoded = this.getLayout(programId).decode(info.data);

    if (!decoded.accountFlags.initialized || !decoded.accountFlags.market || !decoded.ownAddress.equals(address)) {
      throw new Error('Invalid market')
    }

    const [baseMintDecimals, quoteMintDecimals] = await Promise.all([
      getMintDecimals(connection, decoded.baseMint),
      getMintDecimals(connection, decoded.quoteMint)
    ]);

    const market = new Market(decoded, baseMintDecimals, quoteMintDecimals, options, programId);

    // market._decoded = decoded;
    market.baseLotSize = decoded.baseLotSize;
    market.quoteLotSize = decoded.quoteLotSize;
    market.baseVault = decoded.baseVault;
    market.quoteVault = decoded.quoteVault;
    market.requestQueue = decoded.requestQueue;
    market.eventQueue = decoded.eventQueue;
    market.bids = decoded.bids;
    market.asks = decoded.asks;
    market.quoteMint = decoded.quoteMint;
    market.baseMint = decoded.baseMint;

    return market
  }
}

export function clearLocal() {
  localStorage.removeItem('poolCoinTokenAccount');
  localStorage.removeItem('poolPcTokenAccount');
  localStorage.removeItem('lpMintAddress');
  localStorage.removeItem('poolTempLpTokenAccount');
  localStorage.removeItem('ammId');
  localStorage.removeItem('ammOpenOrders');
  localStorage.removeItem('ammTargetOrders');
  localStorage.removeItem('poolWithdrawQueue');
  localStorage.removeItem('destLpToken');
  localStorage.removeItem('createMarket');
}
