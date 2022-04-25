import {
	PublicKey,
	Connection,
    Transaction,
    TransactionInstruction} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as anchor from "@project-serum/anchor";
import { BN, IdlAccounts, parseIdlErrors, Program, ProgramError } from "@project-serum/anchor";
import { Wallet } from "@project-serum/anchor/src/provider";
import ido_idl from './mean_ido_pool.json';
import EventEmitter from 'eventemitter3';
import { MeanIdoPool } from "./mean_ido_pool_types";


type idoAccountType = IdlAccounts<MeanIdoPool>["idoAccount"];
type userIdoAccountType = IdlAccounts<MeanIdoPool>["userIdoAccount"];

// CONSTANTS
const SYSTEM_PROGRAM_ID = anchor.web3.SystemProgram.programId;
const SYSVAR_RENT_PUBKEY = anchor.web3.SYSVAR_RENT_PUBKEY;
const DECIMALS = 6;
const DECIMALS_BN = new BN(DECIMALS);
const IDO_READONLY_PUBKEY = new PublicKey("3KmMEv7A8R3MMhScQceXBQe69qLmnFfxSM3q8HyzkrSx");
const MSP_FEE_PUBKEY = new PublicKey("3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw");
const MSP_PROGRAM_PUBKEY_DEVNET = new PublicKey("9yMq7x4LstWYWi14pr8BEBsEX33L3HnugpiM2PT96x4k");
const MSP_PROGRAM_PUBKEY_MAINNET = new PublicKey("H6wJxgkcc93yeUFnsZHgor3Q3pSWgGpEysfqKrwLtMko");

/**
 * Anchor based client for the Mean IDO program
 */
export class IdoClient {

    private rpcUrl: string;
    public connection: Connection;
    public readonlyProvider: anchor.Provider;
    public readonlyProgram: anchor.Program<MeanIdoPool>;
    public userPubKey: PublicKey | null | undefined;
    private verbose: boolean;
    private rpcVersion: anchor.web3.Version | null = null;
    public idoTracker: IdoTracker | null = null;

    /**
     * Create a Mean IDO client
     */
    constructor(
        rpcUrl: string,
        userPubKey: PublicKey | null | undefined,
        // commitment: Commitment | string = 'confirmed' as Commitment
        confirmOptions?: anchor.web3.ConfirmOptions,
        verbose = false,
    ) {
        if(!rpcUrl)
            throw new Error("wallet cannot be null or undefined");

        this.userPubKey = userPubKey;
        this.rpcUrl = rpcUrl;
        const readonlyWallet = IdoClient.createReadonlyWallet(IDO_READONLY_PUBKEY);
        this.readonlyProgram = IdoClient.createProgram(rpcUrl, readonlyWallet, confirmOptions);
        this.readonlyProvider = this.readonlyProgram.provider;
        this.connection = this.readonlyProgram.provider.connection;
        // anchor.setProvider(provider);
        this.verbose = verbose;
    }

    private static createReadonlyWallet(userPubKey: PublicKey): Wallet {
        return {
            publicKey: userPubKey, 
            signAllTransactions: async (txs) => txs, 
            signTransaction: async tx => tx
        };
    }

    private static getAnchorProvider(
        rpcUrl: string,
        // commitment: Commitment | string = 'confirmed',
        wallet: Wallet,
        opts?: anchor.web3.ConfirmOptions) {

        opts = opts ?? anchor.Provider.defaultOptions();
        const connection = new Connection(rpcUrl, opts.preflightCommitment);
        const provider = new anchor.Provider(
            connection, wallet, opts,
        );
        return provider;
    }

    private static createProgram(rpcUrl: string, wallet: Wallet, confirmOptions?: anchor.web3.ConfirmOptions): anchor.Program<MeanIdoPool> {
        const provider = IdoClient.getAnchorProvider(rpcUrl, wallet, confirmOptions);
        const programId = new anchor.web3.PublicKey(ido_idl.metadata.address);
        const program = new anchor.Program<MeanIdoPool>(ido_idl as any, programId, provider);
        return program;
    }

    public async findUserIdoProgramAddress(userPubKey: PublicKey, meanIdoPubKey: PublicKey): Promise<[PublicKey, number]> {
        
        return await anchor.web3.PublicKey.findProgramAddress(
            [
                userPubKey.toBuffer(),
                meanIdoPubKey.toBuffer(), 
                Buffer.from("user_ido")
            ],
            this.readonlyProgram.programId
        );
    }

    public async createInitializeIdoTx(
        idoAuthority: PublicKey,
        idoAuthorityMean: PublicKey,
        idoName: string,
        idoStart: Date,
        idoEnd: Date,
        redeemStart: Date,
        redeemEnd: Date,
        idoMeanAmount: number,
        meanMint: PublicKey,
        usdcMint: PublicKey,
        meanPriceStart: number,
        meanPriceEnd: number,
        usdcPerUserMin: number,
        usdcPerUserMaxStart: number,
        usdcPerUserMaxEnd: number,
        usdcTotalMin: number,
        usdcTotalMax: number,
        curveRefreshIntervalInSeconds: number,
        coolOffPeriodInSeconds: number,
    ): Promise<[PublicKey, Transaction]> {

        if(idoAuthority.equals(PublicKey.default))
            throw new Error(`Invalid authority: ${idoAuthority}`);
        const authorityWallet = IdoClient.createReadonlyWallet(idoAuthority);
        const program = IdoClient.createProgram(this.rpcUrl, authorityWallet, this.readonlyProvider.opts);

        // TODO: params check
        if (idoName.length === 0)
            throw Error("Invalid IDO name");
        if (idoName.length > 10)
            throw Error("IDO name is too long. Max lenght: 10");
        if (idoMeanAmount <= 0)
            throw Error("Invalid MEAN amount for IDO");

        const idoTimes: IdoTimes = {
            idoStartTs: new anchor.BN(idoStart.getTime() / 1000),
            idoEndTs: new anchor.BN(idoEnd.getTime() / 1000),
            redeemStartTs: new anchor.BN(redeemStart.getTime() / 1000),
            redeemEndTs: new anchor.BN(redeemEnd.getTime() / 1000),
        };
        const nowBn = new BN(Date.now() / 1000);
        if (idoTimes.idoStartTs.lt(nowBn))
            throw Error("IDO must start in the future");
        if (idoTimes.idoEndTs.lte(idoTimes.idoStartTs))
            throw Error("Invalid IDO times: 'ido end' must be after 'ido start'");
        if (idoTimes.redeemStartTs.lt(idoTimes.idoEndTs))
            throw Error("Invalid IDO times: 'redeem start' must be after 'ido end'");
        if (idoTimes.redeemEndTs.lt(idoTimes.redeemStartTs))
            throw Error("Invalid IDO times: 'redeem end' must be after 'redeem start'");

        const [idoAccount, idoAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                idoAuthority.toBuffer(),
                Buffer.from(idoName)
            ],
            program.programId
        );

        const [meanPool, meanPoolBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                idoAccount.toBuffer(),
                Buffer.from("mean_pool")
            ],
            program.programId
        );

        const [usdcPool, usdcPoolBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                idoAccount.toBuffer(),
                Buffer.from("usdc_pool")
            ],
            this.readonlyProgram.programId
        );

        let bumps: PoolBumps = {
            idoAccount: idoAccountBump,
            meanPool: meanPoolBump,
            usdcPool: usdcPoolBump
        };
        const meanMintSupply = await this.connection.getTokenSupply(meanMint);
        if(!meanMintSupply)
            throw new Error("MEAN MINT not found");
        if(meanMintSupply.value.decimals !== DECIMALS)
            throw Error(`Unsupported MEAN decimals: ${meanMintSupply.value.decimals}. Only value supported is: ${DECIMALS}`);
        const meanOne = 10 ** meanMintSupply.value.decimals;

        const usdcMintSupply = await this.connection.getTokenSupply(usdcMint);
        if(!usdcMintSupply)
            throw new Error("USDC MINT not found");
        if(usdcMintSupply.value.decimals !== DECIMALS) // USDC_DECIMALS
            throw Error(`Unsupported USDC decimals: ${usdcMintSupply.value.decimals}. Only value supported is: ${DECIMALS}`); // USDC_DECIMALS
        const usdcOne = 10 ** usdcMintSupply.value.decimals;

        const usdcPerUserMinBn = new anchor.BN(usdcPerUserMin * usdcOne);
        const usdcPerUserMaxStartBn = new anchor.BN(usdcPerUserMaxStart * usdcOne);
        const usdcPerUserMaxEndBn = new anchor.BN(usdcPerUserMaxEnd * usdcOne);
        const usdcTotalMinBn = new anchor.BN(usdcTotalMin * usdcOne);
        const usdcTotalMaxBn = new anchor.BN(usdcTotalMax * usdcOne);

        const idoMeanAmountBn = new anchor.BN(idoMeanAmount * meanOne);
        const meanPriceStartBn = new anchor.BN(meanPriceStart * meanOne);
        const meanPriceEndBn = new anchor.BN(meanPriceEnd * meanOne);

        // const idoAuthorityMean = await Token.getAssociatedTokenAddress(
        //     ASSOCIATED_TOKEN_PROGRAM_ID,
        //     TOKEN_PROGRAM_ID,
        //     meanMint,
        //     this.userPubKey,
        // );
        if (idoAuthorityMean === null) {
            throw Error("IDO authority Mean ATA not found");
        }
        const authorityMeanTokenResponse = await this.connection.getTokenAccountBalance(idoAuthorityMean);
        const authorityMeanTokenAmount = new BN(authorityMeanTokenResponse.value.amount ?? 0);
        if (authorityMeanTokenAmount.lt(idoMeanAmountBn)) {
            throw Error("Insufficient MEAN balance");
        }

        let [idoWithdrawals, createWithdrawalsTx] = await this.createCreateWithdrawalsTx(idoAuthority);

        if (this.verbose) {
            console.log(` idoAuthority:        ${program.provider.wallet.publicKey}`);
            console.log(` idoAuthorityMean:    ${idoAuthorityMean}`);
            console.log(` idoName:             ${idoName}`);
            console.log(` startIdo:            ${idoTimes.idoStartTs.toNumber()}`);
            console.log(` endIdo:              ${idoTimes.idoEndTs.toNumber()}`);
            console.log(` startRedeem:         ${idoTimes.redeemStartTs.toNumber()}`);
            console.log(` idoMeanAmount:       ${idoMeanAmountBn.toNumber()}`);
            console.log(` meanPriceStart:      ${meanPriceStartBn.toNumber()}`);
            console.log(` meanPriceEnd:        ${meanPriceEndBn.toNumber()}`);
            console.log(` usdcPerUserMin:      ${usdcPerUserMinBn.toNumber()}`);
            console.log(` usdcPerUserMaxStart: ${usdcPerUserMaxStartBn.toNumber()}`);
            console.log(` usdcPerUserMaxEnd:   ${usdcPerUserMaxEndBn.toNumber()}`);
            console.log(` usdcTotalMin:        ${usdcTotalMinBn.toNumber()}`);
            console.log(` usdcTotalMax:        ${usdcTotalMaxBn.toNumber()}`);
            console.log(` meanMint:            ${meanMint}`);
            console.log(` usdcMint:            ${usdcMint}`);
            console.log(` meanPool:            ${meanPool}`);
            console.log(` usdcPool:            ${usdcPool}`);
            console.log(` usdcPool:            ${usdcPool}`);
            console.log(` idoWithdrawals:      ${idoWithdrawals.publicKey}`);
            console.log(` curveRefresh:        ${curveRefreshIntervalInSeconds}`);
            console.log();
        }

        const initializeIdoTx = program.transaction.initializePool(
            idoName,
            idoTimes,
            idoMeanAmountBn,
            bumps,
            meanPriceStartBn,
            meanPriceEndBn,
            usdcPerUserMinBn,
            usdcPerUserMaxStartBn,
            usdcPerUserMaxEndBn,
            usdcTotalMinBn,
            usdcTotalMaxBn,
            new BN(curveRefreshIntervalInSeconds),
            new BN(coolOffPeriodInSeconds),
            {
                accounts: {
                    idoAuthority: idoAuthority,
                    idoAuthorityMean,
                    idoAccount,
                    meanMint,
                    usdcMint,
                    meanPool,
                    usdcPool,
                    withdrawals: idoWithdrawals.publicKey,
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                },
                instructions: [createWithdrawalsTx.instructions[0]],
            }
        );

        initializeIdoTx.feePayer = idoAuthority;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        initializeIdoTx.recentBlockhash = hash.blockhash;
        initializeIdoTx.partialSign(idoWithdrawals);

        return [idoAccount, initializeIdoTx];
    }

    public async createDepositUsdcTx(
        meanIdoAddress: PublicKey,
        amount: number,
    ): Promise<[PublicKey, Transaction]> {

        const currentUserPubKey = this.userPubKey;
        if(!currentUserPubKey)
            throw new Error("Must connect wallet first");
        const userWallet = IdoClient.createReadonlyWallet(currentUserPubKey);
        const program = IdoClient.createProgram(this.rpcUrl, userWallet, this.readonlyProvider.opts);

        // TODO: params check
        if (amount <= 0)
            throw Error("Invalid amount");
        // TODO: more validation

        const idoAccount = await program.account.idoAccount.fetch(meanIdoAddress);
        if(idoAccount === null)
           throw new Error("IDO account not found");

        const userUsdcAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            idoAccount.usdcMint,
            currentUserPubKey,
          );
        if (userUsdcAddress === null) {
            throw Error("user USDC ATA not found");
        }

        const [userIdo, userIdoBump] = await this.findUserIdoProgramAddress(currentUserPubKey, meanIdoAddress);

        const usdcAmountBn = new anchor.BN(amount * 10**DECIMALS);
        const userUsdcTokenResponse = await program.provider.connection.getTokenAccountBalance(userUsdcAddress);
        const userUsdcTokenAmount = new BN(userUsdcTokenResponse.value.amount ?? 0);
        if (userUsdcTokenAmount.lt(usdcAmountBn)) {
            throw Error("Insufficient USDC balance");
        }

        if (this.verbose) {
            console.log(` userIdoAuthority:    ${currentUserPubKey}`);
            console.log(` userUsdc:            ${userUsdcAddress}`);
            console.log(` idoAddress:          ${meanIdoAddress}`);
            console.log(` userIdo:             ${userIdo}`);
            console.log(` userUsdcAmount:      ${usdcAmountBn.toNumber()}`);
            console.log();
        }

        const depositUsdcTx = program.transaction.depositUsdc(
            usdcAmountBn,
            userIdoBump,
            {
                accounts: {
                    userAuthority: currentUserPubKey,
                    userUsdc: userUsdcAddress,
                    userIdo: userIdo,
                    idoAccount: meanIdoAddress,
                    usdcMint: idoAccount.usdcMint,
                    usdcPool: idoAccount.usdcPool,
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );

        depositUsdcTx.feePayer = currentUserPubKey;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        depositUsdcTx.recentBlockhash = hash.blockhash;

        return [userIdo, depositUsdcTx];
    }

    public async createDepositUsdcLpTx(
        meanIdoAddress: PublicKey,
        amount: number,
    ): Promise<[PublicKey, Transaction]> {

        throw new Error();
    }

    public async createWithdrawUsdcTx(
        meanIdoAddress: PublicKey,
        amount: number,
    ): Promise<[PublicKey, Transaction]> {

        const currentUserPubKey = this.userPubKey;
        if(!currentUserPubKey)
            throw new Error("Must connect wallet first");
        const userWallet = IdoClient.createReadonlyWallet(currentUserPubKey);
        const program = IdoClient.createProgram(this.rpcUrl, userWallet, this.readonlyProvider.opts);

        // TODO: params check
        if (amount <= 0)
            throw Error("Invalid amount");
        // TODO: more validation

        const idoAccount = await program.account.idoAccount.fetch(meanIdoAddress);
        if(idoAccount === null)
           throw new Error("IDO account not found");

        const userUsdcAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            idoAccount.usdcMint,
            currentUserPubKey,
          );
        if (userUsdcAddress === null) {
            throw Error("user USDC ATA not found");
        }

        const [userIdo, userIdoBump] = await this.findUserIdoProgramAddress(currentUserPubKey, meanIdoAddress);

        const usdcAmountBn = new anchor.BN(amount * 10**DECIMALS);
        // const userUsdcTokenResponse = await program.provider.connection.getTokenAccountBalance(userUsdcAddress);
        // const userUsdcTokenAmount = new BN(userUsdcTokenResponse.value.amount ?? 0);
        // if (userUsdcTokenAmount.lt(usdcAmountBn)) {
        //     throw Error("Insufficient USDC balance");
        // }

        if (this.verbose) {
            console.log(` userIdoAuthority:    ${currentUserPubKey}`);
            console.log(` userUsdc:            ${userUsdcAddress}`);
            console.log(` idoAddress:          ${meanIdoAddress}`);
            console.log(` userIdo:             ${userIdo}`);
            console.log(` userUsdcAmount:      ${usdcAmountBn.toNumber()}`);
            console.log();
        }

        const withdrawUsdcTx = program.transaction.withdrawUsdc(
            usdcAmountBn,
            {
                accounts: {
                    userAuthority: currentUserPubKey,
                    userUsdc: userUsdcAddress,
                    userIdo: userIdo,
                    idoAccount: meanIdoAddress,
                    usdcMint: idoAccount.usdcMint,
                    usdcPool: idoAccount.usdcPool,
                    withdrawals: idoAccount.withdrawals as PublicKey,
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );

        withdrawUsdcTx.feePayer = currentUserPubKey;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        withdrawUsdcTx.recentBlockhash = hash.blockhash;

        return [userIdo, withdrawUsdcTx];
    }

    public async createWithdrawMeanLpTx(
        meanIdoAddress: PublicKey
    ): Promise<[PublicKey, Transaction]> {

        const currentUserPubKey = this.userPubKey;
        if(!currentUserPubKey)
            throw new Error("Must connect wallet first");
        const userWallet = IdoClient.createReadonlyWallet(currentUserPubKey);
        const program = IdoClient.createProgram(this.rpcUrl, userWallet, this.readonlyProvider.opts);
        const idoAccount = await program.account.idoAccount.fetch(meanIdoAddress);

        if(idoAccount === null)
           throw new Error("IDO account not found");

        const userMeanAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            idoAccount.meanMint,
            currentUserPubKey,
          );

        if (userMeanAddress === null) {
            throw Error("user USDC ATA not found");
        }

        const [userIdo] = await this.findUserIdoProgramAddress(currentUserPubKey, meanIdoAddress);

        if (this.verbose) {
            console.log(` userIdoAuthority:    ${currentUserPubKey}`);
            console.log(` userMean:            ${userMeanAddress}`);
            console.log(` idoAddress:          ${meanIdoAddress}`);
            console.log(` userIdo:             ${userIdo}`);
            console.log();
        }

        const withdrawMeanLpTx = program.transaction.lpr(
            {
                accounts: {
                    userAuthority: currentUserPubKey,
                    idoAccount: meanIdoAddress,
                    userIdo: userIdo,
                    userMean: userMeanAddress,
                    meanMint: idoAccount.meanMint,
                    meanPool: idoAccount.meanPool,
                    withdrawals: idoAccount.withdrawals as PublicKey,
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY
                },
            }
        );

        withdrawMeanLpTx.feePayer = currentUserPubKey;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        withdrawMeanLpTx.recentBlockhash = hash.blockhash;

        return [userIdo, withdrawMeanLpTx];
    }

    public async createCreateWithdrawalsTx(
        idoAuthorityPubkey: PublicKey,
    ): Promise<[anchor.web3.Keypair, Transaction]> {

        if(!idoAuthorityPubkey)
            throw new Error("Must connect wallet first");
        const userWallet = IdoClient.createReadonlyWallet(idoAuthorityPubkey);
        const program = IdoClient.createProgram(this.rpcUrl, userWallet, this.readonlyProvider.opts);

        const withdrawalsKeypair = anchor.web3.Keypair.generate();

        if (this.verbose) {
            console.log(` userIdoAuthority:    ${idoAuthorityPubkey}`);
            console.log(` idoWithdrawals:      ${withdrawalsKeypair}`);
            console.log();
        }

        const createWithdrawalsTx = program.transaction.createIdoWithdrawals(
            {
                accounts: {
                    withdrawals: withdrawalsKeypair.publicKey,
                    rent: SYSVAR_RENT_PUBKEY,
                },
                instructions: [await program.account.idoWithdrawals.createInstruction(withdrawalsKeypair)],
                signers: [withdrawalsKeypair]
            }
        );

        createWithdrawalsTx.feePayer = idoAuthorityPubkey;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        createWithdrawalsTx.recentBlockhash = hash.blockhash;

        return [withdrawalsKeypair, createWithdrawalsTx];
    }

    public async createUpdateTx(
        idoAuthorityAddress: PublicKey,
        idoAddress: PublicKey,
        lastContNumber: number,
        lastContUsdcContributedBefore: number
    ): Promise<Transaction> {

        if(!idoAuthorityAddress)
            throw new Error("Must connect wallet first");
        const userWallet = IdoClient.createReadonlyWallet(idoAuthorityAddress);
        const program = IdoClient.createProgram(this.rpcUrl, userWallet, this.readonlyProvider.opts);

        if (this.verbose) {
            console.log(` rpcUrl:              ${this.rpcUrl}`);
            console.log(` userIdoAuthority:    ${idoAuthorityAddress}`);
            console.log(` idoAddress:          ${idoAddress}`);
            console.log(` lastContNumber:      ${lastContNumber}`);
            console.log(` lastContUsdcContributedBefore:    ${lastContUsdcContributedBefore.toString()}`);
            console.log();
        }

        const updateTx = program.transaction.update(
            lastContNumber,
            new BN(lastContUsdcContributedBefore),
            {
                accounts: {
                    idoAuthority: idoAuthorityAddress,
                    idoAccount: idoAddress,
                },
            }
        );

        updateTx.feePayer = idoAuthorityAddress;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        updateTx.recentBlockhash = hash.blockhash;

        return updateTx;
    }

    public async createWithdrawDaoTx(
        meanIdoAddress: PublicKey,
    ): Promise<Transaction> {

        const currentUserPubKey = this.userPubKey;
        if(!currentUserPubKey)
            throw new Error("Must connect wallet first");
        const userWallet = IdoClient.createReadonlyWallet(currentUserPubKey);
        const program = IdoClient.createProgram(this.rpcUrl, userWallet, this.readonlyProvider.opts);

        const idoAccount = await program.account.idoAccount.fetch(meanIdoAddress);
        if(idoAccount === null)
           throw new Error("IDO account not found");

        const userUsdcAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            idoAccount.usdcMint,
            currentUserPubKey,
          );
        if (userUsdcAddress === null) {
            throw Error("user USDC ATA not found");
        }

        const userMeanAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            idoAccount.meanMint,
            currentUserPubKey,
          );
        if (userUsdcAddress === null) {
            throw Error("user USDC ATA not found");
        }

        if (this.verbose) {
            console.log(` Authority:           ${currentUserPubKey}`);
            console.log(` userUsdc:            ${userUsdcAddress}`);
            console.log(` userMean:            ${userMeanAddress}`);
            console.log(` idoAddress:          ${meanIdoAddress}`);
            console.log();
        }

        const withdrawUsdcTx = program.transaction.withdrawDao(
            {
                accounts: {
                    idoAuthority: currentUserPubKey,
                    idoAuthorityMean: userMeanAddress,
                    idoAuthorityUsdc: userUsdcAddress,
                    idoAccount: meanIdoAddress,
                    meanMint: idoAccount.meanMint,
                    usdcMint: idoAccount.usdcMint,
                    meanPool: idoAccount.meanPool,
                    usdcPool: idoAccount.usdcPool,
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                },
            }
        );

        withdrawUsdcTx.feePayer = currentUserPubKey;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        withdrawUsdcTx.recentBlockhash = hash.blockhash;

        return withdrawUsdcTx;
    }

    public async createReddemTx(
        idoAddress: PublicKey,
    ): Promise<Transaction> {

        const currentUserPubKey = this.userPubKey;
        if(!currentUserPubKey)
            throw new Error("Must connect wallet first");
        const userWallet = IdoClient.createReadonlyWallet(currentUserPubKey);
        const program = IdoClient.createProgram(this.rpcUrl, userWallet, this.readonlyProvider.opts);

        const idoAccount = await program.account.idoAccount.fetchNullable(idoAddress);
        if(idoAccount === null)
           throw new Error("IDO account not found");

        const userMeanAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            idoAccount.meanMint,
            currentUserPubKey,
          );
        if (userMeanAddress === null) {
            throw Error("user MEAN ATA not found");
        }

        const [userIdo, userIdoBump] = await this.findUserIdoProgramAddress(currentUserPubKey, idoAddress);
        const userIdoAccount = await program.account.userIdoAccount.fetchNullable(userIdo);
        if(userIdoAccount === null)
           throw new Error("User contribution not found");

        if (this.verbose) {
            console.log(` userIdoAuthority:    ${currentUserPubKey}`);
            console.log(` userMean:            ${userMeanAddress}`);
            console.log(` idoAddress:          ${idoAddress}`);
            console.log(` userIdo:             ${userIdo}`);
            console.log();
        }

        const redeemTx = program.transaction.redeem(
            {
                accounts: {
                    userAuthority: currentUserPubKey,
                    userMean: userMeanAddress,
                    userIdo: userIdo,
                    idoAccount: idoAddress,
                    meanMint: idoAccount.meanMint,
                    meanPool: idoAccount.meanPool,
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: SYSVAR_RENT_PUBKEY,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                },
            }
        );

        redeemTx.feePayer = currentUserPubKey;
        let hash = await this.connection.getLatestBlockhash(this.connection.commitment);
        redeemTx.recentBlockhash = hash.blockhash;

        return redeemTx;
    }

    public async listIdos(stortByStartTs: boolean = true, desc: boolean = true): Promise<Array<IdoDetails>> {
        if(!this.userPubKey)
            throw new Error("Must connect wallet first");

        const ddcaAccounts = await this.readonlyProgram.account.idoAccount.all(this.userPubKey.toBuffer());
        const results: Array<IdoDetails> = ddcaAccounts.map(x => {
           return mapIdoDetails(x.publicKey.toBase58(), x.account);
        });
        
        if (stortByStartTs) {
            if (desc) {
                results.sort((a, b) => b.idoStartTs - a.idoStartTs);
            }
            else {
                results.sort((a, b) => a.idoStartTs - b.idoStartTs);
            }
        }

        return results;
    }

    public async getIdo(meanIdoAddress: PublicKey): Promise<IdoDetails | null> {

        const idoAccount = await this.readonlyProgram.account.idoAccount.fetchNullable(meanIdoAddress);
        if(idoAccount === null)
            return null;

        // const usdcPoolTokenResponse = await this.connection.getTokenAccountBalance(idoAccount.usdcPool);
        // const usdcPoolTokenBalance = usdcPoolTokenResponse.value.uiAmount ?? 0;
        // console.log(`usdcPoolTokenBalance: ${usdcPoolTokenBalance}`);

        return mapIdoDetails(meanIdoAddress.toBase58(), idoAccount);
    }

    public async getUserIdo(idoPubKey: PublicKey, userIdoPubKey: PublicKey | undefined | null): Promise<UserIdoDetails | null> {

        if(!this.userPubKey) {
            return null;
        }

        if(!userIdoPubKey) {
            [userIdoPubKey,] = await this.findUserIdoProgramAddress(this.userPubKey, idoPubKey);
        }

        const userIdoAccount = await this.readonlyProgram.account.userIdoAccount.fetchNullable(userIdoPubKey);
        if(userIdoAccount === null)
            return null;

        return mapUserIdoDetails(userIdoPubKey, userIdoAccount);
    }

    public async getIdoStatus(idoAddress: PublicKey): Promise<IdoStatus> {
        // const tx = await this.readonlyProgram.transaction.simulateStatus({
        //     accounts: {
        //         idoAccount: idoAddress
        //     },
        // });
        // tx.feePayer = IDO_READONLY_PUBKEY;
        // let hash = await this.readonlyProgram.provider.connection.getLatestBlockhash();
        // tx.recentBlockhash = hash.blockhash;
        // console.log(tx.serialize({requireAllSignatures: false, verifySignatures: false}).toString("base64"));

        // simulate status instruction to get current ido status
        const eventsResponse = await this.readonlyProgram.simulate.simulateStatus({
            accounts: {
                idoAccount: idoAddress
            },
        });
        if (eventsResponse.events.length === 0)
            throw new Error("Unable to fetch ido status");

        const statusEvent = eventsResponse.events[0].data;
        const currentIdoStatus: IdoStatus = {
            clusterTs: statusEvent.clusterTs.toNumber(),
            secondsFromIdoStart: statusEvent.secondsFromIdoStart.toNumber(),
            isRunning: statusEvent.isRunning as boolean,
            currentMaxUsdcContribution: toUiAmount(statusEvent.usdcPerUserMaxCurrent),
            currentMaxUsdcContributionTokenAmount: statusEvent.usdcPerUserMaxCurrent.toNumber(),
            currentMeanPrice: toUiAmount(statusEvent.meanPriceCurrent),
            currentMeanPriceTokenAmount: statusEvent.meanPriceCurrent.toNumber(),
            
            usdcNetDeposits: toUiAmount(statusEvent.usdcNetDeposits),
            usdcNetDepositsTokenAmount: statusEvent.usdcNetDeposits.toNumber(),
            usdcNetWithdrawals:  toUiAmount(statusEvent.usdcNetWithdrawals),
            usdcNetWithdrawalsTokenAmount: statusEvent.usdcNetWithdrawals.toNumber(),
            usdcTotalContributed:  toUiAmount(statusEvent.usdcTotalContributed),
            usdcTotalContributedTokenAmount: statusEvent.usdcTotalContributed.toNumber(),

            totalContributors: statusEvent.totalContributors,
            lastContributorNumber: statusEvent.lastContributorNumber,

            gaTotalUsdcContributed: toUiAmount(statusEvent.gaUsdcTotalContributed),
            gaTotalUsdcContributedTokenAmount: statusEvent.gaUsdcTotalContributed.toNumber(),
            gaMeanTotalPurchased: toUiAmount(statusEvent.gaMeanTotalPurchased),
            gaMeanTotalPurchasedTokenAmount: statusEvent.gaMeanTotalPurchased.toNumber(),
            gaIsOpen: statusEvent.gaIsOpen as boolean,
            currentImpliedMeanPrice: toUiAmount(statusEvent.meanImpliedPrice),
            currentImpliedMeanPriceTokenAmount: statusEvent.meanImpliedPrice.toNumber(),
            finalMeanPrice: toUiAmount(statusEvent.meanImpliedPrice),
            finalMeanPriceTokenAmount: statusEvent.meanImpliedPrice.toNumber(),
            finalMeanPurchasedAmount: toUiAmount(BN.min(statusEvent.gaMeanTotalPurchased, statusEvent.meanTotalMax)),
            finalMeanPurchasedTokenAmount: BN.min(statusEvent.gaMeanTotalPurchased, statusEvent.meanTotalMax).toNumber(),

            // user (if set)
            userHasContributed: false,
            userContributorNumber: 0,
            userContributionTs: 0,
            userContributionUpdatedTs: 0,
            userUsdcContributedAmount: 0,
            userUsdcContributedTokenAmount: 0,
            userMeanPurchasedAmount: 0,
            userMeanPurchasedTokenAmount: 0,
            userMeanImpliedAmount: 0,
            userMeanImpliedTokenAmount: 0,
            userIsInGa: false,
        };

        if (this.userPubKey) {
            const [userIdo, userIdoBump] = await anchor.web3.PublicKey.findProgramAddress(
                [
                    this.userPubKey.toBuffer(),
                    idoAddress.toBuffer(),
                    Buffer.from("user_ido")
                ],
                this.readonlyProgram.programId
            );

            const userIdoAccount = await this.readonlyProgram.account.userIdoAccount.fetchNullable(userIdo);

            // fetch will return null if the user ido account does not exist, 
            // which is a valid case if the currently connected wallet 
            // hasen't participated yet in the ido
            if (userIdoAccount) {

                // calculate user implied mean amount
                let userUsdcInGa = new BN(0);

                const idoWithdrawals = await this.readonlyProgram.account.idoWithdrawals.fetchNullable(statusEvent.idoWithdrawalsAddress);
                
                if(idoWithdrawals) {
                    
                    // calculate net withdrew before user
                    const lastIndex = idoWithdrawals.last;
                    let netUsdcWithdrewBeforeUser = new BN(0);
                    for (let i = 0; i < lastIndex; i++) {
                        const wtw = (idoWithdrawals.withdrawals as any[])[i];
                        
                        if(wtw.contributorNumber < userIdoAccount.contributorNumber) {
                            const withdrawalAmount = (idoWithdrawals.withdrawals as any[])[i].amount as BN;
                            netUsdcWithdrewBeforeUser = netUsdcWithdrewBeforeUser.add(withdrawalAmount);
                        }
                    }
                    
                    const usdcTotalContributedBeforeUser = userIdoAccount.usdcNetDepositsSnapshot
                        .sub(new BN(netUsdcWithdrewBeforeUser));
                    
                    if(usdcTotalContributedBeforeUser.gte(statusEvent.usdcTotalMax)) {
                        userUsdcInGa = new BN(0);
                    }
                    else {
                        const diff = statusEvent.usdcTotalMax.sub(usdcTotalContributedBeforeUser);
                        userUsdcInGa = BN.min(diff, userIdoAccount.usdcContributedAmount);
                    }
                }

                const userImpliedMeanTokenAmount = userUsdcInGa
                    .mul(new BN(10**DECIMALS))
                    .div(new BN(currentIdoStatus.currentImpliedMeanPriceTokenAmount));

                currentIdoStatus.userContributorNumber = userIdoAccount.contributorNumber;
                currentIdoStatus.userHasContributed = true;
                currentIdoStatus.userContributionTs = userIdoAccount.contributionTs.toNumber();
                currentIdoStatus.userContributionUpdatedTs = userIdoAccount.contributionUpdatedTs.toNumber();
                currentIdoStatus.userUsdcContributedAmount = toUiAmount(userIdoAccount.usdcContributedAmount);
                currentIdoStatus.userUsdcContributedTokenAmount = userIdoAccount.usdcContributedAmount.toNumber();
                currentIdoStatus.userMeanPurchasedAmount = toUiAmount(userIdoAccount.meanPurchasedAmount);
                currentIdoStatus.userMeanPurchasedTokenAmount = userIdoAccount.meanPurchasedAmount.toNumber();
                currentIdoStatus.userMeanImpliedAmount = toUiAmount(userImpliedMeanTokenAmount);
                currentIdoStatus.userMeanImpliedTokenAmount = userImpliedMeanTokenAmount.toNumber();
                currentIdoStatus.userIsInGa = userImpliedMeanTokenAmount.gt(new BN(0));
            }
        }

        // if(this.verbose)
        //     console.log("currentIdoStatus: ", currentIdoStatus);
        return currentIdoStatus;
    }

    /**
     * ToString
     */
    public toString(): string {
        return `{ rpcUrl: ${this.rpcUrl}, ownerAccountAddress: ${this.userPubKey?.toBase58()}, commitment: ${this.readonlyProvider?.opts?.commitment}, preflightCommitment: ${this.readonlyProvider?.opts?.preflightCommitment}, skipPreflight: ${this.readonlyProvider?.opts?.skipPreflight} }`;
    }

    private async getRpcVersion(): Promise<anchor.web3.Version> {
        if(!this.rpcVersion)
            this.rpcVersion = await this.connection.getVersion();

        return this.rpcVersion;
    }   
    
    /**
    * Attempts to parse an rpc error. Experimental
    */
    public tryParseRpcError(rawError: any): ProgramError | null {
        const errorLogs = rawError?.logs as Array<string> | undefined;
        
        if (errorLogs) {
            const programFailedRegex = /Program ([A-Za-z0-9]+) failed:/;
            let failedProgramId: string | null = null;
            
            for (let i = 0; i < errorLogs.length; i++) {
                const logEntry = errorLogs[i];
                const match = logEntry.match(programFailedRegex);
                if (match && match[1])
                {
                    failedProgramId = match[1];
                    break;
                }
            }

            if(failedProgramId !== this.readonlyProgram.programId.toBase58())
                return null;
        }

        try {
            const idlErrors = parseIdlErrors(this.readonlyProgram.idl);
            const parsedError = ProgramError.parse(rawError, idlErrors);
            return parsedError;
        } catch (error) {
            return null;
        }
    }

    //#region IDO TRACKING

    public async startTracking(idoPubkey: PublicKey, idoStatusChangedCallback: (status: IdoStatus) => void ): Promise<void> {
        if(this.idoTracker)
            throw new Error("Already tracking");
            
        const currentIdoStatus = await this.getIdoStatus(idoPubkey);
        const clusterTimeOffsetInSeconds = currentIdoStatus.clusterTs - Math.floor(Date.now() / 1000);
        // console.log("clusterTimeOffsetInSeconds", clusterTimeOffsetInSeconds)
        
        if(this.verbose)
            console.log("subscribe ido:", idoPubkey.toBase58());
        const idoEventEmitter = this.readonlyProgram.account.idoAccount.subscribe(idoPubkey);

        const idoTracker = new IdoTracker(idoPubkey, clusterTimeOffsetInSeconds, idoEventEmitter, null, idoStatusChangedCallback, this.verbose);
        this.idoTracker = idoTracker; //*

        idoEventEmitter.on('change', (idoAccount) => {
            idoTracker.latestIdo = mapIdoDetails(idoPubkey.toBase58(), idoAccount); //*
          });

        const idoDetails = await this.getIdo(idoPubkey);
        if(!idoDetails)
            throw new Error(`IDO ${idoPubkey} not found`);
        if(!idoTracker.latestIdo)
            idoTracker.latestIdo = idoDetails;

        
        if(this.userPubKey){
            const [userIdoPubKey,] = await this.findUserIdoProgramAddress(this.userPubKey, idoPubkey);
            idoTracker.userIdoPubKey = userIdoPubKey;
            if(this.verbose)
                console.log("userIdo:", userIdoPubKey.toBase58());

            if(this.verbose)
                console.log("subscribe user ido:", userIdoPubKey.toBase58());
            const userIdoEventEmitter = this.readonlyProgram.account.userIdoAccount.subscribe(userIdoPubKey);
            userIdoEventEmitter.on('uncaughtException', function (err) {
                console.log('UNCAUGHT EXCEPTION - keeping process alive:', err);
            });
            idoTracker.userIdoEventEmitter = userIdoEventEmitter;
            userIdoEventEmitter.on('change', (userdoAccount) => {
                idoTracker.latestUserIdo = mapUserIdoDetails(userIdoPubKey, userdoAccount); //*
            });

            const userIdoDetails = await this.getUserIdo(idoPubkey, userIdoPubKey);
            if(!idoTracker.latestUserIdo)
                idoTracker.latestUserIdo = userIdoDetails;
        }

        idoTracker.startTracking();
    }

    public stopTracking() {
        if(!this.idoTracker)
            return;

        if(this.verbose){
            console.log("unsubscribe ido:", this.idoTracker.idoPubKey.toBase58());
        }
        this.readonlyProgram.account.idoAccount.unsubscribe(new PublicKey(this.idoTracker.idoPubKey));
        
        if(this.userPubKey && this.idoTracker.userIdoPubKey) {
            if(this.verbose)
                console.log("unsubscribe user ido:", this.idoTracker.userIdoPubKey.toBase58());
            this.readonlyProgram.account.userIdoAccount.unsubscribe(this.idoTracker.userIdoPubKey);
        }

        this.idoTracker.stopTracking();
        this.idoTracker = null;
    }

    //#endregion
}

class IdoTracker {
    public idoPubKey: PublicKey;
    public userIdoPubKey: PublicKey | null = null;
    private clusterTimeOffsetInSeconds: number ;
    private idoEventEmitter: EventEmitter | null;
    public latestIdo: IdoDetails | null;
    public userIdoEventEmitter: EventEmitter | null;
    public latestUserIdo: UserIdoDetails | null;
    public callback: ((idoStatus: IdoStatus) => void) | null;
    private idoStatusTimeout: NodeJS.Timeout | null;
    private verbose: boolean;

    constructor(
        idoPubKey: PublicKey,
        clusterTimeOffsetInSeconds: number,
        idoEventEmitter: EventEmitter,
        userIdoEventEmitter: EventEmitter | null,
        callback:  ((idoStatus: IdoStatus) => void) | null,
        verbose = false,
    ) {
        this.idoPubKey = idoPubKey;
        this.clusterTimeOffsetInSeconds = clusterTimeOffsetInSeconds;
        this.latestIdo = null;
        this.idoEventEmitter = idoEventEmitter;
        this.latestUserIdo = null;
        this.userIdoEventEmitter = userIdoEventEmitter;
        this.callback = callback;
        this.idoStatusTimeout = null;
        this.verbose = verbose;
    }

    public startTracking() {
        // TODO: 'latestStatus' might be set by the idoStatusListener between the 
        // moment we check 'latestStatus' for falsey and the moment we set it 
        // to 'currentIdoStatus', so we might be setting to an old status. 
        // Consider using semaphore  

        this.execute(this);
    }

    private execute(tracker: IdoTracker) {
        this.idoStatusTimeout = setTimeout(function () {
            if (tracker.callback) {
                const currentStatus = tracker.getIdoStatus();
                // if(tracker.verbose)
                //     console.log("currentStatus", currentStatus)
                tracker.callback(currentStatus);
            }
            tracker.execute(tracker);
        }, 1000);
    }

    public stopTracking() {
        if (this.idoStatusTimeout) {
            clearTimeout(this.idoStatusTimeout);
        }
    }

    public getIdoStatus(): IdoStatus {
        if (!this.latestIdo)
            throw new Error("ido is not set");

        const estimatedClusterTimeTs = Math.floor(Date.now() / 1000) + this.clusterTimeOffsetInSeconds;
        const t = (new BN(estimatedClusterTimeTs).sub(new BN(this.latestIdo.idoStartTs)));
        let status: IdoStatus = {
            clusterTs: estimatedClusterTimeTs,
            secondsFromIdoStart: t.toNumber(),
            isRunning: false,
            currentMaxUsdcContribution: 0,
            currentMaxUsdcContributionTokenAmount: 0,
            currentMeanPrice: 0,
            currentMeanPriceTokenAmount: 0,
            
            usdcNetWithdrawals: this.latestIdo.usdcTotalWithdrawals,
            usdcNetWithdrawalsTokenAmount: this.latestIdo.usdcTotalWithdrawalsTokenAmount,
            usdcNetDeposits: this.latestIdo.usdcTotalDeposits,
            usdcNetDepositsTokenAmount: this.latestIdo.usdcTotalDepositsTokenAmount,
            usdcTotalContributed: this.latestIdo.usdcTotalCurrent,
            usdcTotalContributedTokenAmount: this.latestIdo.usdcTotalCurrentTokenAmount,

            totalContributors: this.latestIdo.totalContributors,
            lastContributorNumber: this.latestIdo.lastContributorNumber,

            gaTotalUsdcContributed: this.latestIdo.gaUsdcTotalContributed,
            gaTotalUsdcContributedTokenAmount: this.latestIdo.gaUsdcTotalContributedTokenAmount,
            gaMeanTotalPurchased: this.latestIdo.gaMeanTotalPurchased,
            gaMeanTotalPurchasedTokenAmount: this.latestIdo.gaMeanTotalPurchasedTokenAmount,
            gaIsOpen: this.latestIdo.gaIsOpen,
            currentImpliedMeanPrice: this.latestIdo.meanImpliedPrice,
            currentImpliedMeanPriceTokenAmount: this.latestIdo.meanImpliedPriceTokenAmount,
            finalMeanPrice: this.latestIdo.meanImpliedPrice,
            finalMeanPriceTokenAmount: this.latestIdo.meanImpliedPriceTokenAmount,
            finalMeanPurchasedAmount: Math.min(this.latestIdo.gaMeanTotalPurchased, this.latestIdo.meanTotalMax),
            finalMeanPurchasedTokenAmount: Math.min(this.latestIdo.gaMeanTotalPurchasedTokenAmount, this.latestIdo.meanTotalMaxTokenAmount),

            // user (if set)
            userHasContributed: false,
            userContributorNumber: 0,
            userContributionTs: 0,
            userContributionUpdatedTs: 0,
            userUsdcContributedAmount: 0,
            userUsdcContributedTokenAmount: 0,
            userMeanPurchasedAmount: 0,
            userMeanPurchasedTokenAmount: 0,
            userMeanImpliedAmount: 0,
            userMeanImpliedTokenAmount: 0,
            userIsInGa: false,
        }

        if(this.latestUserIdo) {

            // const userMeanImpliedAmount =  new BN(this.latestUserIdo.usdcContributedTokenAmount).mul() this.latestIdo.meanImpliedPrice

            status.userContributorNumber = this.latestUserIdo.contributorNumber;
            status.userHasContributed = true;
            status.userContributionTs = this.latestUserIdo.contributionTs;
            status.userContributionUpdatedTs = this.latestUserIdo.contributionUpdatedTs;
            status.userUsdcContributedAmount = this.latestUserIdo.usdcContributedAmount;
            status.userUsdcContributedTokenAmount = this.latestUserIdo.usdcContributedTokenAmount;
            status.userMeanPurchasedAmount = this.latestUserIdo.meanPurchasedAmount;
            status.userMeanPurchasedTokenAmount = this.latestUserIdo.meanPurchasedTokenAmount;
            status.userMeanImpliedAmount = 0;
            status.userMeanImpliedTokenAmount = 0; // TODO
            status.userIsInGa = true; // TODO
        }

        // before start
        if (t.lt(new BN(0))) {

            // if (this.verbose)
            //     console.log(`cluster ts: ~${estimatedClusterTimeTs}. IDO hasn't started yet`);

            status.isRunning = false;
            status.currentMeanPrice = this.latestIdo.meanPriceStart;
            status.currentMeanPriceTokenAmount = this.latestIdo.meanPriceStartTokenAmount;
            status.currentMaxUsdcContribution = this.latestIdo.usdcPerUserMaxStart;
            status.currentMaxUsdcContributionTokenAmount = this.latestIdo.usdcPerUserMaxStartTokenAmount;
        }
        // after end
        else if (t.gt(new BN(this.latestIdo.idoDurationInSeconds))) {
            
            // if (this.verbose)
            //     console.log(`cluster ts: ~${estimatedClusterTimeTs}. IDO has already ended`);

            status.isRunning = false;
            status.currentMeanPrice = this.latestIdo.meanPriceEnd;
            status.currentMeanPriceTokenAmount = this.latestIdo.meanPriceEndTokenAmount;
            status.currentMaxUsdcContribution = this.latestIdo.usdcPerUserMaxEnd;
            status.currentMaxUsdcContributionTokenAmount = this.latestIdo.usdcPerUserMaxEndTokenAmount;
        }
        // running
        else {

            // if (this.verbose)
            //     console.log(`cluster ts: ~${estimatedClusterTimeTs}. IDO is running`);

            status.isRunning = true;
            const refreshIntervalBn = new BN(this.latestIdo.curveRefreshIntervalInSeconds);
            const t2 = t.div(refreshIntervalBn).mul(refreshIntervalBn);
            const currentMeanPrice = meanPriceCurve(
                new BN(this.latestIdo.meanPriceStartTokenAmount),
                new BN(this.latestIdo.meanPriceEndTokenAmount),
                new BN(this.latestIdo.idoDurationInSeconds),
                t2,
            );
            const currentMaxUsdcPerUser = usdcMaxCurve(
                new BN(this.latestIdo.usdcPerUserMaxStartTokenAmount),
                new BN(this.latestIdo.usdcPerUserMaxEndTokenAmount),
                new BN(this.latestIdo.idoDurationInSeconds),
                t2,
            );
            status.currentMeanPrice = currentMeanPrice.toNumber() / 10 ** DECIMALS;
            status.currentMeanPriceTokenAmount = currentMeanPrice.toNumber();
            status.currentMaxUsdcContribution = currentMaxUsdcPerUser.toNumber() / 10 ** DECIMALS;
            status.currentMaxUsdcContributionTokenAmount = currentMaxUsdcPerUser.toNumber();
        }

        return status;
    }
}

//#region FUNTIONS

function toUiAmount(tokenAmount: BN) {
    return tokenAmount.toNumber() / 10**DECIMALS;
}

function tsToUTCString(ts: number): string {
    return ts === 0 ? '' : new Date(ts * 1000).toUTCString();
}

async function createAtaCreateInstructionIfNotExists(
    ataAddress: PublicKey, 
    mintAddress: PublicKey, 
    ownerAccountAddress: PublicKey, 
    payerAddress: PublicKey, 
    connection: Connection
    ): Promise<TransactionInstruction | null> {
  try{
    const ata = await connection.getAccountInfo(ataAddress);
    if(!ata){
        // console.log("ATA: %s for mint: %s was not found. Generating 'create' instruction...", ataAddress.toBase58(), mintAddress.toBase58());
        let [, createIx] = await createAtaCreateInstruction(ataAddress, mintAddress, ownerAccountAddress, payerAddress);
        return createIx;
    }
    
    // console.log("ATA: %s for mint: %s already exists", ataAddress.toBase58(), mintAddress.toBase58());
    return null;
  } catch (err) {
      console.log("Unable to find associated account: %s", err);
      throw Error("Unable to find associated account");
  }
}

async function createAtaCreateInstruction(
    ataAddress: PublicKey, 
    mintAddress: PublicKey, 
    ownerAccountAddress: PublicKey, 
    payerAddress: PublicKey
    ): Promise<[PublicKey, TransactionInstruction]> {
  if(ataAddress === null){
    ataAddress = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mintAddress,
      ownerAccountAddress,
    );
  }

  let ataCreateInstruction = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mintAddress,
    ataAddress,
    ownerAccountAddress,
    payerAddress,
  );
  return [ataAddress, ataCreateInstruction];
}

// export function meanPriceCurve(ps: BN, pe: BN, t_total: BN, t: BN): BN {
//     const meanPrice =
//         ps
//             .mul(pe)
//             .mul(t_total)
//             .div(
//                 t
//                 .mul(ps.sub(pe))
//                 .add(
//                     t_total
//                     .mul(pe)
//                 )
//             );
//     return meanPrice;
// }

// didn't work
// export function meanPriceCurve(ps: BN, pe: BN, t_total: BN, t: BN): BN {
//     const t_half = t_total.div(new BN(2));
//     return t.gte(t_half)
//         ? usdcMaxCurve(ps, pe, t_total, t.sub(t_half))
//         : usdcMaxCurve(ps, pe, t_total, t.add(t_half));
// }

export function meanPriceCurve(ps: BN, pe: BN, t_total: BN, t: BN): BN {
    const uDelta = ps.sub(pe);
    const kFactor = uDelta.mul(new BN(10)).div(new BN(100)); // 10% of uDelta
    const t_half = t_total.div(new BN(2));

    let tSub: BN;
    if (t.gte(t_half)) {
        const t_ = t.sub(t_half); // [0 --> t_ --> t_total/2]
        tSub = t_total.sub(new BN(2).mul(t_)); // [t_total --> tSub --> 0]
    } else {
        const t_ = t.add(t_half); // [t_total/2 --> t_ --> t_total [
        tSub = (new BN(2)).mul(t_).sub(t_total); // [0 --> tSub --> t_total]
    }

    const numerator = uDelta
        .add(new BN(2).mul(kFactor))
        .mul(tSub).mul(uDelta);
    const denominator = (new BN(4)).mul(t_total).mul(kFactor)
        .add(
            (new BN(2)).mul(uDelta).mul(tSub)
        );
    // console.log(JSON.stringify(
    //     {
    //         "uDelta": uDelta.toString(),
    //         "kFactor": kFactor.toString(),
    //         "tSub": tSub.toString(),
    //         "numerator": numerator.toString(),
    //         "denominator": denominator.toString(),
    //     }
    // ));
    if (t.gte(t_half)) {
        return pe.add(numerator.div(denominator));
    } else {
        return ps.sub(numerator.div(denominator));
    }
}

export function usdcMaxCurve(us: BN, ue: BN, t_total: BN, t: BN): BN {
    const uDelta = us.sub(ue);
    const kFactor = uDelta.mul(new BN(10)).div(new BN(100)); // 10% of uDelta
    const yAdd = uDelta.add(new BN(2).mul(ue)).div(new BN(2));

    let tSub: BN;
    if (t.gte(t_total.div(new BN(2)))) {
        tSub = (new BN(2)).mul(t).sub(t_total);
    } else {
        tSub = t_total.sub(new BN(2).mul(t));
    }

    const numerator = uDelta
        .add(new BN(2).mul(kFactor))
        .mul(tSub).mul(uDelta);
    const denominator = (new BN(4)).mul(t_total).mul(kFactor)
        .add(
            (new BN(2)).mul(uDelta).mul(tSub)
        );

    if (t.gte(t_total.div(new BN(2)))) {
        return yAdd.sub(numerator.div(denominator));
    } else {
        return yAdd.add(numerator.div(denominator));
    }
}

export function mapIdoDetails(idoAddress: string, idoAccountUntyped: any): IdoDetails {
    const idoAccount = idoAccountUntyped as idoAccountType;
    var idoTimes = idoAccount.idoTimes as IdoTimes;
    // const withdrawals = (idoAccount.withdrawals as any[]).map(x => 
    //     { 
    //         const entry: WithdrawalEntry = {
    //             contributorNumber: x.contributorNumber,
    //             amount: x.amount.toNumber(),
    //         };
    //         return entry;
    //     });
    return {
        idoAddress: idoAddress,
        idoAuthority: idoAccount.idoAuthority.toBase58(),
        idoName: String.fromCharCode(...idoAccount.idoName),

        idoStartTs: idoTimes.idoStartTs.toNumber(),
        idoStartUtc: tsToUTCString(idoTimes.idoStartTs.toNumber()),
        idoEndTs: idoTimes.idoEndTs.toNumber(),
        idoEndUtc: tsToUTCString(idoTimes.idoEndTs.toNumber()),
        redeemStartTs: idoTimes.redeemStartTs.toNumber(),
        redeemStartUtc: tsToUTCString(idoTimes.redeemStartTs.toNumber()),
        redeemEndTs: idoTimes.redeemEndTs.toNumber(),
        redeemEndUtc: tsToUTCString(idoTimes.redeemEndTs.toNumber()),

        idoMeanAmount: idoAccount.idoMeanAmount.toNumber(),

        usdcMint: idoAccount.usdcMint.toBase58(),
        meanMint: idoAccount.meanMint.toBase58(),

        usdcPool: idoAccount.usdcPool.toBase58(),
        meanPool: idoAccount.meanPool.toBase58(),

        meanPriceStart: idoAccount.meanPriceStart.toNumber() / 10**DECIMALS,
        meanPriceStartTokenAmount: idoAccount.meanPriceStart.toNumber(),
        meanPriceEnd: idoAccount.meanPriceEnd.toNumber() / 10**DECIMALS,
        meanPriceEndTokenAmount: idoAccount.meanPriceEnd.toNumber(),

        usdcPerUserMin: idoAccount.usdcPerUserMin.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcPerUserMinTokenAmount: idoAccount.usdcPerUserMin.toNumber(),
        usdcPerUserMaxStart: idoAccount.usdcPerUserMaxStart.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcPerUserMaxStartTokenAmount: idoAccount.usdcPerUserMaxStart.toNumber(),
        usdcPerUserMaxEnd: idoAccount.usdcPerUserMaxEnd.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcPerUserMaxEndTokenAmount: idoAccount.usdcPerUserMaxEnd.toNumber(),

        usdcTotalMin: idoAccount.usdcTotalMin.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcTotalMinTokenAmount: idoAccount.usdcTotalMin.toNumber(),
        usdcTotalMax: idoAccount.usdcTotalMax.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcTotalMaxTokenAmount: idoAccount.usdcTotalMax.toNumber(),

        meanTotalMax: idoAccount.meanTotalMax.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        meanTotalMaxTokenAmount: idoAccount.meanTotalMax.toNumber(),
        
        curveRefreshIntervalInSeconds: idoAccount.curveRefreshIntervalInSeconds.toNumber(),
        
        usdcTotalDeposits: idoAccount.usdcNetDeposits.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcTotalDepositsTokenAmount: idoAccount.usdcNetDeposits.toNumber(),
        usdcTotalWithdrawals: idoAccount.usdcNetWithdrawals.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        usdcTotalWithdrawalsTokenAmount: idoAccount.usdcNetWithdrawals.toNumber(),
        usdcTotalCurrent: idoAccount.usdcTotalContributed.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcTotalCurrentTokenAmount: idoAccount.usdcTotalContributed.toNumber(),

        totalContributors: idoAccount.totalContributors,
        lastContributorNumber: idoAccount.lastContributorNumber,
        coolOffPeriodInSeconds: idoAccount.coolOffPeriodInSeconds.toNumber(),
        
        gaUsdcTotalContributed: idoAccount.gaUsdcTotalContributed.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        gaUsdcTotalContributedTokenAmount: idoAccount.gaUsdcTotalContributed.toNumber(),
        // gaTotalContributors: idoAccount.gaTotalContributors,
        gaMeanTotalPurchased: idoAccount.gaMeanTotalPurchased.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        gaMeanTotalPurchasedTokenAmount: idoAccount.gaMeanTotalPurchased.toNumber(),
        gaIsOpen: idoAccount.gaIsOpen as boolean,
        gaLastContributorNumber: idoAccount.gaLastContributorNumber,
        gaLastContributorUsdcContributedBefore: idoAccount.gaLastContributorUsdcContributedBefore.toNumber(),
        
        meanImpliedPrice: idoAccount.meanImpliedPrice.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        meanImpliedPriceTokenAmount: idoAccount.meanImpliedPrice.toNumber(),

        totalRedeems: idoAccount.totalRedeems,
        
       idoDurationInSeconds: (idoAccount.idoTimes as IdoTimes).idoEndTs.toNumber() - idoTimes.idoStartTs.toNumber()
    };
}

export function mapUserIdoDetails(userIdoPubKey: PublicKey, userIdoAccount: userIdoAccountType): UserIdoDetails {
    
    return {
        address: userIdoPubKey.toBase58(),
        contributionTs: userIdoAccount.contributionTs.toNumber(),
        contributionUpdatedTs: userIdoAccount.contributionUpdatedTs.toNumber(),
        contributorNumber: userIdoAccount.contributorNumber,

        usdcNetDepositsSnapshot: toUiAmount(userIdoAccount.usdcNetDepositsSnapshot),
        usdcNetDepositsSnapshotTokenAmount: userIdoAccount.usdcNetDepositsSnapshot.toNumber(),
        usdcNetWithdrawalsSnapshot: toUiAmount(userIdoAccount.usdcNetWithdrawalsSnapshot),
        usdcNetWithdrawalsSnapshotTokenAmount: userIdoAccount.usdcNetWithdrawalsSnapshot.toNumber(),
        
        usdcContributedAmount: toUiAmount(userIdoAccount.usdcContributedAmount),
        usdcContributedTokenAmount: userIdoAccount.usdcContributedAmount.toNumber(),
        
        meanPriceAtContributionTs: toUiAmount(userIdoAccount.meanPriceAtContributionTs),
        meanPriceAtContributionTsTokenAmount: userIdoAccount.meanPriceAtContributionTs.toNumber(),
        meanPurchasedAmount: toUiAmount(userIdoAccount.meanPurchasedAmount),
        meanPurchasedTokenAmount: userIdoAccount.meanPurchasedAmount.toNumber(),
        // TODO: mean implied amount
        userWalletAddress: "",
    }
}

//#endregion

//#region TYPES

type PoolBumps = {
  idoAccount: number;
  meanPool: number;
  usdcPool: number;
};

// 
type IdoTimes = {
    idoStartTs: BN;
    idoEndTs: BN;
    redeemStartTs: BN;
    redeemEndTs: BN;
};

export type IdoDetails = {
    idoAddress: string;
    idoAuthority: string;
    idoName: string;

    idoStartTs: number;
    idoStartUtc: string;
    idoEndTs: number;
    idoEndUtc: string;
    redeemStartTs: number;
    redeemStartUtc: string;
    redeemEndTs: number;
    redeemEndUtc: string;

    idoMeanAmount: number;

    meanMint: string;
    usdcMint: string;

    meanPool: string;
    usdcPool: string;

    meanPriceStart: number;
    meanPriceStartTokenAmount: number;
    meanPriceEnd: number;
    meanPriceEndTokenAmount: number;

    usdcPerUserMin: number;
    usdcPerUserMinTokenAmount: number;
    usdcPerUserMaxStart: number;
    usdcPerUserMaxStartTokenAmount: number;
    usdcPerUserMaxEnd: number;
    usdcPerUserMaxEndTokenAmount: number;
    usdcTotalMin: number;
    usdcTotalMinTokenAmount: number;
    usdcTotalMax: number;
    usdcTotalMaxTokenAmount: number;
    meanTotalMax: number;
    meanTotalMaxTokenAmount: number;

    curveRefreshIntervalInSeconds: number;

    usdcTotalDeposits: number;
    usdcTotalDepositsTokenAmount: number;    
    usdcTotalWithdrawals: number;
    usdcTotalWithdrawalsTokenAmount: number;
    usdcTotalCurrent: number;
    usdcTotalCurrentTokenAmount: number;

    totalContributors: number;
    lastContributorNumber: number;
    coolOffPeriodInSeconds: number;

    gaUsdcTotalContributed: number;
    gaUsdcTotalContributedTokenAmount: number;
    gaMeanTotalPurchased: number;
    gaMeanTotalPurchasedTokenAmount: number;
    gaIsOpen: boolean;
    gaLastContributorNumber: number;
    gaLastContributorUsdcContributedBefore: number,

    meanImpliedPrice: number;
    meanImpliedPriceTokenAmount: number;
    totalRedeems: number;

    idoDurationInSeconds: number;
}

export type UserIdoDetails = {
    address: string;
    contributionTs: number;
    contributionUpdatedTs: number;
    contributorNumber: number;
    
    usdcNetDepositsSnapshot: number;
    usdcNetDepositsSnapshotTokenAmount: number;
    usdcNetWithdrawalsSnapshot: number;
    usdcNetWithdrawalsSnapshotTokenAmount: number;

    usdcContributedAmount: number;
    usdcContributedTokenAmount: number;
    meanPriceAtContributionTs: number;
    meanPriceAtContributionTsTokenAmount: number;
    meanPurchasedAmount: number;
    meanPurchasedTokenAmount: number;
    // TODO: calculate user implied mean amount

    userWalletAddress: string;
}

export type IdoStatus = {
    clusterTs: number,
    secondsFromIdoStart: number,
    isRunning: boolean,
    currentMaxUsdcContribution: number,
    currentMaxUsdcContributionTokenAmount: number,
    currentMeanPrice: number,
    currentMeanPriceTokenAmount: number,

    usdcNetDeposits: number,
    usdcNetDepositsTokenAmount: number,
    usdcNetWithdrawals: number,
    usdcNetWithdrawalsTokenAmount: number,
    usdcTotalContributed: number,
    usdcTotalContributedTokenAmount: number,

    totalContributors: number,
    lastContributorNumber: number,

    gaTotalUsdcContributed: number,
    gaTotalUsdcContributedTokenAmount: number,
    gaMeanTotalPurchased: number,
    gaMeanTotalPurchasedTokenAmount: number,
    gaIsOpen: boolean,
    currentImpliedMeanPrice: number,
    currentImpliedMeanPriceTokenAmount: number,
    finalMeanPrice: number,
    finalMeanPriceTokenAmount: number,
    finalMeanPurchasedAmount: number,
    finalMeanPurchasedTokenAmount: number,

    // user (if set)
    userHasContributed: boolean,
    userContributionTs: number,
    userContributionUpdatedTs: number,
    userContributorNumber: number,
    userUsdcContributedAmount: number,
    userUsdcContributedTokenAmount: number,
    userMeanPurchasedAmount: number,
    userMeanPurchasedTokenAmount: number,
    userMeanImpliedAmount: number,
    userMeanImpliedTokenAmount: number,
    userIsInGa: boolean;
}

export type WithdrawalEntry = {
    contributorNumber: number,
    amount: number,
}

//#endregion
