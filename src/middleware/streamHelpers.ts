import { STREAM_STATE, type StreamInfo } from '@mean-dao/money-streaming';
import { STREAM_STATUS_CODE, type Stream } from '@mean-dao/payment-streaming';

export const isV2Stream = (stream?: Stream | StreamInfo) => {
  if (stream?.version) {
    return stream.version >= 2;
  }
  return false;
};

export const getStreamStatus = (
  stream: Stream | StreamInfo,
): 'scheduled' | 'stopped' | 'stopped-manually' | 'running' => {
  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  if (stream.version < 2) {
    switch (v1.state) {
      case STREAM_STATE.Schedule:
        return 'scheduled';
      case STREAM_STATE.Paused:
        return 'stopped';
      default:
        return 'running';
    }
  }
  switch (v2.statusCode) {
    case STREAM_STATUS_CODE.Scheduled:
      return 'scheduled';
    case STREAM_STATUS_CODE.Paused:
      if (v2.isManuallyPaused) {
        return 'stopped-manually';
      }
      return 'stopped';
    default:
      return 'running';
  }
};

export const getStreamStatusLabel = (item: Stream | StreamInfo): string => {
  if (!item) {
    return '';
  }

  const v1 = item as StreamInfo;
  const v2 = item as Stream;
  if (isV2Stream(item)) {
    switch (v2.statusCode) {
      case STREAM_STATUS_CODE.Scheduled:
        return 'streams.status.status-scheduled';
      case STREAM_STATUS_CODE.Paused:
        if (v2.isManuallyPaused) {
          return 'streams.status.status-paused';
        }
        return 'streams.status.status-stopped';
      default:
        return 'streams.status.status-running';
    }
  }
  switch (v1.state) {
    case STREAM_STATE.Schedule:
      return 'streams.status.status-scheduled';
    case STREAM_STATE.Paused:
      return 'streams.status.status-stopped';
    default:
      return 'streams.status.status-running';
  }
};

export const getStreamId = (stream?: Stream | StreamInfo) => {
  if (!stream) return '';
  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  return stream.version < 2 ? (v1.id as string) : v2.id.toString();
};

export const getStreamBeneficiary = (stream: Stream | StreamInfo | undefined) => {
  if (!stream) return '';

  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  const beneficiary = isV2Stream(stream) ? v2.beneficiary ?? '' : v1.beneficiaryAddress ?? '';

  if (typeof beneficiary === 'string') {
    return beneficiary;
  }

  return beneficiary.toString();
};

export const getStreamTreasurer = (stream: Stream | StreamInfo) => {
  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  const beneficiary = isV2Stream(stream) ? v2.psAccountOwner ?? '' : v1.treasurerAddress ?? '';

  if (typeof beneficiary === 'string') {
    return beneficiary;
  }

  return beneficiary.toString();
};

export const isInboundStream = (
  stream: Stream | StreamInfo | undefined,
  accountAddress: string | undefined,
): boolean => {
  if (stream && accountAddress) {
    const beneficiary = getStreamBeneficiary(stream);

    return beneficiary === accountAddress;
  }
  return false;
};
