import { TokenAmount } from './safe-math';
import { cloneDeep } from 'lodash-es';
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from './ids';

interface Tokens {
  [key: string]: any
  [index: number]: any
}

export const TOKENS_TAGS: { [key: string]: { mustShow: boolean; show: boolean; outName: string } } = {
  raydium: { mustShow: true, show: true, outName: 'Raydium Default List' },
  solana: { mustShow: false, show: false, outName: 'Solana Token List' },
}

export interface TokenInfo {
  symbol: string
  name: string
  address: string
  decimals: number
  totalSupply?: TokenAmount
  referrer?: string
  details?: string
  docs?: object
  socials?: object
  tokenAccountAddress?: string
  balance?: TokenAmount,
  readonly logoURI?: string;
  tags: string[]
}

/**
 * Get token use symbol

 * @param {string} symbol

 * @returns {TokenInfo | null} tokenInfo
 */
export function getTokenBySymbol(symbol: string): TokenInfo | null {
  if (symbol === 'SOL') {
    return cloneDeep(NATIVE_SOL)
  }

  let token = cloneDeep(TOKENS[symbol])

  if (!token) {
    token = null
  }

  return token
}

/**
 * Get token use mint addresses

 * @param {string} address

 * @returns {TokenInfo | null} tokenInfo
 */
export function getTokenByMintAddress(address: string): TokenInfo | null {
  if (address === NATIVE_SOL.address) {
    return cloneDeep(NATIVE_SOL)
  }

  let token = null

  for (const symbol of Object.keys(TOKENS)) {
    const info = cloneDeep(TOKENS[symbol])

    if (info.address === address) {
      token = info
    }
  }

  return token
}

export const NATIVE_SOL: TokenInfo = {
  symbol: 'SOL',
  name: 'Native SOL',
  address: NATIVE_SOL_MINT.toString(),
  decimals: 9,
  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  tags: ['raydium']
}

export const TOKENS: Tokens = {
  WSOL: {
    symbol: 'wSOL',
    name: 'Wrapped SOL',
    address: WRAPPED_SOL_MINT.toBase58(),
    decimals: 9,
    referrer: 'HTcarLHe7WRxBQCWvhVB8AP56pnEtJUV2jDGvcpY3xo5',
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    tags: ['raydium']
  },
  BTC: {
    symbol: 'BTC',
    name: 'Wrapped Bitcoin',
    address: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
    decimals: 6,
    referrer: 'GZpS8cY8Nt8HuqxzJh6PXTdSxc38vFUjBmi7eEUkkQtG',
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E/logo.png",
    tags: ['raydium']
  },
  ETH: {
    symbol: 'ETH',
    name: 'Wrapped Ethereum',
    address: '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk',
    decimals: 6,
    referrer: 'CXPTcSxxh4AT38gtv3SPbLS7oZVgXzLbMb83o4ziXjjN',
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk/logo.png",
    tags: ['raydium']
  },
  USDT: {
    symbol: 'USDT',
    name: 'USDT',
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    referrer: '8DwwDNagph8SdwMUdcXS5L9YAyutTyDJmK6cTKrmNFk3',
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
    tags: ['raydium']
  },
  USDC: {
    symbol: 'USDC',
    name: 'USDC',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    referrer: '92vdtNjEg6Zth3UU1MgPgTVFjSEzTHx66aCdqWdcRkrg',
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    tags: ['raydium']
  },
}

export const LP_TOKENS: Tokens = {
  'SOL-USDC-V4': {
    symbol: 'SOL-USDC',
    name: 'SOL-USDC LP',
    coin: { ...NATIVE_SOL },
    pc: { ...TOKENS.USDC },

    address: '8HoQnePLqPj4M7PUDzfw8e3Ymdwgc7NLGnaTUapubyvu',
    decimals: NATIVE_SOL.decimals
  },
  'BTC-USDC-V4': {
    symbol: 'BTC-USDC',
    name: 'BTC-USDC LP',
    coin: { ...TOKENS.BTC },
    pc: { ...TOKENS.USDC },

    address: '2hMdRdVWZqetQsaHG8kQjdZinEMBz75vsoWTCob1ijXu',
    decimals: TOKENS.BTC.decimals
  },
  'ETH-USDC-V4': {
    symbol: 'ETH-USDC',
    name: 'ETH-USDC LP',
    coin: { ...TOKENS.ETH },
    pc: { ...TOKENS.USDC },

    address: '13PoKid6cZop4sj2GfoBeujnGfthUbTERdE5tpLCDLEY',
    decimals: TOKENS.ETH.decimals
  },
  'SOL-USDT-V4': {
    symbol: 'SOL-USDT',
    name: 'SOL-USDT LP',
    coin: { ...NATIVE_SOL },
    pc: { ...TOKENS.USDT },

    address: 'Epm4KfTj4DMrvqn6Bwg2Tr2N8vhQuNbuK8bESFp4k33K',
    decimals: NATIVE_SOL.decimals
  },
  'BTC-USDT-V4': {
    symbol: 'BTC-USDT',
    name: 'BTC-USDT LP',
    coin: { ...TOKENS.BTC },
    pc: { ...TOKENS.USDT },

    address: 'DgGuvR9GSHimopo3Gc7gfkbKamLKrdyzWkq5yqA6LqYS',
    decimals: TOKENS.BTC.decimals
  },
  'ETH-USDT-V4': {
    symbol: 'ETH-USDT',
    name: 'ETH-USDT LP',
    coin: { ...TOKENS.ETH },
    pc: { ...TOKENS.USDT },

    address: 'nPrB78ETY8661fUgohpuVusNCZnedYCgghzRJzxWnVb',
    decimals: TOKENS.ETH.decimals
  },
}

function addUserLocalCoinMint() {
  const localMintStr = window.localStorage.user_add_coin_mint
  const localMintList = (localMintStr ?? '').split('---')
  if (localMintList.length % 3 !== 0) {
    window.localStorage.removeItem('user_add_coin_mint')
  } else {
    for (let index = 0; index < Math.floor(localMintList.length / 3); index += 1) {
      const name = localMintList[index * 3 + 0]
      const address = localMintList[index * 3 + 1]
      const decimals = localMintList[index * 3 + 2]
      if (!Object.values(TOKENS).find((item) => item.address === address)) {
        TOKENS[name + address + 'unofficialUserAdd'] = {
          name,
          symbol: name,
          decimals: parseInt(decimals),
          address,
          tags: ['userAdd']
        }
      } else if (
        !Object.values(TOKENS)
          .find((item) => item.address === address)
          .tags.includes('userAdd')
      ) {
        TOKENS[name].tags.push('userAdd')
      }
    }
  }
}

function addTokensSolana() {
  fetch('https://api.raydium.io/cache/solana-token-list')
    .then(async (response) => {
      addTokensSolanaFunc((await response.json()).tokens)
    })
    .catch(() => {
      fetch('https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json')
        .then(function (response) {
          return response.json()
        })
        .then(function (myJson) {
          addTokensSolanaFunc(myJson.tokens)
        })
    })
}

function addTokensSolanaFunc(tokens: any[]) {
  tokens.forEach((itemToken: any) => {
    if (itemToken.tags && itemToken.tags.includes('lp-token')) {
      return
    }
    if (!Object.values(TOKENS).find((item) => item.address === itemToken.address)) {
      TOKENS[itemToken.symbol + itemToken.address + 'solana'] = {
        symbol: itemToken.symbol,
        name: itemToken.name,
        address: itemToken.address,
        decimals: itemToken.decimals,
        picUrl: itemToken.logoURI,
        tags: ['solana']
      }
    } else {
      const token = Object.values(TOKENS).find((item) => item.address === itemToken.address)
      if (token.symbol !== itemToken.symbol && !token.tags.includes('raydium')) {
        token.symbol = itemToken.symbol
        token.name = itemToken.name
        token.decimals = itemToken.decimals
        token.tags.push('solana')
      }
      const picToken = Object.values(TOKENS).find((item) => item.address === itemToken.address)
      if (picToken) {
        picToken.picUrl = itemToken.logoURI
      }
    }
  })

  if (window.localStorage.addSolanaCoin) {
    window.localStorage.addSolanaCoin.split('---').forEach((itemMint: string) => {
      if (itemMint === NATIVE_SOL.address) NATIVE_SOL.tags.push('userAdd')
      else
        Object.keys(TOKENS).forEach((item) => {
          if (TOKENS[item].address === itemMint) {
            TOKENS[item].tags.push('userAdd')
          }
        })
    })
  }
}

function updateTokenTagsChange() {
  const userSelectSource = window.localStorage.userSelectSource ?? ''
  const userSelectSourceList: string[] = userSelectSource.split('---')
  for (const itemSource of userSelectSourceList) {
    if (TOKENS_TAGS[itemSource] && !TOKENS_TAGS[itemSource].mustShow) {
      TOKENS_TAGS[itemSource].show = true
    }
  }
}

addUserLocalCoinMint()
addTokensSolana()
updateTokenTagsChange()
