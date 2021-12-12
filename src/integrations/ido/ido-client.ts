import {
	PublicKey,
	Connection,
    Transaction,
    TransactionInstruction} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as anchor from "@project-serum/anchor";
import { BN, parseIdlErrors, Program, ProgramError } from "@project-serum/anchor";
import { Wallet } from "@project-serum/anchor/src/provider";
import ido_idl from './mean_ido_pool.json';
import EventEmitter from 'eventemitter3';
// import { MeanIdoPool } from "./mean_ido_pool_types";

// CONSTANTS
const SYSTEM_PROGRAM_ID = anchor.web3.SystemProgram.programId;
const SYSVAR_RENT_PUBKEY = anchor.web3.SYSVAR_RENT_PUBKEY;
const DECIMALS = 6;
const DECIMALS_BN = new BN(DECIMALS);
const IDO_READONLY_PUBKEY = new PublicKey("3KmMEv7A8R3MMhScQceXBQe69qLmnFfxSM3q8HyzkrSx");

/**
 * Anchor based client for the Mean IDO program
 */
export class IdoClient {

    private rpcUrl: string;
    public connection: Connection;
    public readonlyProvider: anchor.Provider;
    public readonlyProgram: anchor.Program;
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

    private static createProgram(rpcUrl: string, wallet: Wallet, confirmOptions?: anchor.web3.ConfirmOptions): anchor.Program {
        const provider = IdoClient.getAnchorProvider(rpcUrl, wallet, confirmOptions);
        const programId = new anchor.web3.PublicKey(ido_idl.metadata.address);
        const program = new anchor.Program(ido_idl as anchor.Idl, programId, provider);
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

        const usdcAmountBn = new anchor.BN(amount).mul(new BN(10).pow(DECIMALS_BN));
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
        let hash = await this.connection.getRecentBlockhash(this.connection.commitment);
        depositUsdcTx.recentBlockhash = hash.blockhash;

        return [userIdo, depositUsdcTx];
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
                    systemProgram: SYSTEM_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );

        withdrawUsdcTx.feePayer = currentUserPubKey;
        let hash = await this.connection.getRecentBlockhash(this.connection.commitment);
        withdrawUsdcTx.recentBlockhash = hash.blockhash;

        return [userIdo, withdrawUsdcTx];
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

        const idoAccount = await this.readonlyProgram.account.idoAccount.fetch(meanIdoAddress);
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
        // const tx = await this.program.transaction.simulateStatus({
        //     accounts: {
        //         idoAccount: this.ido.idoAddress
        //     },
        // });
        // tx.feePayer = IDO_TRACKING_PUBKEY;
        // let hash = await this.program.provider.connection.getRecentBlockhash();
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
            clusterTs: (statusEvent.clusterTs as BN).toNumber(),
            secondsFromIdoStart: (statusEvent.secondsFromIdoStart as BN).toNumber(),
            isRunning: statusEvent.isRunning as boolean,
            currentMeanPrice: (statusEvent.meanPriceCurrent as BN).toNumber() / 10 ** DECIMALS,
            currentMeanPriceTokenAmount: (statusEvent.meanPriceCurrent as BN).toNumber(),
            currentMaxUsdcContribution: (statusEvent.usdcPerUserMaxCurrent as BN).toNumber() / 10 ** DECIMALS,
            currentMaxUsdcContributionTokenAmount: (statusEvent.usdcPerUserMaxCurrent as BN).toNumber(),
            totalUsdcContributed: (statusEvent.usdcTotalCurrent as BN).toNumber() / 10 ** DECIMALS,
            totalUsdcContributedTokenAmount: (statusEvent.usdcTotalCurrent as BN).toNumber(),
            totalMeanAllocated: (statusEvent.meanAllocatedCurrent as BN).toNumber() / 10 ** DECIMALS,
            totalMeanAllocatedTokenAmount: (statusEvent.meanAllocatedCurrent as BN).toNumber(),
            currentImpliedMeanPrice: (statusEvent.meanImpliedPrice as BN).toNumber() / 10 ** DECIMALS,
            currentImpliedMeanPriceTokenAmount: (statusEvent.meanImpliedPrice as BN).toNumber(),
            
            totalUsdcWithdrew: (statusEvent.usdcTotalWithdrew as BN).toNumber() / 10 ** DECIMALS,
            totalUsdcWithdrewTokenAmount: (statusEvent.usdcTotalWithdrew as BN).toNumber(),
            maxTotalUsdcPlusWithdrew: (statusEvent.usdcTotalMaxPlusWithdrew as BN).toNumber() / 10 ** DECIMALS,
            maxTotalUsdcPlusWithdrewTokenAmount: (statusEvent.usdcTotalMaxPlusWithdrew as BN).toNumber(),
            
            totalMeanDeallocated: (statusEvent.meanTotalDeallocated as BN).toNumber() / 10 ** DECIMALS,
            totalMeanDeallocatedTokenAmount: (statusEvent.meanTotalDeallocated as BN).toNumber(),
            maxTotalMeanPlusDeallocated: (statusEvent.meanTotalMaxPlusDeallocated as BN).toNumber() / 10 ** DECIMALS,
            maxTotalMeanPlusDeallocatedTokenAmount: (statusEvent.meanTotalMaxPlusDeallocated as BN).toNumber(),

            // user (if set)
            hasUserContributed: false,
            userUsdcContributionTs: 0,
            userUsdcContributedAmount: 0,
            userUsdcContributedTokenAmount: 0,
            userMeanAllocatedAmount: 0,
            userMeanAllocatedTokenAmount: 0,
            userMeanImpliedAmount: 0,
            userMeanImpliedTokenAmount: 0,
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
                const userUsdcContributionBn = userIdoAccount.usdcContributionAmount;

                currentIdoStatus.hasUserContributed = true;
                currentIdoStatus.userUsdcContributionTs = userIdoAccount.usdcContributionTs.toNumber();
                currentIdoStatus.userUsdcContributedAmount = toUiAmount(userUsdcContributionBn);
                currentIdoStatus.userUsdcContributedTokenAmount = userUsdcContributionBn.toNumber();
                currentIdoStatus.userMeanAllocatedAmount = toUiAmount(userIdoAccount.meanAllocatedAmount);
                currentIdoStatus.userMeanAllocatedTokenAmount = userIdoAccount.meanAllocatedAmount.toNumber();
                
                // TODO: calculate user implied mean amount
                // Enforece max total usdc cap
                const usdcTotalAtDepositTimeBn = userIdoAccount.usdcTotalBeforeDeposit as BN;
                const usdcTotalMaxPlusWithdrewBn = statusEvent.usdcTotalMaxPlusWithdrew as BN;
                const zeroBn = new BN(0);
                const usdcTotalLeftBn = usdcTotalMaxPlusWithdrewBn.gt(usdcTotalAtDepositTimeBn)
                    ? usdcTotalMaxPlusWithdrewBn.sub(usdcTotalAtDepositTimeBn)
                    : zeroBn;
                const userUsdcDepositedEffectiveBn = usdcTotalLeftBn.gt(zeroBn) ? BN.min(usdcTotalLeftBn, userUsdcContributionBn) : zeroBn;

                const meanImpliedPrice = statusEvent.meanImpliedPrice as BN;
                let userMeanAllocatedEffectiveBn = meanImpliedPrice.lte(zeroBn) 
                    ? zeroBn 
                    : new BN(10).pow(new BN(DECIMALS))
                        .mul(userUsdcDepositedEffectiveBn)
                        .div(meanImpliedPrice);

                // Enforece max total mean allocation cap
                const meanTotalAllocatedAtDepositTimeBn = userIdoAccount.meanAllocatedBeforeDeposit as BN;
                const meanTotalMaxPlusDeallocatedBn = statusEvent.meanTotalMaxPlusDeallocated as BN;
                const meanTotalLeftBn = meanTotalMaxPlusDeallocatedBn.gt(meanTotalAllocatedAtDepositTimeBn)
                    ? meanTotalMaxPlusDeallocatedBn.sub(meanTotalAllocatedAtDepositTimeBn)
                    : zeroBn;
                userMeanAllocatedEffectiveBn = meanTotalLeftBn.gt(zeroBn) ? BN.min(meanTotalLeftBn, userMeanAllocatedEffectiveBn) : zeroBn;

                currentIdoStatus.userMeanAllocatedAmount = toUiAmount(userMeanAllocatedEffectiveBn);
                currentIdoStatus.userMeanAllocatedTokenAmount = userMeanAllocatedEffectiveBn.toNumber();
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

        const currentIdoStatus = await this.getIdoStatus(new PublicKey(idoPubkey));
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
            currentMeanPrice: 0,
            currentMeanPriceTokenAmount: 0,
            currentMaxUsdcContribution: 0,
            currentMaxUsdcContributionTokenAmount: 0,
            totalUsdcContributed: this.latestIdo.usdcTotalCurrent,
            totalUsdcContributedTokenAmount: this.latestIdo.usdcTotalCurrentTokenAmount,
            totalMeanAllocated: this.latestIdo.meanAllocatedCurrent,
            totalMeanAllocatedTokenAmount: this.latestIdo.meanAllocatedCurrentTokenAmount,
            currentImpliedMeanPrice: this.latestIdo.meanImpliedPrice,
            currentImpliedMeanPriceTokenAmount: this.latestIdo.meanImpliedPriceTokenAmount,
            
            totalUsdcWithdrew: this.latestIdo.usdcTotalWithdrew,
            totalUsdcWithdrewTokenAmount: this.latestIdo.usdcTotalWithdrewTokenAmount,
            maxTotalUsdcPlusWithdrew: this.latestIdo.usdcTotalMaxPlusWithdrew,
            maxTotalUsdcPlusWithdrewTokenAmount: this.latestIdo.usdcTotalMaxPlusWithdrewTokenAmount,

            totalMeanDeallocated: this.latestIdo.meanTotalDeallocated,
            totalMeanDeallocatedTokenAmount: this.latestIdo.meanTotalDeallocatedTokenAmount,
            maxTotalMeanPlusDeallocated: this.latestIdo.meanTotalMaxPlusDeallocated,
            maxTotalMeanPlusDeallocatedTokenAmount: this.latestIdo.meanTotalMaxPlusDeallocatedTokenAmount,

            // user (if set)
            hasUserContributed: false,
            userUsdcContributionTs: 0,
            userUsdcContributedAmount: 0,
            userUsdcContributedTokenAmount: 0,
            userMeanAllocatedAmount: 0,
            userMeanAllocatedTokenAmount: 0,
            userMeanImpliedAmount: 0,
            userMeanImpliedTokenAmount: 0,
        }

        if(this.latestUserIdo) {
            status.hasUserContributed = true;
            status.userUsdcContributionTs = this.latestUserIdo.usdcContributionTs;
            status.userUsdcContributedAmount = this.latestUserIdo.usdcContributedAmount;
            status.userUsdcContributedTokenAmount = this.latestUserIdo.usdcContributedTokenAmount;
            status.userMeanAllocatedAmount = this.latestUserIdo.meanAllocatedAmount;
            status.userMeanAllocatedTokenAmount = this.latestUserIdo.meanAllocatedTokenAmount;
            status.userMeanImpliedAmount = 0; // TODO
            status.userMeanImpliedTokenAmount = 0; // TODO
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
            const currentMeanPrice = meanPriceCurve(
                new BN(this.latestIdo.meanPriceStartTokenAmount),
                new BN(this.latestIdo.meanPriceEndTokenAmount),
                new BN(this.latestIdo.idoDurationInSeconds),
                t,
            );
            const currentMaxUsdcPerUser = usdcMaxCurve(
                new BN(this.latestIdo.usdcPerUserMaxStartTokenAmount),
                new BN(this.latestIdo.usdcPerUserMaxEndTokenAmount),
                new BN(this.latestIdo.idoDurationInSeconds),
                t,
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

export function meanPriceCurve(ps: BN, pe: BN, t_total: BN, t: BN): BN {
    const meanPrice =
        ps
            .mul(pe)
            .mul(t_total)
            .div(
                t
                .mul(ps.sub(pe))
                .add(
                    t_total
                    .mul(pe)
                )
            );
    return meanPrice;
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

export function mapIdoDetails(idoAddress: string, idoAccount: any): IdoDetails {
    return {
        idoAddress: idoAddress,
        idoAuthority: idoAccount.idoAuthority.toBase58(),
        idoName: String.fromCharCode(...idoAccount.idoName),

        idoStartTs: idoAccount.idoTimes.idoStartTs.toNumber(),
        idoStartUtc: tsToUTCString(idoAccount.idoTimes.idoStartTs.toNumber()),
        idoEndTs: idoAccount.idoTimes.idoEndTs.toNumber(),
        idoEndUtc: tsToUTCString(idoAccount.idoTimes.idoEndTs.toNumber()),
        redeemStartTs: idoAccount.idoTimes.redeemStartTs.toNumber(),
        redeemStartUtc: tsToUTCString(idoAccount.idoTimes.redeemStartTs.toNumber()),
        redeemEndTs: idoAccount.idoTimes.redeemEndTs.toNumber(),
        redeemEndUtc: tsToUTCString(idoAccount.idoTimes.redeemEndTs.toNumber()),

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

        usdcTotalCurrent: idoAccount.usdcTotalCurrent.toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcTotalCurrentTokenAmount: idoAccount.usdcTotalCurrent.toNumber(),
        meanAllocatedCurrent: idoAccount.meanAllocatedCurrent.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        meanAllocatedCurrentTokenAmount: idoAccount.meanAllocatedCurrent.toNumber(),
        meanImpliedPrice: idoAccount.meanImpliedPrice.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        meanImpliedPriceTokenAmount: idoAccount.meanImpliedPrice.toNumber(),
        
        usdcTotalWithdrew: idoAccount.usdcTotalWithdrew.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        usdcTotalWithdrewTokenAmount: idoAccount.usdcTotalWithdrew.toNumber(),
        usdcTotalMaxPlusWithdrew: idoAccount.usdcTotalMax.add(idoAccount.usdcTotalWithdrew).toNumber() / 10**DECIMALS, // USDC_DECIMALS
        usdcTotalMaxPlusWithdrewTokenAmount: idoAccount.usdcTotalMax.add(idoAccount.usdcTotalWithdrew).toNumber(),
        
        meanTotalDeallocated: idoAccount.meanTotalDeallocated.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
        meanTotalDeallocatedTokenAmount: idoAccount.meanTotalDeallocated.toNumber(),
        meanTotalMaxPlusDeallocated: idoAccount.meanTotalMax.add(idoAccount.meanTotalDeallocated).toNumber() / 10**DECIMALS, // USDC_DECIMALS
        meanTotalMaxPlusDeallocatedTokenAmount: idoAccount.meanTotalMax.add(idoAccount.meanTotalDeallocated).toNumber(),

        idoDurationInSeconds: idoAccount.idoTimes.idoEndTs.toNumber() - idoAccount.idoTimes.idoStartTs.toNumber()
    };
}

function mapUserIdoDetails(userIdoPubKey: PublicKey, userIdoAccount: any): UserIdoDetails {
    
    return {
        address: userIdoPubKey,
        usdcContributionTs: userIdoAccount.usdcContributionTs.toNumber(),
        usdcTotalBeforeDeposit: toUiAmount(userIdoAccount.usdcTotalBeforeDeposit),
        usdcTotalBeforeDepositTokenAmount: userIdoAccount.usdcTotalBeforeDeposit.toNumber(),
        meanAllocatedBeforeDeposit: toUiAmount(userIdoAccount.meanAllocatedBeforeDeposit),
        meanAllocatedBeforeDepositTokenAmount: userIdoAccount.meanAllocatedBeforeDeposit.toNumber(),
        usdcContributedAmount: toUiAmount(userIdoAccount.usdcContributionAmount),
        usdcContributedTokenAmount: userIdoAccount.usdcContributionAmount.toNumber(),
        meanAllocatedAmount: toUiAmount(userIdoAccount.meanAllocatedAmount),
        meanAllocatedTokenAmount: userIdoAccount.meanAllocatedAmount.toNumber(),
        // TODO: mean implied amount
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

    usdcTotalCurrent: number;
    usdcTotalCurrentTokenAmount: number;
    meanAllocatedCurrent: number;
    meanAllocatedCurrentTokenAmount: number;
    meanImpliedPrice: number;
    meanImpliedPriceTokenAmount: number;

    usdcTotalWithdrew: number;
    usdcTotalWithdrewTokenAmount: number;
    usdcTotalMaxPlusWithdrew: number;
    usdcTotalMaxPlusWithdrewTokenAmount: number;    

    meanTotalDeallocated: number;
    meanTotalDeallocatedTokenAmount: number;
    meanTotalMaxPlusDeallocated: number;
    meanTotalMaxPlusDeallocatedTokenAmount: number;    

    idoDurationInSeconds: number;
}

export type UserIdoDetails = {
    address: PublicKey;
    usdcContributionTs: number;
    usdcTotalBeforeDeposit: number;
    usdcTotalBeforeDepositTokenAmount: number;
    meanAllocatedBeforeDeposit: number;
    meanAllocatedBeforeDepositTokenAmount: number;
    usdcContributedAmount: number;
    usdcContributedTokenAmount: number;
    meanAllocatedAmount: number;
    meanAllocatedTokenAmount: number;
    // TODO: calculate user implied mean amount
}

export type IdoStatus = {
    clusterTs: number,
    secondsFromIdoStart: number,
    isRunning: boolean,
    currentMeanPrice: number,
    currentMeanPriceTokenAmount: number,
    currentMaxUsdcContribution: number,
    currentMaxUsdcContributionTokenAmount: number,

    totalUsdcContributed: number,
    totalUsdcContributedTokenAmount: number,
    totalMeanAllocated: number,
    totalMeanAllocatedTokenAmount: number,
    currentImpliedMeanPrice: number,
    currentImpliedMeanPriceTokenAmount: number,
    totalUsdcWithdrew: number,
    totalUsdcWithdrewTokenAmount: number,
    maxTotalUsdcPlusWithdrew: number,
    maxTotalUsdcPlusWithdrewTokenAmount: number,
    totalMeanDeallocated: number,
    totalMeanDeallocatedTokenAmount: number,
    maxTotalMeanPlusDeallocated: number,
    maxTotalMeanPlusDeallocatedTokenAmount: number,

    // user (if set)
    hasUserContributed: boolean,
    userUsdcContributionTs: number,
    userUsdcContributedAmount: number,
    userUsdcContributedTokenAmount: number,
    userMeanAllocatedAmount: number,
    userMeanAllocatedTokenAmount: number,
    userMeanImpliedAmount: number,
    userMeanImpliedTokenAmount: number,
}

//#endregion
