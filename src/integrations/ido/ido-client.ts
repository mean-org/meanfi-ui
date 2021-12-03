import {
	PublicKey,
	Connection,
    Transaction,
    TransactionInstruction} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as anchor from "@project-serum/anchor";
import { BN, parseIdlErrors, ProgramError } from "@project-serum/anchor";
import { Wallet } from "@project-serum/anchor/src/provider";
import ido_idl from './mean_ido_pool.json';

// CONSTANTS
const SYSTEM_PROGRAM_ID = anchor.web3.SystemProgram.programId;
const SYSVAR_RENT_PUBKEY = anchor.web3.SYSVAR_RENT_PUBKEY;
const DECIMALS = 6;
const DECIMALS_BN = new BN(DECIMALS);
const IDO_TRACKING_PUBKEY = new PublicKey("3KmMEv7A8R3MMhScQceXBQe69qLmnFfxSM3q8HyzkrSx");

/**
 * Anchor based client for the Mean IDO program
 */
export class IdoClient {

    private rpcUrl: string;
    public connection: Connection;
    public provider: anchor.Provider;
    public program: anchor.Program;
    private ownerAccountAddress: PublicKey;
    private verbose: boolean;
    private rpcVersion: anchor.web3.Version | null = null;

    /**
     * Create a Mean IDO client
     */
    constructor(
        rpcUrl: string,
        wallet: Wallet,
        // commitment: Commitment | string = 'confirmed' as Commitment
        confirmOptions?: anchor.web3.ConfirmOptions,
        verbose = false,
    ) {
        if(!rpcUrl)
            throw new Error("wallet cannot be null or undefined");

        if(!wallet || !wallet.publicKey)
            throw new Error("wallet's public key cannot be null or undefined");

        this.ownerAccountAddress = wallet.publicKey;
        this.rpcUrl = rpcUrl;
        const provider = this.getAnchorProvider(rpcUrl, wallet, confirmOptions);
        this.provider = provider;
        this.connection = provider.connection;
        anchor.setProvider(provider);

        const programId = new anchor.web3.PublicKey(ido_idl.metadata.address);
        this.program = new anchor.Program(ido_idl as anchor.Idl, programId, provider);
        this.verbose = verbose;
    }

    private getAnchorProvider(
        rpcUrl: string,
        // commitment: Commitment | string = 'confirmed',
        anchorWallet: Wallet,
        opts?: anchor.web3.ConfirmOptions) {

        opts = opts ?? anchor.Provider.defaultOptions();
        const connection = new Connection(rpcUrl, opts.preflightCommitment);
        const provider = new anchor.Provider(
            connection, anchorWallet, opts,
        );
        return provider;
    }

    public async createDepositUsdcTx(
        meanIdoAddress: PublicKey,
        amount: number,
    ): Promise<[PublicKey, Transaction]> {

        // TODO: params check
        if (amount <= 0)
            throw Error("Invalid amount");
        // TODO: more validation

        const idoAccount = await this.program.account.idoAccount.fetch(meanIdoAddress);
        if(idoAccount === null)
           throw new Error("IDO account not found");

        const userUsdcAddress = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            idoAccount.usdcMint,
            this.ownerAccountAddress,
          );

        const [userIdo, userIdoBump] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.ownerAccountAddress.toBuffer(),
                meanIdoAddress.toBuffer(), 
                Buffer.from("user_ido")
            ],
            this.program.programId
        );

        const usdcAmountBn = new anchor.BN(amount).mul(new BN(10).pow(DECIMALS_BN));

        if (this.verbose) {
            console.log(` userIdoAuthority:    ${this.provider.wallet.publicKey}`);
            console.log(` userUsdc:            ${userUsdcAddress}`);
            console.log(` idoAddress:          ${meanIdoAddress}`);
            console.log(` userIdo:             ${userIdo}`);
            console.log(` userUsdcAmount:      ${usdcAmountBn.toNumber()}`);
            console.log();
        }

        const depositUsdcTx = this.program.transaction.depositUsdc(
            usdcAmountBn,
            userIdoBump,
            {
                accounts: {
                    userAuthority: this.provider.wallet.publicKey,
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

        depositUsdcTx.feePayer = this.ownerAccountAddress;
        let hash = await this.connection.getRecentBlockhash(this.connection.commitment);
        depositUsdcTx.recentBlockhash = hash.blockhash;

        return [userIdo, depositUsdcTx];
    }

    public mapIdoDetails(idoAddress: string, idoAccount: any): MeanIdoDetails {
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

            usdcTotalCurrent: idoAccount.usdcTotalCurrent.toNumber() / 10**DECIMALS, // USDC_DECIMALS
            usdcTotalCurrentTokenAmount: idoAccount.usdcTotalCurrent.toNumber(),
            meanAllocatedCurrent: idoAccount.meanAllocatedCurrent.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
            meanAllocatedCurrentTokenAmount: idoAccount.meanAllocatedCurrent.toNumber(),
            meanImpliedPrice: idoAccount.meanImpliedPrice.toNumber() / 10**DECIMALS, // MEAN_DECIMALS
            meanImpliedPriceTokenAmount: idoAccount.meanImpliedPrice.toNumber(),

            idoDurationInSeconds: idoAccount.idoTimes.idoEndTs.toNumber() - idoAccount.idoTimes.idoStartTs.toNumber()
        };
    }

    public async listIdos(stortByStartTs: boolean = true, desc: boolean = true): Promise<Array<MeanIdoDetails>> {

        const ddcaAccounts = await this.program.account.idoAccount.all(this.ownerAccountAddress.toBuffer());
        const results: Array<MeanIdoDetails> = ddcaAccounts.map(x => {
           return this.mapIdoDetails(x.publicKey.toBase58(), x.account);
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

    public async getIdo(meanIdoAddress: PublicKey): Promise<MeanIdoDetails | null> {

        const idoAccount = await this.program.account.idoAccount.fetch(meanIdoAddress);
        if(idoAccount === null)
            return null;

        const usdcPoolTokenResponse = await this.connection.getTokenAccountBalance(idoAccount.usdcPool);
        const usdcPoolTokenBalance = usdcPoolTokenResponse.value.uiAmount ?? 0;

        console.log(`usdcPoolTokenBalance: ${usdcPoolTokenBalance}`);

        return this.mapIdoDetails(meanIdoAddress.toBase58(), idoAccount);
    }

    public async getIdoTracker(idoAddress: PublicKey): Promise<IdoTracker> {
        const idoDetails = await this.getIdo(idoAddress);
        if(!idoDetails)
            throw new Error("IDO not found");

        const w: Wallet = {publicKey: IDO_TRACKING_PUBKEY, signAllTransactions: async (txs) => txs, signTransaction: async tx => tx}
        const prov = new anchor.Provider(this.connection, w, this.program.provider.opts);
        const p = new anchor.Program(ido_idl as anchor.Idl, this.program.programId, prov);
        return new IdoTracker(p, idoDetails, true);
    }

    /**
     * ToString
     */
    public toString(): string {
        return `{ rpcUrl: ${this.rpcUrl}, ownerAccountAddress: ${this.ownerAccountAddress?.toBase58()}, commitment: ${this.provider?.opts?.commitment}, preflightCommitment: ${this.provider?.opts?.preflightCommitment}, skipPreflight: ${this.provider?.opts?.skipPreflight} }`;
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

            if(failedProgramId !== this.program.programId.toBase58())
                return null;
        }

        try {
            const idlErrors = parseIdlErrors(this.program.idl);
            const parsedError = ProgramError.parse(rawError, idlErrors);
            return parsedError;
        } catch (error) {
            return null;
        }
    }
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

export function meanPriceCurve(ps: BN, pe: BN, T: BN, t: BN): BN {
    const meanPrice =
        ps
            .mul(pe)
            .mul(T)
            .div(
                t
                .mul(ps.sub(pe))
                .add(
                    T
                    .mul(pe)
                )
            );
    return meanPrice;
}

export function usdcMaxCurve(us: BN, ue: BN, T: BN, t: BN): BN {
    const uDelta = us.sub(ue);
    // const kFactor = new BN(1800);
    const kFactor = uDelta.mul(new BN(10)).div(new BN(100));
    const numerator = uDelta.add(new BN(2).mul(kFactor)).mul(new BN(2).mul(t).sub(T)).mul(uDelta);
    const yAdd = uDelta.add(new BN(2).mul(ue)).div(new BN(2));
    const modulo = t.gte(T.div(new BN(2))) ? (new BN(2)).mul(t).sub(T) : T.sub(new BN(2).mul(t));
    const denominator = (new BN(4)).mul(T).mul(kFactor)
        .add(
            (new BN(2)).mul(uDelta).mul(modulo)
        );

    return yAdd.sub(numerator.div(denominator));
}

type PoolBumps = {
  idoAccount: number;
  meanPool: number;
  usdcPool: number;
};
 
type IdoTimes = {
    idoStartTs: BN;
    idoEndTs: BN;
    redeemStartTs: BN;
};

export type MeanIdoDetails = {
    idoAddress: string;
    idoAuthority: string;
    idoName: string;

    idoStartTs: number;
    idoStartUtc: string;
    idoEndTs: number;
    idoEndUtc: string;
    redeemStartTs: number;
    redeemStartUtc: string;

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

    usdcTotalCurrent: number;
    usdcTotalCurrentTokenAmount: number;
    meanAllocatedCurrent: number;
    meanAllocatedCurrentTokenAmount: number;
    meanImpliedPrice: number;
    meanImpliedPriceTokenAmount: number;

    idoDurationInSeconds: number;
}

export class IdoTracker {
    private program: anchor.Program;
    private ido: MeanIdoDetails;
    private latestStatus: IdoStatus | null;
    private clusterTimeOffsetInSeconds: number | null;
    private idoStatusListener: number | null;
    private callback: ((idoStatus: IdoStatus) => void) | null;
    private idoStatusTimeout: NodeJS.Timeout | null;
    private verbose: boolean;

    constructor(
        program: anchor.Program,
        ido: MeanIdoDetails,
        verbose = false,
    ) {
        // if(!wallet || !wallet.publicKey)
        //     throw new Error("wallet's public key cannot be null or undefined");

        // this.provider = provider;
        // this.connection = provider.connection;
        this.latestStatus = null;
        this.program = program;
        this.ido = ido;
        this.clusterTimeOffsetInSeconds = null;
        this.idoStatusListener = null;
        this.callback = null;
        this.idoStatusTimeout = null;
        this.verbose = verbose;
    }

    public async startTracking(): Promise<void> {
        // register listener for ido account updates using websocket connection
        const listener = this.program.addEventListener("IdoStatusEvent", (event, slot) => {
            console.log("ido status event:", event);
            const currentIdoStatus: IdoStatus = {
                clusterTs: event.clusterTs,
                secondsFromIdoStart: event.secondsSinceIdoStart,
                isRunning: event.IsRunning,
                CurrentMeanPrice: (event.meanPriceCurrent as BN).toNumber() / 10 ** DECIMALS,
                CurrentMeanPriceTokenAmount: (event.meanPriceCurrent as BN).toNumber(),
                CurrentMaxUsdcContribution: (event.usdcPerUserMaxCurrent as BN).toNumber() / 10 ** DECIMALS,
                CurrentMaxUsdcContributionTokenAmount: (event.usdcPerUserMaxCurrent as BN).toNumber(),
                TotalUsdcContributed: (event.usdcTotalCurrent as BN).toNumber() / 10 ** DECIMALS,
                TotalUsdcContributedTokenAmount: (event.usdcTotalCurrent as BN).toNumber(),
                TotalMeanAllocated: (event.meanAllocatedCurrent as BN).toNumber() / 10 ** DECIMALS,
                TotalMeanAllocatedTokenAmount: (event.meanAllocatedCurrent as BN).toNumber(),
                CurrentImpliedMeanPrice: (event.meanImpliedPrice as BN).toNumber() / 10 ** DECIMALS,
                CurrentImpliedMeanPriceTokenAmount: (event.meanImpliedPrice as BN).toNumber(),
            };
            
            this.latestStatus = currentIdoStatus;
        });
        this.idoStatusListener = listener;

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
        const eventsResponse = await this.program.simulate.simulateStatus({
            accounts: {
                idoAccount: this.ido.idoAddress
            },
        });
        if (eventsResponse.events.length === 0)
            throw new Error("Unable to fetch ido status");

        const statusEvent = eventsResponse.events[0].data;
        const currentIdoStatus: IdoStatus = {
            clusterTs: (statusEvent.clusterTs as BN).toNumber(),
            secondsFromIdoStart: (statusEvent.secondsFromIdoStart as BN).toNumber(),
            isRunning: statusEvent.IsRunning as boolean,
            CurrentMeanPrice: (statusEvent.meanPriceCurrent as BN).toNumber() / 10 ** DECIMALS,
            CurrentMeanPriceTokenAmount: (statusEvent.meanPriceCurrent as BN).toNumber(),
            CurrentMaxUsdcContribution: (statusEvent.usdcPerUserMaxCurrent as BN).toNumber() / 10 ** DECIMALS,
            CurrentMaxUsdcContributionTokenAmount: (statusEvent.usdcPerUserMaxCurrent as BN).toNumber(),
            TotalUsdcContributed: (statusEvent.usdcTotalCurrent as BN).toNumber() / 10 ** DECIMALS,
            TotalUsdcContributedTokenAmount: (statusEvent.usdcTotalCurrent as BN).toNumber(),
            TotalMeanAllocated: (statusEvent.meanAllocatedCurrent as BN).toNumber() / 10 ** DECIMALS,
            TotalMeanAllocatedTokenAmount: (statusEvent.meanAllocatedCurrent as BN).toNumber(),
            CurrentImpliedMeanPrice: (statusEvent.meanImpliedPrice as BN).toNumber() / 10 ** DECIMALS,
            CurrentImpliedMeanPriceTokenAmount: (statusEvent.meanImpliedPrice as BN).toNumber(),
        };
        // TODO: 'latestStatus' might be set by the idoStatusListener between the 
        // moment we check 'latestStatus' for falsey and the moment we set it 
        // to 'currentIdoStatus', so we might be setting to an old status. 
        // Consider using semaphore
        this.latestStatus = this.latestStatus ?? currentIdoStatus;
        this.clusterTimeOffsetInSeconds = this.latestStatus.clusterTs - Math.floor(Date.now() / 1000);

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

    public async StopTracking() {
        if (this.idoStatusListener !== null) {
            this.program.removeEventListener(this.idoStatusListener);
        }

        if (this.idoStatusTimeout) {
            clearTimeout(this.idoStatusTimeout);
        }

        this.clusterTimeOffsetInSeconds = null;
    }

    public getIdoStatus(): IdoStatus {
        if (!this.clusterTimeOffsetInSeconds)
            throw new Error("You must call 'startTracking' first");

        const estimatedClusterTimeTs = Math.floor(Date.now() / 1000) + this.clusterTimeOffsetInSeconds;
        const t = (new BN(estimatedClusterTimeTs).sub(new BN(this.ido.idoStartTs)));
        let status: IdoStatus = {
            clusterTs: estimatedClusterTimeTs,
            secondsFromIdoStart: t.toNumber(),
            isRunning: false,
            CurrentMeanPrice: 0,
            CurrentMeanPriceTokenAmount: 0,
            CurrentMaxUsdcContribution: 0,
            CurrentMaxUsdcContributionTokenAmount: 0,
            TotalUsdcContributed: this.latestStatus?.TotalUsdcContributed ?? 0,
            TotalUsdcContributedTokenAmount: this.latestStatus?.TotalUsdcContributedTokenAmount ?? 0,
            TotalMeanAllocated: this.latestStatus?.TotalMeanAllocated ?? 0,
            TotalMeanAllocatedTokenAmount: this.latestStatus?.TotalMeanAllocatedTokenAmount ?? 0,
            CurrentImpliedMeanPrice: this.latestStatus?.CurrentImpliedMeanPrice ?? 0,
            CurrentImpliedMeanPriceTokenAmount: this.latestStatus?.CurrentImpliedMeanPriceTokenAmount ?? 0,
        }

        // before start
        if (t.lt(new BN(0))) {

            if (this.verbose)
                console.log(`cluster ts: ~${estimatedClusterTimeTs}. IDO hasn't started yet`);

            status.isRunning = false;
            status.CurrentMeanPrice = this.ido.meanPriceStart;
            status.CurrentMeanPriceTokenAmount = this.ido.meanPriceStartTokenAmount;
            status.CurrentMaxUsdcContribution = this.ido.usdcPerUserMaxStart;
            status.CurrentMaxUsdcContributionTokenAmount = this.ido.usdcPerUserMaxStartTokenAmount;
        }
        // after end
        else if (t.gt(new BN(this.ido.idoDurationInSeconds))) {
            
            if (this.verbose)
                console.log(`cluster ts: ~${estimatedClusterTimeTs}. IDO has already ended`);

            status.isRunning = false;
            status.CurrentMeanPrice = this.ido.meanPriceEnd;
            status.CurrentMeanPriceTokenAmount = this.ido.meanPriceEndTokenAmount;
            status.CurrentMaxUsdcContribution = this.ido.usdcPerUserMaxEnd;
            status.CurrentMaxUsdcContributionTokenAmount = this.ido.usdcPerUserMaxEndTokenAmount;
        }
        // running
        else {

            if (this.verbose)
                console.log(`cluster ts: ~${estimatedClusterTimeTs}. IDO is running`);

            status.isRunning = true;
            const currentMeanPrice = meanPriceCurve(
                new BN(this.ido.meanPriceStartTokenAmount),
                new BN(this.ido.meanPriceEndTokenAmount),
                new BN(this.ido.idoDurationInSeconds),
                t,
            );
            const currentMaxUsdcPerUser = usdcMaxCurve(
                new BN(this.ido.usdcPerUserMaxStartTokenAmount),
                new BN(this.ido.usdcPerUserMaxEndTokenAmount),
                new BN(this.ido.idoDurationInSeconds),
                t,
            );
            status.CurrentMeanPrice = currentMeanPrice.toNumber() / 10 ** DECIMALS;
            status.CurrentMeanPriceTokenAmount = currentMeanPrice.toNumber();
            status.CurrentMaxUsdcContribution = currentMaxUsdcPerUser.toNumber() / 10 ** DECIMALS;
            status.CurrentMaxUsdcContributionTokenAmount = currentMaxUsdcPerUser.toNumber();
        }

        return status;
    }

    public addIdoUpdateListener(callback: (idoStatus: IdoStatus) => void) {
        this.callback = callback;
    }
}

export type IdoStatus = {
    clusterTs: number,
    secondsFromIdoStart: number,
    isRunning: boolean,
    CurrentMeanPrice: number,
    CurrentMeanPriceTokenAmount: number,
    CurrentMaxUsdcContribution: number,
    CurrentMaxUsdcContributionTokenAmount: number,
    TotalUsdcContributed: number,
    TotalUsdcContributedTokenAmount: number,
    TotalMeanAllocated: number,
    TotalMeanAllocatedTokenAmount: number,
    CurrentImpliedMeanPrice: number,
    CurrentImpliedMeanPriceTokenAmount: number,
}
