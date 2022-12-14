import { StreamInfo } from "@mean-dao/money-streaming";
import { Stream } from "@mean-dao/payment-streaming";

export const getStreamAssociatedMint = (stream: StreamInfo | Stream | undefined) => {
  if (!stream) {
    return '';
  }

  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  return stream.version < 2
    ? v1.associatedToken as string
    : v2.mint.toBase58();
}
