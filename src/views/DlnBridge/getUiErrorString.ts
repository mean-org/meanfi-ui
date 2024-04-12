import type { DlnErrorResponse } from './DlnBridgeProvider';

const getUiErrorString = (errorResponse: DlnErrorResponse) => {
  let errorString = '';
  switch (errorResponse.errorId) {
    case 'UNSUPPORTED_TOKEN_IN':
      errorString = 'Pair not supported, select another token to send';
      break;
    case 'UNSUPPORTED_TOKEN_OUT':
      errorString = 'Pair not supported, select another token to receive';
      break;
    case 'HUGE_AMOUNT':
      errorString = 'Amount too large. Please try a smaller amount';
      break;
    case 'ERROR_LOW_GIVE_AMOUNT':
      errorString = 'Amount too low. Please try a larger amount';
      break;
    case 'RATE_OUTDATED':
      errorString = 'Rate outdated, refresh quote';
      break;
    case 'IMPOSSIBLE_ROUTE':
      errorString = 'Please select another token to send';
      break;
    case 'ESTIMATION_FAILED':
    case 'UNABLE_TO_ESTIMATE_ORDER_FULFILLMENT':
    case 'UNABLE_TO_ESTIMATE_EXTERNAL_CALL_WITHOUT_GAS':
      errorString = 'Estimation failed, try different amount';
      break;
    case 'INTERNAL_SDK_ERROR':
    case 'INTERNAL_SERVER_ERROR':
    default:
      errorString = 'There is not enough liquidity in the destination';
      break;
  }

  return errorString;
};

export default getUiErrorString;
