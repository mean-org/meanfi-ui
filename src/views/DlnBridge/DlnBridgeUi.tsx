import { useContext, useEffect, useState } from 'react';
import { SUPPORTED_CHAINS, useDlnBridge } from './DlnBridgeProvider';
import TokenSelector from './TokenSelector';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { Modal, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { Identicon } from 'components/Identicon';
import { consoleOut, toUsCurrency } from 'middleware/ui';
import './style.scss';
import { TokenDisplay } from 'components/TokenDisplay';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import {
  cutNumber,
  findATokenAddress,
  getAmountFromLamports,
  getAmountWithSymbol,
  isValidNumber,
  toTokenAmount,
  toUiAmount,
} from 'middleware/utils';
import { MIN_SOL_BALANCE_REQUIRED } from 'constants/common';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from 'contexts/wallet';
import { useConnection } from 'contexts/connection';
import { getTokenAccountBalanceByAddress } from 'middleware/accounts';
import { AppStateContext } from 'contexts/appstate';

const { Option } = Select;
type ActionTarget = 'source' | 'destination';

const DlnBridgeUi = () => {
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { loadingPrices, refreshPrices, getTokenPriceByAddress } = useContext(AppStateContext);

  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [tokenBalanceBn, setSelectedTokenBalanceBn] = useState(new BN(0));

  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const [selectedTokenSet, setSelectedTokenSet] = useState<ActionTarget>('source');

  // supportedChains load automatically as an array of number
  const {
    supportedChains,
    sourceChain,
    destinationChain,
    srcTokens,
    dstTokens,
    srcChainTokenIn,
    dstChainTokenOut,
    amountIn,
    srcChainTokenInAmount,
    setSourceChain,
    setDestinationChain,
    setDstChainTokenOut,
    setSrcChainTokenIn,
    setAmountIn,
  } = useDlnBridge();

  const getMaxAmount = () => {
    const amount = nativeBalance - MIN_SOL_BALANCE_REQUIRED;
    return amount > 0 ? amount : 0;
  };

  const getSrcTokenPrice = () => {
    if (!amountIn || !srcChainTokenIn) {
      return 0;
    }

    return parseFloat(amountIn) * getTokenPriceByAddress(srcChainTokenIn.address, srcChainTokenIn.symbol);
  };

  const showTokenSelector = (tokenSet: ActionTarget) => {
    setSelectedTokenSet(tokenSet);
    setTokenSelectorModalVisibility(true);
  };

  const closeTokenSelector = () => setTokenSelectorModalVisibility(false);

  const setSelectedToken = (token: TokenInfo) => {
    if (selectedTokenSet === 'source') {
      setSrcChainTokenIn(token);
    } else {
      setDstChainTokenOut(token);
    }
  };

  const onSrcChainSelected = (e: any) => {
    consoleOut('Selected chain:', e, 'blue');
    if (e !== destinationChain) {
      setSourceChain(e);
    }
  };

  const onAmountInChange = (e: any) => {
    let newValue = e.target.value;

    const decimals = srcChainTokenIn?.decimals ?? 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setAmountIn('');
    } else if (newValue === '.') {
      setAmountIn('.');
    } else if (isValidNumber(newValue)) {
      setAmountIn(newValue);
    }
  };

  // Keep account balance updated
  useEffect(() => {
    setNativeBalance(getAmountFromLamports(account?.lamports));
  }, [account?.lamports]);

  // Keep token balance updated
  useEffect(() => {
    if (!publicKey || !srcChainTokenIn) {
      setSelectedTokenBalance(0);
      setSelectedTokenBalanceBn(new BN(0));

      return;
    }

    if (srcChainTokenIn.address === NATIVE_SOL.address) {
      setSelectedTokenBalance(nativeBalance);
      const balanceBn = toTokenAmount(nativeBalance, srcChainTokenIn.decimals);
      setSelectedTokenBalanceBn(new BN(balanceBn.toString()));

      return;
    }

    const srcTokenPk = new PublicKey(srcChainTokenIn.address);
    const srcTokenAddress = findATokenAddress(publicKey, srcTokenPk);
    getTokenAccountBalanceByAddress(connection, srcTokenAddress)
      .then(result => {
        const balance = result?.uiAmount ?? 0;
        consoleOut('srcToken balance:', balance, 'blue');
        setSelectedTokenBalance(balance);
        const balanceBn = toTokenAmount(balance, srcChainTokenIn.decimals);
        setSelectedTokenBalanceBn(new BN(balanceBn.toString()));
      })
      .catch(() => {
        setSelectedTokenBalance(0);
        setSelectedTokenBalanceBn(new BN(0));
      });
  }, [connection, nativeBalance, publicKey, srcChainTokenIn]);

  // Set srcChainId and dstChainId
  useEffect(() => {
    if (supportedChains.length) {
      console.log('supportedChains:', supportedChains);
      setSourceChain(7565164);
      setDestinationChain(137);
    }
  }, [setDestinationChain, setSourceChain, supportedChains]);

  // srcTokens are loaded by setting srcChainId.
  // dstTokens are loaded by setting dstChainId.

  // Set srcChainTokenIn if srcTokens are loaded
  useEffect(() => {
    if (srcTokens) {
      console.log('srcTokens:', srcTokens);
      setSrcChainTokenIn(srcTokens['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']);
    }
  }, [setSrcChainTokenIn, srcTokens]);

  // Set dstChainTokenOut if dstTokens are loaded
  useEffect(() => {
    if (dstTokens) {
      console.log('dstTokens:', dstTokens);
      setDstChainTokenOut(dstTokens['0x0000000000000000000000000000000000000000']);
    }
  }, [dstTokens, setDstChainTokenOut]);

  // Set an amount in user friendly format. The token amount will be calculated automatically
  useEffect(() => {
    if (srcChainTokenIn) {
      setAmountIn('100');
    }
  }, [setAmountIn, srcChainTokenIn]);

  return (
    <div className="pt-6">
      <div className="debridge-wrapper">
        <div className="form-label">FROM</div>
        <div className="well mb-0">
          <div className="two-column-form-layout col40x60 mb-0">
            <div className="left">
              <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                <Select
                  className={`auto-height`}
                  value={sourceChain}
                  style={{ width: '100%', maxWidth: 'none' }}
                  popupClassName="chain-select-dropdown"
                  onChange={onSrcChainSelected}
                  bordered={false}
                  showArrow={true}
                  dropdownRender={menu => <div>{menu}</div>}
                >
                  {SUPPORTED_CHAINS.map(item => (
                    <Option key={`source-${item.chainId}`} value={item.chainId}>
                      <div
                        className={`transaction-list-row ${item.chainId === destinationChain && 'no-pointer disabled'}`}
                      >
                        <div className="icon-cell">
                          {item.chainIcon ? (
                            <img alt={`${item.chainName}`} width={30} height={30} src={item.chainIcon} />
                          ) : (
                            <Identicon address={item.chainName} style={{ width: '30', display: 'inline-flex' }} />
                          )}
                        </div>
                        <div className="description-cell">{item.chainName}</div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="well-divider">&nbsp;</div>
            <div className="right pl-3">
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on simplelink">
                    {srcChainTokenIn ? (
                      <TokenDisplay
                        onClick={() => showTokenSelector('source')}
                        mintAddress={srcChainTokenIn.address}
                        name={srcChainTokenIn.name}
                        showCaretDown={true}
                        fullTokenInfo={srcChainTokenIn}
                      />
                    ) : null}
                    {/* MAX CTA */}
                    {srcChainTokenIn ? (
                      <div
                        className="token-max simplelink"
                        onClick={() => {
                          if (srcChainTokenIn.address === NATIVE_SOL.address) {
                            const amount = getMaxAmount();
                            setAmountIn(cutNumber(amount > 0 ? amount : 0, srcChainTokenIn.decimals));
                          } else {
                            setAmountIn(toUiAmount(tokenBalanceBn, srcChainTokenIn.decimals));
                          }
                        }}
                      >
                        MAX
                      </div>
                    ) : null}
                  </span>
                </div>
                <div className="right">
                  <input
                    className="general-text-input text-right"
                    inputMode="decimal"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    onChange={onAmountInChange}
                    pattern="^[0-9]*[.,]?[0-9]*$"
                    placeholder="0.0"
                    minLength={1}
                    maxLength={79}
                    spellCheck="false"
                    value={amountIn}
                  />
                </div>
              </div>
              <div className="flex-fixed-right">
                <div className="left inner-label">
                  <span>{t('transactions.send-amount.label-right')}:</span>
                  <span>
                    {`${
                      tokenBalance && srcChainTokenIn
                        ? getAmountWithSymbol(tokenBalance, srcChainTokenIn.address, true)
                        : '0'
                    }`}
                  </span>
                </div>
                <div className="right inner-label">
                  {publicKey ? (
                    <span
                      className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                      onClick={() => refreshPrices()}
                    >
                      ~{amountIn ? toUsCurrency(getSrcTokenPrice()) : '$0.00'}
                    </span>
                  ) : (
                    <span>~$0.00</span>
                  )}
                </div>
              </div>
              {nativeBalance < MIN_SOL_BALANCE_REQUIRED && (
                <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>Source chain ID: {sourceChain}</div>
      <div>Destination chain ID: {destinationChain}</div>
      <div>Source chain tokens: {srcTokens ? Object.keys(srcTokens).length : '-'}</div>
      <div>Destination chain tokens: {dstTokens ? Object.keys(dstTokens).length : '-'}</div>
      {srcChainTokenIn ? (
        <div>
          Selected In token: {srcChainTokenIn.name} | {srcChainTokenIn.address}
        </div>
      ) : null}
      <div>
        Amount in:{amountIn} | Token amount in: {srcChainTokenInAmount}
      </div>
      {dstChainTokenOut ? (
        <div>
          Selected Out token: {dstChainTokenOut.name} | {dstChainTokenOut.address}
        </div>
      ) : null}

      {/* Token selection modal */}
      {isTokenSelectorModalVisible ? (
        <Modal
          className="mean-modal unpadded-content"
          open={isTokenSelectorModalVisible}
          title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
          onCancel={closeTokenSelector}
          width={420}
          footer={null}
        >
          <TokenSelector
            tokens={selectedTokenSet === 'source' ? srcTokens : dstTokens}
            selectedToken={selectedTokenSet === 'source' ? srcChainTokenIn?.address : dstChainTokenOut?.address}
            onClose={closeTokenSelector}
            onTokenSelected={setSelectedToken}
          />
        </Modal>
      ) : null}
    </div>
  );
};

export default DlnBridgeUi;
