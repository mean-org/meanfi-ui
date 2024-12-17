import { STREAM_STATE, type StreamInfo } from '@mean-dao/money-streaming/lib/types';
import type { Stream } from '@mean-dao/payment-streaming';
import type { LooseObject } from 'src/types/LooseObject';

export const getReadableStream = (item: Stream | StreamInfo) => {
  const isNew = item.version >= 2;
  const v1 = item as StreamInfo;
  const v2 = item as Stream;

  const debugObject: LooseObject = {
    allocationAssigned: isNew ? v2.allocationAssigned.toString() : v1.allocationAssigned,
    associatedToken: isNew ? v2.mint.toBase58() : (v1.associatedToken as string),
    beneficiary: isNew ? v2.beneficiary.toBase58() : (v1.beneficiaryAddress as string),
    category: isNew ? v2.category : 0,
    cliffVestAmount: isNew ? v2.cliffVestAmount.toString() : v1.cliffVestAmount,
    cliffVestPercent: item.cliffVestPercent,
    createdBlockTime: item.createdBlockTime,
    createdOnUtc: isNew ? v2.createdOnUtc : '-',
    estimatedDepletionDate: isNew ? v2.estimatedDepletionDate : (v1.escrowEstimatedDepletionUtc as string),
    feePayedByTreasurer: isNew ? v2.tokenFeePayedFromAccount : false,
    fundsLeftInStream: isNew ? v2.fundsLeftInStream.toString() : v1.escrowUnvestedAmount,
    fundsSentToBeneficiary: isNew
      ? v2.fundsSentToBeneficiary.toString()
      : v1.allocationAssigned - v1.allocationLeft + v1.escrowVestedAmount,
    id: isNew ? v2.id.toBase58() : (v1.id as string),
    isManuallyPaused: isNew ? v2.isManuallyPaused : false,
    lastRetrievedBlockTime: isNew ? v2.lastRetrievedBlockTime : v1.lastRetrievedBlockTime,
    lastRetrievedTimeInSeconds: isNew ? v2.lastRetrievedTimeInSeconds : '-',
    name: isNew ? v2.name : v1.streamName,
    rateAmount: isNew ? v2.rateAmount.toString() : v1.rateAmount,
    rateIntervalInSeconds: item.rateIntervalInSeconds,
    remainingAllocationAmount: isNew
      ? v2.remainingAllocationAmount.toString()
      : v1.allocationReserved || v1.allocationLeft,
    secondsSinceStart: isNew ? v2.secondsSinceStart : '-',
    startUtc: isNew ? v2.startUtc : (v1.startUtc as string),
    status: isNew ? `${v2.statusCode} = ${v2.statusName}` : `${STREAM_STATE[v1.state]} = ${v1.state}`,
    streamUnitsPerSecond: isNew ? v2.streamUnitsPerSecond : '-',
    subCategory: isNew ? v2.subCategory : '-',
    totalWithdrawalsAmount: isNew ? v2.totalWithdrawalsAmount.toString() : '-',
    treasurer: isNew ? v2.psAccountOwner.toBase58() : (v1.treasurerAddress as string),
    treasury: isNew ? v2.psAccount.toBase58() : (v1.treasuryAddress as string),
    version: item.version,
    withdrawableAmount: isNew ? v2.withdrawableAmount.toString() : v1.escrowVestedAmount,
  };

  return debugObject;
};
