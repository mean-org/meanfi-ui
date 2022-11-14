import { Stream, STREAM_STATUS } from "@mean-dao/msp";
import { StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { shortenAddress } from "./utils";

interface LooseObject {
  [key: string]: any
}

// Stream title
export const getStreamTitle = (item: Stream | StreamInfo, trans?: any): string => {
  let title = '';
  if (item) {
    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (item.version < 2) {
      if (v1.streamName) {
        return `${v1.streamName}`;
      }
      
      if (v1.isUpdatePending) {
        title = `${trans ? trans('streams.stream-list.title-pending-from') : "Pending execution from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      } else if (v1.state === STREAM_STATE.Schedule) {
        title = `${trans ? trans('streams.stream-list.title-scheduled-from') : "Scheduled stream from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      } else if (v1.state === STREAM_STATE.Paused) {
        title = `${trans ? trans('streams.stream-list.title-paused-from') : "Paused stream from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      } else {
        title = `${trans ? trans('streams.stream-list.title-receiving-from') : "Receiving from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      }
    } else {
      if (v2.name) {
        return `${v2.name}`;
      }

      if (v2.status === STREAM_STATUS.Scheduled) {
        title = `${trans ? trans('streams.stream-list.title-scheduled-from') : "Scheduled stream from"} (${shortenAddress(`${v2.treasurer}`)})`;
      } else if (v2.status === STREAM_STATUS.Paused) {
        title = `${trans ? trans('streams.stream-list.title-paused-from') : "Paused stream from"} (${shortenAddress(`${v2.treasurer}`)})`;
      } else {
        title = `${trans ? trans('streams.stream-list.title-receiving-from') : "Receiving from"} (${shortenAddress(`${v2.treasurer}`)})`;
      }
    }
  }

  return title;
}

export const getReadableStream = (item: Stream | StreamInfo) => {

  const isNew = item.version >= 2 ? true : false;
  const v1 = item as StreamInfo;
  const v2 = item as Stream;

  const debugObject: LooseObject = {
    allocationAssigned: isNew ? v2.allocationAssigned.toString() : v1.allocationAssigned,
    associatedToken: isNew ? v2.associatedToken.toBase58() : v1.associatedToken as string,
    beneficiary: isNew ? v2.beneficiary.toBase58() : v1.beneficiaryAddress as string,
    category: isNew ? v2.category : 0,
    cliffVestAmount: isNew ? v2.cliffVestAmount.toString() : v1.cliffVestAmount,
    cliffVestPercent: item.cliffVestPercent,
    createdBlockTime: item.createdBlockTime,
    createdOnUtc: isNew ? v2.createdOnUtc : '-',
    estimatedDepletionDate: isNew
      ? v2.estimatedDepletionDate
      : v1.escrowEstimatedDepletionUtc as string,
    feePayedByTreasurer: isNew ? v2.feePayedByTreasurer : false,
    fundsLeftInStream: isNew ? v2.fundsLeftInStream.toString() : v1.escrowUnvestedAmount,
    fundsSentToBeneficiary: isNew
      ? v2.fundsSentToBeneficiary.toString()
      : v1.allocationAssigned - v1.allocationLeft + v1.escrowVestedAmount,
    id: isNew ? v2.id.toBase58() : v1.id as string,
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
    startUtc: isNew ? v2.startUtc : v1.startUtc as string,
    status: isNew
      ? `${STREAM_STATUS[v2.status as STREAM_STATUS]} = ${v2.status}`
      : `${STREAM_STATE[v1.state]} = ${v1.state}`,
    streamUnitsPerSecond: isNew ? v2.streamUnitsPerSecond : '-',
    subCategory: isNew ? v2.subCategory : '-',
    totalWithdrawalsAmount: isNew ? v2.totalWithdrawalsAmount.toString() : '-',
    treasurer: isNew ? v2.treasurer.toBase58() : v1.treasurerAddress as string,
    treasury: isNew ? v2.treasury.toBase58() : v1.treasuryAddress as string,
    version: item.version,
    withdrawableAmount: isNew ? v2.withdrawableAmount.toString() : v1.escrowVestedAmount
  };

  return debugObject;
}
