export interface Tokenomics {
    id: string
    symbol: string
    name: string
    token_name: string
    token_address: string
    owner_program: string
    authority: string
    decimals: number
    fully_dilluted_market_cap: number
    total_volume: number
    max_total_supply: number
    circulating_supply: number
    total_money_streams: number
    total_value_locked: number
    holders: number
    price: number
    priceChange: PriceChange[]
    pairs: Pair[]
}

export interface PriceChange {
    priceData: string
    dateData: string
}

export interface Pair {
    name: string
    base: string
    target: string
    type: string
    buy: string
    img1: string
    img2: string
    total_liquidity: number
    total_value_locked: string
}

export interface PromoCards {
    imgUrl: string;
    ctaUrl: string;
}