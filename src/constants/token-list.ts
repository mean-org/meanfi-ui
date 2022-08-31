import { TokenInfo } from '@solana/spl-token-registry';

const LOGO_BASE_URL = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet';
export const CUSTOM_USDC_TEST_IDO_DEVNET = {
    chainId: 103,
    address: 'FsWi13eBPngZ87JTyEcQsPjbQqefoPfLJyhtbNeGyLCX',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: `${LOGO_BASE_URL}/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`,
    tags: [
        'stablecoin',
    ],
    extensions: {
        website: 'https://www.centre.io/',
        coingeckoId: 'usd-coin',
    },
}

export const SOCN_USD = {
    chainId: 101,
    address: '7YFfqZGTxkj3Zeq3Et23kMznCaEYZ1WBZDt6CVrxwfqd',
    symbol: 'SOCN/USDC',
    name: 'Orca Aquafarm Token (SOCN/USDC)',
    decimals: 6,
    logoURI: `${LOGO_BASE_URL}/7YFfqZGTxkj3Zeq3Et23kMznCaEYZ1WBZDt6CVrxwfqd/logo.svg`,
    tags: [
        'lp-token',
    ],
    extensions: {
        twitter: 'https://twitter.com/orca_so',
        website: 'https://www.orca.so',
    },
};

export const PINNED_TOKENS = ['USDC', 'ETH', 'BTC', 'USDT', 'SOL', 'SLND', 'MEAN'];
export const COMMON_EXCHANGE_TOKENS = ['USDC', 'USDT', 'MEAN', 'SOL'];
export const BANNED_TOKENS = [
    'CRT',
    'FROG',
    'DGX',
    'DOGA',
    'CHIH',
    'INO',
    'GSTONKS'
];

export const MEAN_TOKEN = {
    chainId: 101,
    address: 'MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD',
    symbol: 'MEAN',
    name: 'Mean Finance',
    decimals: 6,
    logoURI: `${LOGO_BASE_URL}/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg`,
    extensions: {
        coingeckoId: "meanfi",
        discord: "https://discord.meanfi.com/",
        medium: "https://meandao.medium.com",
        twitter: "https://twitter.com/meanfinance",
        website: "https://www.meanfi.com/"
    },
};

export const SMEAN_TOKEN = {
    chainId: 101,
    address: 'sMEANebFMnd9uTYpyntGzBmTmzEukRFwCjEcnXT2E8z',
    symbol: 'sMEAN',
    name: 'Staked MEAN',
    decimals: 6,
    logoURI: `${LOGO_BASE_URL}/sMEANebFMnd9uTYpyntGzBmTmzEukRFwCjEcnXT2E8z/logo.svg`,
    extensions: {
        discord: 'https://discord.meanfi.com/',
        medium: 'https://meandao.medium.com',
        twitter: 'https://twitter.com/meanfinance',
        website: 'https://www.meanfi.com/',
    },
    tags: [
        'stake',
    ],
};

export const MEAN_TOKEN_LIST: TokenInfo[] = [
    MEAN_TOKEN,
    SMEAN_TOKEN,
    {
        chainId: 101,
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`,
        tags: [
            'stablecoin',
        ],
        extensions: {
            website: 'https://www.centre.io/',
            coingeckoId: 'usd-coin',
        },
    },
    {
        chainId: 101,
        address: '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk',
        symbol: 'ETH',
        name: 'Wrapped Ethereum (Sollet)',
        decimals: 6,
        logoURI: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        tags: [
            'wrapped-sollet',
            'ethereum',
        ],
        extensions: {
            bridgeContract: 'https://etherscan.io/address/0xeae57ce9cc1984f202e15e038b964bb8bdf7229a',
            serumV3Usdc: '4tSvZvnbyzHXLMTiFonMyxZoHmFqau1XArcRCVHLZ5gX',
            serumV3Usdt: '7dLVkUfBVfCGkFhSXDCq1ukM9usathSgS716t643iFGF',
            coingeckoId: 'ethereum',
        },
    },
    {
        chainId: 101,
        address: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
        symbol: 'BTC',
        name: 'Wrapped Bitcoin (Sollet)',
        decimals: 6,
        logoURI: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/bitcoin/info/logo.png',
        tags: [
            'wrapped-sollet',
            'ethereum',
        ],
        extensions: {
            bridgeContract: 'https://etherscan.io/address/0xeae57ce9cc1984f202e15e038b964bb8bdf7229a',
            serumV3Usdc: 'A8YFbxQYFVqKZaoYJLLUVcQiWP7G2MeEgW5wsAQgMvFw',
            serumV3Usdt: 'C1EuT9VokAKLiW7i2ASnZUvxDoKuKkCpDDeNxAptuNe4',
            coingeckoId: 'bitcoin',
        },
    },
    {
        chainId: 101,
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        symbol: 'USDT',
        name: 'USDT',
        decimals: 6,
        logoURI: 'https://cdn.jsdelivr.net/gh/solana-labs/explorer/public/tokens/usdt.svg',
        tags: [
            'stablecoin',
        ],
        extensions: {
            website: 'https://tether.to/',
            coingeckoId: 'tether',
        },
    },
    {
        chainId: 101,
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Wrapped SOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/So11111111111111111111111111111111111111112/logo.png`,
        tags: [],
        extensions: {
            website: 'https://solana.com/',
            serumV3Usdc: '9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT',
            serumV3Usdt: 'HWHvQhFmJB3NUcu1aihKmrKegfVxBEHzwVX6yZCKEsi1',
            coingeckoId: 'solana',
        },
    },
    // Solend
    {
        chainId: 101,
        address: 'SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp',
        symbol: 'SLND',
        name: 'Solend',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp/logo.png`,
        tags: [
            'solend',
            'lending',
        ],
        extensions: {
            coingeckoId: 'solend',
            serumV3Usdc: 'F9y9NM83kBMzBmMvNT18mkcFuNAPhNRhx7pnz9EDWwfv',
            twitter: 'https://twitter.com/solendprotocol',
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'D3Cu5urZJhkKyNZQQq2ne6xSfzbXLU4RrywVErMA2vf8',
        symbol: 'cSLND',
        name: 'Solend SLND',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/D3Cu5urZJhkKyNZQQq2ne6xSfzbXLU4RrywVErMA2vf8/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '5h6ssFpeDeRbzsEHDbTQNH7nVGgsKrZydxdSTnLm6QdV',
        symbol: 'cSOL',
        name: 'Solend SOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/5h6ssFpeDeRbzsEHDbTQNH7nVGgsKrZydxdSTnLm6QdV/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '993dVFL2uXWYeoXuEBFXR4BijeXdTv4s6BzsCjJZuwqk',
        symbol: 'cUSDC',
        name: 'Solend USDC',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/993dVFL2uXWYeoXuEBFXR4BijeXdTv4s6BzsCjJZuwqk/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'CPDiKagfozERtJ33p7HHhEfJERjvfk1VAjMXAFLrvrKP',
        symbol: 'cETH',
        name: 'Solend ETH',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/CPDiKagfozERtJ33p7HHhEfJERjvfk1VAjMXAFLrvrKP/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'AppJPZka33cu4DyUenFe9Dc1ZmZ3oQju6mBn9k37bNAa',
        symbol: 'csoETH',
        name: 'Solend soETH',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/AppJPZka33cu4DyUenFe9Dc1ZmZ3oQju6mBn9k37bNAa/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'Gqu3TFmJXfnfSX84kqbZ5u9JjSBVoesaHjfTsaPjRSnZ',
        symbol: 'cBTC',
        name: 'Solend BTC',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/Gqu3TFmJXfnfSX84kqbZ5u9JjSBVoesaHjfTsaPjRSnZ/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '4CxGuD2NMr6zM8f18gr6kRhgd748pnmkAhkY1YJtkup1',
        symbol: 'cSRM',
        name: 'Solend SRM',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/4CxGuD2NMr6zM8f18gr6kRhgd748pnmkAhkY1YJtkup1/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'BTsbZDV7aCMRJ3VNy9ygV4Q2UeEo9GpR8D6VvmMZzNr8',
        symbol: 'cUSDT',
        name: 'Solend USDT',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/BTsbZDV7aCMRJ3VNy9ygV4Q2UeEo9GpR8D6VvmMZzNr8/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '8bDyV3N7ctLKoaSVqUoEwUzw6msS2F65yyNPgAVUisKm',
        symbol: 'cFTT',
        name: 'Solend FTT',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/8bDyV3N7ctLKoaSVqUoEwUzw6msS2F65yyNPgAVUisKm/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '2d95ZC8L5XP6xCnaKx8D5U5eX6rKbboBBAwuBLxaFmmJ',
        symbol: 'cRAY',
        name: 'Solend RAY',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/2d95ZC8L5XP6xCnaKx8D5U5eX6rKbboBBAwuBLxaFmmJ/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'Bpm2aBL57uqVhgxutfRVrbtnjDpZLV8PZrRrytV1LgeT',
        symbol: 'cSBR',
        name: 'Solend SBR',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/Bpm2aBL57uqVhgxutfRVrbtnjDpZLV8PZrRrytV1LgeT/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'BsWLxf6hRJnyytKR52kKBiz7qU7BB3SH77mrBxNnYU1G',
        symbol: 'cMER',
        name: 'Solend MER',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/BsWLxf6hRJnyytKR52kKBiz7qU7BB3SH77mrBxNnYU1G/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '6XrbsKScacEwpEW5DVNko9t5vW3cim9wktAeT9mmiYHS',
        symbol: 'cUSDT-USDC',
        name: 'Solend USDT-USDC',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/6XrbsKScacEwpEW5DVNko9t5vW3cim9wktAeT9mmiYHS/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '4icXEpFVMrcqob6fnd3jZ6KjKrc6cqre6do1f8kKAC1u',
        symbol: 'cmSOL-SOL',
        name: 'Solend mSOL-SOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/4icXEpFVMrcqob6fnd3jZ6KjKrc6cqre6do1f8kKAC1u/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'QQ6WK86aUCBvNPkGeYBKikk15sUg6aMUEi5PTL6eB4i',
        symbol: 'cstSOL',
        name: 'Solend stSOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/QQ6WK86aUCBvNPkGeYBKikk15sUg6aMUEi5PTL6eB4i/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'AFq1sSdevxfqWGcmcz7XpPbfjHevcJY7baZf9RkyrzoR',
        symbol: 'cscnSOL',
        name: 'Solend scnSOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/AFq1sSdevxfqWGcmcz7XpPbfjHevcJY7baZf9RkyrzoR/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: '3JFC4cB56Er45nWVe29Bhnn5GnwQzSmHVf6eUq9ac91h',
        symbol: 'cmSOL',
        name: 'Solend mSOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/3JFC4cB56Er45nWVe29Bhnn5GnwQzSmHVf6eUq9ac91h/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: 'E9LAZYxBVhJr9Cdfi9Tn4GSiJHDWSZDsew5tfgJja6Cu',
        symbol: 'cORCA',
        name: 'Solend ORCA',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/E9LAZYxBVhJr9Cdfi9Tn4GSiJHDWSZDsew5tfgJja6Cu/logo.png`,
        tags: [
            'solend',
            'lending',
            'collateral-tokens',
        ],
        extensions: {
            website: 'https://solend.fi',
        },
    },
    {
        chainId: 101,
        address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
        symbol: "RAY",
        name: "Raydium",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png`,
        tags: [],
        extensions: {
            "coingeckoId": "raydium"
        }
    },
    {
        chainId: 101,
        address: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
        symbol: "ORCA",
        name: "Orca",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png`,
        tags: [],
        extensions: {
            coingeckoId: "orca",
        }
    },
    {
        chainId: 101,
        address: "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
        symbol: "SRM",
        name: "Serum",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt/logo.png`,
        tags: [],
        extensions: {
            coingeckoId: "serum"
        }
    },
    {
        chainId: 101,
        address: "Saber2gLauYim4Mvftnrasomsv6NvAuncvMEZwcLpD1",
        symbol: "SBR",
        name: "Saber Protocol Token",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/Saber2gLauYim4Mvftnrasomsv6NvAuncvMEZwcLpD1/logo.svg`,
        tags: [],
        extensions: {
            coingeckoId: "saber"
        }
    },
    {
        chainId: 101,
        address: "SLRSSpSLUTP7okbCUBYStWCo1vUgyt775faPqz8HUMr",
        symbol: "SLRS",
        name: "Solrise Finance",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/SLRSSpSLUTP7okbCUBYStWCo1vUgyt775faPqz8HUMr/logo.png`,
        tags: [],
        extensions: {
            coingeckoId: "solrise-finance"
        }
    },
    {
        chainId: 101,
        address: "8upjSpvjcdpuzhfR1zriwg5NXkwDruejqNE9WNbPRtyA",
        symbol: "GRAPE",
        name: "Grape",
        decimals: 6,
        logoURI: "https://lh3.googleusercontent.com/y7Wsemw9UVBc9dtjtRfVilnS1cgpDt356PPAjne5NvMXIwWz9_x7WKMPH99teyv8vXDmpZinsJdgiFQ16_OAda1dNcsUxlpw9DyMkUk=s0",
        tags: [],
        extensions: {
            coingeckoId: "grape-2",
        }
    },
    {
        chainId: 101,
        address: "4dmKkXNHdgYsXqBHCuMikNQWwVomZURhYvkkX5c4pQ7y",
        symbol: "SNY",
        name: "Synthetify",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/4dmKkXNHdgYsXqBHCuMikNQWwVomZURhYvkkX5c4pQ7y/logo.png`,
        tags: [],
        extensions: {
            coingeckoId: "synthetify-token"
        }
    },
    {
        chainId: 101,
        address: "JET6zMJWkCN9tpRT2v2jfAmm5VnQFDpUBCyaKojmGtz",
        symbol: "JET",
        name: "Jet Protocol",
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/JET6zMJWkCN9tpRT2v2jfAmm5VnQFDpUBCyaKojmGtz/logo.png`,
        tags: [],
        extensions: {
            coingeckoId: "jet"
        }
    },
    {
        chainId: 101,
        address: "PoRTjZMPXb9T7dyU7tpLEZRQj7e6ssfAE62j2oQuc6y",
        symbol: "PORT",
        name: "Port Finance Token",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/PoRTjZMPXb9T7dyU7tpLEZRQj7e6ssfAE62j2oQuc6y/PORT.png`,
        tags: [],
        extensions: {
            serumV3Usdc: "8x8jf7ikJwgP9UthadtiGFgfFuyyyYPHL3obJAuxFWko"
        }
    },
    {
        chainId: 101,
        address: "xxxxa1sKNGwFtw2kFn8XauW9xq8hBZ5kVtcSesTT9fW",
        symbol: "SLIM",
        name: "Solanium",
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/xxxxa1sKNGwFtw2kFn8XauW9xq8hBZ5kVtcSesTT9fW/logo.png`,
        extensions: {}
    },
    {
        chainId: 101,
        address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
        symbol: "mSOL",
        name: "Marinade staked SOL (mSOL)",
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png`,
        extensions: {
            serumV3Usdc: "6oGsL2puUgySccKzn9XA9afqF217LfxP5ocq4B3LWsjy"
        }
    },
    {
        chainId: 101,
        address: '7xuP2ubqhEzbxJMZvtPqGLKRVyq4KXRKh4UGJmJaJwZr',
        symbol: 'MEAN-SOL',
        name: 'Raydium MEAN-SOL LP Token',
        decimals: 6,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 101,
        address: '7meGAxvVvBsUrFobS4prWVz1dnMZNvRRE2tJoVjFGjFc',
        symbol: 'MEAN-USDC',
        name: 'Raydium MEAN-USDC LP Token',
        decimals: 6,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 101,
        address: 'H9wUyrxpAErmdNVPitpHSXgwoomoh91ggJKPWtQQoCn1',
        symbol: 'MEAN-RAY',
        name: 'Raydium MEAN-RAY LP Token',
        decimals: 6,
        logoURI: '',
        tags: [],
    },
    // Testnet tokens
    {
        chainId: 102,
        address: 'CpMah17kQEL2wqyMKt3mZBdTnZbkbfx4nqmQMFDP5vwp',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`,
        tags: [
            'stablecoin',
        ],
        extensions: {
            website: 'https://www.centre.io/',
            coingeckoId: 'usd-coin',
        },
    },
    {
        chainId: 102,
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Wrapped SOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/So11111111111111111111111111111111111111112/logo.png`,
        tags: [],
        extensions: {
            website: 'https://www.solana.com/',
            coingeckoId: 'solana',
        },
    },
    // Devnet tokens
    {
        chainId: 103,
        address: 'AbQBt9V212HpPVk64YWAApFJrRzdAdu66fwF9neYucpU',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`,
        tags: [
            'stablecoin',
        ],
        extensions: {
            website: 'https://www.centre.io/',
            coingeckoId: 'usd-coin',
        },
    },
    {
        chainId: 103,
        address: '42f2yFqXh8EDCRCiEBQSweWqpTzKGa9DC8e7UjUfFNrP',
        symbol: 'USDT',
        name: 'USDT',
        decimals: 6,
        logoURI: 'https://cdn.jsdelivr.net/gh/solana-labs/explorer/public/tokens/usdt.svg',
        tags: [
            'stablecoin',
        ],
        extensions: {
            website: 'https://tether.to/',
            coingeckoId: 'tether',
        },
    },
    {
        chainId: 103,
        address: 'MNZeoVuS87pFssHCbxKHfddvJk4MjmM2RHjQskrk7qs',
        symbol: 'MEAN',
        name: 'Mean Finance',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg`,
        extensions: {
            discord: 'https://discord.meanfi.com/',
            medium: 'https://meandao.medium.com',
            twitter: 'https://twitter.com/meanfinance',
            website: 'https://www.meanfi.com/',
        },
    },
    {
        chainId: 103,
        address: 'sMNxc4HFhtyY9adKKmE2TBq4poD36moXN8W7YiQMsTA',
        symbol: 'sMEAN',
        name: 'Staked MEAN',
        decimals: 6,
        logoURI: '/assets/smean-token.svg',
        extensions: {
            discord: 'https://discord.meanfi.com/',
            medium: 'https://meandao.medium.com',
            twitter: 'https://twitter.com/meanfinance',
            website: 'https://www.meanfi.com/',
        },
        tags: [
            'stake',
        ],
    },
    {
        address: '2tWC4JAdL4AxEFJySziYJfsAnW2MHKRo98vbAPiRDSk8',
        chainId: 103,
        decimals: 6,
        extensions: {
            coingeckoId: 'usd-coin',
            website: 'https://saber.so/',
        },
        logoURI: 'https://cdn.jsdelivr.net/gh/saber-hq/spl-token-icons@master/icons/103/2tWC4JAdL4AxEFJySziYJfsAnW2MHKRo98vbAPiRDSk8.png',
        name: 'USD Coin (Saber Devnet)',
        symbol: 'USDC',
        tags: [
            'saber-mkt-usd',
            'stablecoin',
        ],
    },
    {
        address: '4QgnWUPQmfGB5dTDCcc4ZFeZDK7xNVhCUFoNmmYFwAme',
        chainId: 103,
        decimals: 6,
        extensions: {},
        logoURI: 'https://registry.saber.so/token-icons/candy-usd.png',
        name: 'Test USD',
        symbol: 'TEST',
        tags: [
            'saber-mkt-usd',
        ],
    },
    {
        address: 'CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT',
        chainId: 103,
        decimals: 6,
        extensions: {
            coingeckoId: 'usd-coin',
            discord: 'https://discord.com/invite/GmkRRKJkuh',
            medium: 'https://medium.com/@cashioapp',
            twitter: 'https://twitter.com/CashioApp',
            website: 'https://cashio.app',
        },
        logoURI: 'https://spl-token-icons.static-assets.ship.capital/icons/101/CASHVDm2wsJXfhj6VWxb7GiMdoLc17Du7paH4bNr5woT.png',
        name: 'Cashio Dollar',
        symbol: 'CASH',
        tags: [
            'stablecoin',
            'saber-mkt-usd',
        ],
    },
    {
        address: 'EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS',
        chainId: 103,
        decimals: 6,
        extensions: {
            coingeckoId: 'tether',
            website: 'https://saber.so/',
        },
        logoURI: 'https://cdn.jsdelivr.net/gh/saber-hq/spl-token-icons@master/icons/103/EJwZgeZrdC8TXTQbQBoL6bfuAnFUUy1PVCMB4DYPzVaS.svg',
        name: 'USDT (Saber Devnet)',
        symbol: 'USDT',
        tags: [
            'saber-mkt-usd',
            'stablecoin',
        ],
    },
    {
        address: 'Ren3RLPCG6hpKay86d2fQccQLuGG331UNxwn2VTw3GJ',
        chainId: 103,
        decimals: 8,
        extensions: {},
        logoURI: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D/logo.png',
        name: 'Test RenBTC',
        symbol: 'renBTC',
        tags: [
            'saber-mkt-btc',
        ],
    },
    {
        address: 'Saber2gLauYim4Mvftnrasomsv6NvAuncvMEZwcLpD1',
        chainId: 103,
        decimals: 6,
        extensions: {},
        logoURI: 'https://registry.saber.so/token-icons/sbr.svg',
        name: 'Saber Protocol Token',
        symbol: 'SBR',
        tags: [],
    },
    {
        address: 'Wbt2CgkkD3eVckD5XxWJmT8pTnFTyWrwvGM7bUMLvsM',
        chainId: 103,
        decimals: 6,
        extensions: {},
        logoURI: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/bitcoin/info/logo.png',
        name: 'Test WBTC',
        symbol: 'WBTC',
        tags: [
            'saber-mkt-btc',
        ],
    },
    {
        chainId: 103,
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Wrapped SOL',
        decimals: 9,
        logoURI: `${LOGO_BASE_URL}/So11111111111111111111111111111111111111112/logo.png`,
        tags: [],
        extensions: {
            coingeckoId: 'solana',
        },
    },
    {
        chainId: 103,
        address: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        symbol: 'USD Coin Dev',
        name: 'USDC-Dev - USD Coin Dev',
        decimals: 6,
        logoURI: `${LOGO_BASE_URL}/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png`,
        tags: [],
    },
    {
        chainId: 101,
        address: '8C3t7mmndSSZUukZHrVuU2mJ3bPtpVRo6tKNbLovGQEJ',
        symbol: 'CRDX-LP',
        name: 'Credix Marketplace LP Token',
        decimals: 6,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: '23YKMZKvpj77D2LSF3PELPCPLwHidhfLtStCGYDE7rHQ',
        symbol: 'CRDX-LP',
        name: 'Credix Marketplace LP Token',
        decimals: 6,
        logoURI: '',
        tags: [],
    },
    // Custom tokens for testing
    {
        chainId: 103,
        address: 'CeN7JbGgYyNthdoAWECczViR7NaCY6yUwCmyQHcg873M',
        symbol: 'THREE',
        name: 'THREE',
        decimals: 3,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: 'GmopnWLpQqYdMAR1w3kabxt15mBAReZvdD2FbBxjp7aT',
        symbol: 'FOUR',
        name: 'FOUR',
        decimals: 4,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: 'AyKVZFJiZF9mdhLR3TuXQHS6mBwecz6NRWLgxTcsJiVj',
        symbol: 'FIVE',
        name: 'FIVE',
        decimals: 5,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: '5BtmxTiSKcRFAn1tNXoRjiTGKepX6gtDdJUoKMe5rfxu',
        symbol: 'SIX',
        name: 'Six',
        decimals: 6,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: 'G1QahEecVmBhYibu8ZxPRqBSZQNYF8PRAXBLZpuVzRk9',
        symbol: 'NINE',
        name: 'NINE',
        decimals: 9,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: 'G5chh3Vtbunk4KYCaF2475MsrndFbNM5Yj3gzVrgXvZk',
        symbol: 'TEN',
        name: 'TEN',
        decimals: 10,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: '5x7ZwspfHfWkx5cWaSwKx7V4rUHsnmxaf3bRbwVKfk8r',
        symbol: 'ELEVEN',
        name: 'ELEVEN',
        decimals: 11,
        logoURI: '',
        tags: [],
    },
    {
        chainId: 103,
        address: 'Dma8Hv94ByVHMXDU8ioh6iW3P1gWTYk6PerAnGCtZMpv',
        symbol: 'TWELVE',
        name: 'TWELVE',
        decimals: 12,
        logoURI: '',
        tags: [],
    },
];
