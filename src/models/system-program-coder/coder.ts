import { Idl } from "@project-serum/anchor";
import { MeanSystemAccountsCoder } from "./accounts";
import { MeanSystemInstructionCoder } from "./instruction";

/**
 * Coder for the SPL token program.
 */
 export class MeanSplTokenCoder {
    readonly instruction: MeanSystemInstructionCoder;
    readonly accounts: MeanSystemAccountsCoder;
    // readonly state: MeanSystemStateCoder;
    // readonly events: SystemEventsCoder;
    // readonly types: SystemTypesCoder;
  
    constructor(idl: Idl) {
      this.instruction = new MeanSystemInstructionCoder();
      this.accounts = new MeanSystemAccountsCoder();
      // this.events = new SplTokenEventsCoder(idl);
      // this.state = new SplTokenStateCoder(idl);
    }
  }