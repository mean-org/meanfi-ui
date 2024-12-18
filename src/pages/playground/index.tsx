import { ArrowRightOutlined, WarningFilled } from '@ant-design/icons';
import type { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import type { Stream, StreamEventData } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import {
  type AccountInfo,
  LAMPORTS_PER_SOL,
  type ParsedAccountData,
  PublicKey
} from '@solana/web3.js';
import { Button, Divider, Modal, Space, Tooltip } from 'antd';
import notification from 'antd/lib/notification';
import type { IconType } from 'antd/lib/notification/interface';
import BigNumber from 'bignumber.js';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactJson from 'react-json-view';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  IconCodeBlock,
  IconCoin,
  IconCopy,
  IconExternalLink,
  IconEyeOn,
  IconLoading,
  IconTrash,
  IconWallet,
} from 'src/Icons';
import { CUSTOM_TOKEN_NAME, MAX_TOKEN_LIST_ITEMS, MULTISIG_ROUTE_BASE_PATH } from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { AddressDisplay } from 'src/components/AddressDisplay';
import { CopyExtLinkGroup } from 'src/components/CopyExtLinkGroup';
import { MultisigOwnersView } from 'src/components/MultisigOwnersView';
import { openNotification } from 'src/components/Notifications';
import { PreFooter } from 'src/components/PreFooter';
import { TextInput } from 'src/components/TextInput';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { TokenListItem } from 'src/components/TokenListItem';
import { AppStateContext } from 'src/contexts/appstate';
import { getNetworkIdByEnvironment, useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { useWalletAccount } from 'src/contexts/walletAccount';
import { environment } from 'src/environments/environment';
import useWindowSize from 'src/hooks/useWindowResize';
import { getDecimalsFromAccountInfo, isSystemOwnedAccount } from 'src/middleware/accountInfoGetters';
import { SOL_MINT, SYSTEM_PROGRAM_ID } from 'src/middleware/ids';
import { getReadableStream } from 'src/middleware/token-streaming-utils/get-readable-stream';
import { getStreamForDebug } from 'src/middleware/token-streaming-utils/get-stream-for-debug';
import { getStreamAssociatedMint } from 'src/middleware/token-streaming-utils/getStreamAssociatedMint';
import {
  consoleOut,
  delay,
  friendlyDisplayDecimalPlaces,
  isValidAddress,
  kFormatter,
  toUsCurrency,
} from 'src/middleware/ui';
import {
  formatAmount,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTokenOrCustomToken,
  shortenAddress,
  toUiAmount,
} from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { AccountContext } from 'src/models/accounts/AccountContext';
import { type MultisigAsset, NATIVE_LOADER } from 'src/models/multisig';
import { useGetTokensWithBalances } from 'src/query-hooks/accountTokens';
import { useGetMultisigAccounts } from 'src/query-hooks/multisigAccounts/index.ts';
import useMultisigVaults from 'src/query-hooks/multisigVaults';
import useStreamingClient from 'src/query-hooks/streamingClient';
import type { LooseObject } from 'src/types/LooseObject';
import { VestingContractStreamDetailModal } from '../vesting/components/VestingContractStreamDetailModal';
import './style.scss';

type TabOption = 'first-tab' | 'test-stream' | 'account-info' | 'multisig-tab' | 'misc-tab' | undefined;
type StreamViewerOption = 'treasurer' | 'beneficiary';
const notificationKey = 'updatable';

const CRYPTO_VALUES: number[] = [
  0.0004, 0.000003, 0.00000012345678, 1200.5, 1500.000009, 100500.000009226, 7131060.641513,
];

const NUMBER_OF_ITEMS: number[] = [0, 1, 99, 157, 679, 1000, 1300, 1550, 99600, 154350, 600000, 1200000];

export const PlaygroundView = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const { selectedAccount, setSelectedAccount } = useWalletAccount();
  const [searchParams, setSearchParams] = useSearchParams();
  const { priceList, splTokenList, isWhitelisted, getTokenPriceByAddress, getTokenByMintAddress } =
    useContext(AppStateContext);
  const { width } = useWindowSize();
  const [userBalances, setUserBalances] = useState<LooseObject>();
  const [currentTab, setCurrentTab] = useState<TabOption>(undefined);
  const [parsedAccountInfo, setParsedAccountInfo] = useState<AccountInfo<ParsedAccountData> | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo<Buffer> | null>(null);
  const [accountNotFound, setAccountNotFound] = useState<string>('');
  const [tokenFilter, setTokenFilter] = useState('');
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [streamId, setStreamId] = useState<string>('');
  const [streamRawData, setStreamRawData] = useState<StreamEventData>();
  const [streamParsedData, setStreamParsedData] = useState<Stream | undefined>(undefined);
  const [displayStreamData, setDisplayStreamData] = useState<boolean>(false);
  const [targetAddress, setTargetAddress] = useState<string>('');
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  // Multisig
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [assetsAmout, setAssetsAmount] = useState<string>();
  const [multisigAssets, setMultisigAssets] = useState<MultisigAsset[]>([]);
  const [multisigSolBalance, setMultisigSolBalance] = useState<number | undefined>(undefined);
  const [totalSafeBalance, setTotalSafeBalance] = useState<number | undefined>(undefined);
  const [streamViewerAddress, setStreamViewerAddress] = useState('');

  const { data: tokensWithBalances } = useGetTokensWithBalances(publicKey?.toBase58(), false);
  const { data: multisigAccounts } = useGetMultisigAccounts(publicKey?.toBase58());
  const { data: rawMultisigVaults, isPending: loadingAssets, isError } = useMultisigVaults(selectedMultisig?.id);

  const { tokenStreamingV2 } = useStreamingClient();

  const isSystemAccount = useCallback((account: string) => {
    const native = NATIVE_LOADER.toBase58();
    const system = SYSTEM_PROGRAM_ID.toBase58();
    return account === native || account === system;
  }, []);

  ///////////////
  //  Actions  //
  ///////////////

  const fetchStreamData = useCallback(
    (id: string) => {
      if (!id || !isValidAddress(id) || !tokenStreamingV2) {
        return;
      }

      const streamPK = new PublicKey(id);

      getStreamForDebug(streamPK, tokenStreamingV2).then(value => {
        consoleOut('raw stream data payload:', value, 'blue');
        setStreamRawData(value ?? undefined);
      });

      tokenStreamingV2.getStream(streamPK).then(value => {
        if (value) {
          consoleOut('parsed stream data payload:', value, 'blue');
          setStreamParsedData(value);
          if (value.version >= 2) {
            consoleOut('Humanized stream data:', getReadableStream(value), 'blue');
          }
        }
      });

      setDisplayStreamData(true);
    },
    [tokenStreamingV2],
  );

  const navigateToTab = useCallback(
    (tab: TabOption) => {
      setSearchParams({ option: tab as string });
    },
    [setSearchParams],
  );

  const getParsedAccountType = (acc: AccountInfo<ParsedAccountData>) => {
    if (acc.owner.equals(SYSTEM_PROGRAM_ID)) {
      return 'System Owned Account';
    }
    if (acc.executable) {
      return 'Program';
    }
    if (acc.data.program === 'spl-token') {
      return acc.data.parsed.type === 'mint' ? 'Token Mint' : 'Token Account';
    }
    return 'PDA (Program Derived Address) account';
  };

  const getAccountInfoByAddress = useCallback(
    async (address?: string) => {
      if (!targetAddress && !address) {
        return;
      }

      const scanAddress = address ?? targetAddress;
      if (!isValidAddress(scanAddress)) {
        return;
      }

      let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
      try {
        accInfo = (await connection.getParsedAccountInfo(new PublicKey(scanAddress))).value;
      } catch (error) {
        console.error(error);
      }
      if (accInfo) {
        // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
        if (!(accInfo as any).data.parsed) {
          const info = Object.assign({}, accInfo, {
            owner: accInfo.owner.toString(),
          }) as AccountInfo<Buffer>;
          consoleOut('Normal accountInfo', info, 'blue');
          setAccountInfo(accInfo as AccountInfo<Buffer>);
          setParsedAccountInfo(null);
        } else {
          const info = Object.assign({}, accInfo, {
            owner: accInfo.owner.toString(),
          }) as AccountInfo<ParsedAccountData>;
          consoleOut('Parsed accountInfo:', info, 'blue');
          setAccountInfo(null);
          setParsedAccountInfo(accInfo as AccountInfo<ParsedAccountData>);
        }
        setAccountNotFound('');
      } else {
        setAccountNotFound('Account info not available for this address');
      }
    },
    [connection, targetAddress],
  );

  const getMultisigInfo = useCallback(
    async (filter: string) => {
      if (!publicKey || !multisigAccounts || !filter) {
        return undefined;
      }

      if (!isValidAddress(filter)) {
        return;
      }

      try {
        const selectedMultisig = multisigAccounts.find(m => m.authority.toBase58() === filter);
        consoleOut('selectedMultisig:', selectedMultisig, 'green');
        if (selectedMultisig) {
          setSelectedMultisig(selectedMultisig);
        } else {
          setSelectedMultisig(undefined);
        }
      } catch (error) {
        console.error('getMultisigInfo ->', error);
      }
    },
    [multisigAccounts, publicKey],
  );

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  };

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const handleRecipientAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setTargetAddress(trimmedValue);
  };

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const handleStreamIdChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setStreamId(trimmedValue);
  };

  const handleRecipientAddressFocusInOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  };

  const onClearStreamId = () => {
    setStreamId('');
    setDisplayStreamData(false);
  };

  const onScanMyAddress = () => {
    if (publicKey) {
      setTargetAddress(publicKey.toBase58());
      getAccountInfoByAddress(publicKey.toBase58());
    }
  };

  const onScanAddress = (address: string) => {
    if (address) {
      setTargetAddress(address);
      getAccountInfoByAddress(address);
    }
  };

  const onScanAssetAddress = (asset: TokenInfo) => {
    if (asset) {
      setTargetAddress(asset.address);
      getAccountInfoByAddress(asset.address);
    }
  };

  const activateAccount = useCallback(
    (address: string, override?: boolean) => {
      if (publicKey) {
        const walletAddress = publicKey.toBase58();
        // To be impersonating there has to be an inspected address other than the selected account
        // and other than the connected wallet address

        const isExternal = address && address !== walletAddress;
        const account: AccountContext = {
          name: isExternal ? 'External account' : 'Personal account',
          address,
          isMultisig: false,
        };
        consoleOut('Setting selectedAccount onImpersonateAccount:', account, 'crimson');
        setSelectedAccount(account, override);
      }
    },
    [publicKey, setSelectedAccount],
  );

  const onClearResults = () => {
    setAccountInfo(null);
    setParsedAccountInfo(null);
    if (publicKey) {
      activateAccount(publicKey.toBase58());
    }
    setTargetAddress('');
    setSelectedMultisig(undefined);
  };

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById('token-search-otp');
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);

  const showTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(true);
    autoFocusInput();
  }, [autoFocusInput]);

  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [tokenFilter]);

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback(
    (searchString: string) => {
      if (!selectedList) {
        return;
      }

      const filter = (t: TokenInfo) => {
        return (
          t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
          t.name.toLowerCase().includes(searchString.toLowerCase()) ||
          t.address.toLowerCase().includes(searchString.toLowerCase())
        );
      };

      const showFromList = !searchString ? selectedList : selectedList.filter(t => filter(t));

      setFilteredTokenList(showFromList);
    },
    [selectedList],
  );

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  }, [updateTokenListByFilter]);

  const onTokenSearchInputChange = useCallback(
    (value: string) => {
      const newValue = value.trim();
      setTokenFilter(newValue);
      updateTokenListByFilter(newValue);
    },
    [updateTokenListByFilter],
  );

  const notificationTwo = () => {
    consoleOut('Notification is closing...');
    openNotification({
      type: 'info',
      description: t('treasuries.create-treasury.multisig-treasury-created-instructions'),
      duration: null,
    });
    navigate('/custody');
  };

  const sequentialMessagesAndNavigate = () => {
    openNotification({
      type: 'info',
      description: t('treasuries.create-treasury.multisig-treasury-created-info'),
      handleClose: notificationTwo,
    });
  };

  const stackedMessagesAndNavigate = async () => {
    openNotification({
      type: 'info',
      description: t('treasuries.create-treasury.multisig-treasury-created-info'),
      duration: 10,
    });
    await delay(1500);
    openNotification({
      type: 'info',
      description: t('treasuries.create-treasury.multisig-treasury-created-instructions'),
      duration: null,
    });
    navigate('/custody');
  };

  const reuseNotification = (key?: string) => {
    openNotification({
      key,
      type: 'info',
      title: 'Mission assigned',
      duration: 0,
      description: <span>Your objective is to wait for 5 seconds</span>,
    });
    setTimeout(() => {
      openNotification({
        key,
        type: 'success',
        title: 'Mission updated',
        duration: 3,
        description: <span>Objective completed!</span>,
      });
    }, 5000);
  };

  const showNotificationByType = (type: IconType, hasCta = false) => {
    if (!hasCta) {
      openNotification({
        type,
        title: 'Notification Title',
        duration: 0,
        description: (
          <span>
            Lorem, ipsum dolor sit amet consectetur adipisicing elit. Natus, ullam perspiciatis accusamus, sunt ipsum
            asperiores similique cupiditate autem veniam explicabo earum voluptates!
          </span>
        ),
      });
      return;
    }
    openNotification({
      type,
      title: 'Notification Title',
      duration: 0,
      description: (
        <>
          <div className='mb-1'>This notification is meant to have an additional CTA to perform another action!</div>
          <Button
            type='primary'
            size='small'
            shape='round'
            className='extra-small'
            onClick={() => {
              const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
              navigate(url);
            }}
          >
            See proposals
          </Button>
        </>
      ),
    });
  };

  const interestingCase = () => {
    openNotification({
      type: 'info',
      description: t('treasuries.create-treasury.multisig-treasury-created-info'),
      duration: 0,
    });
  };

  const getPricePerToken = useCallback(
    (token: TokenInfo): number => {
      if (!token || !priceList) {
        return 0;
      }
      const price = getTokenPriceByAddress(token.address, token.symbol);

      return price || 0;
    },
    [getTokenPriceByAddress, priceList],
  );

  const solToken = useMemo(() => {
    if (!selectedMultisig) {
      return null;
    }

    return {
      address: selectedMultisig.id,
      amount: multisigSolBalance ? new BN(multisigSolBalance) : new BN(0),
      closeAuthority: undefined,
      closeAuthorityOption: 0,
      decimals: 9,
      delegate: undefined,
      delegateOption: 0,
      delegatedAmount: 0,
      isNative: true,
      isNativeOption: 0,
      mint: SOL_MINT,
      owner: selectedMultisig.authority,
      state: 1,
    } as MultisigAsset;
  }, [selectedMultisig, multisigSolBalance]);

  // Stream detail modal
  const [isStreamDetailModalVisible, setIsStreamDetailModalVisibility] = useState(false);
  const showStreamDetailModal = useCallback(
    (option: StreamViewerOption) => {
      if (streamParsedData) {
        if (option === 'treasurer') {
          setStreamViewerAddress(streamParsedData.psAccountOwner.toBase58());
        } else {
          setStreamViewerAddress(streamParsedData.beneficiary.toBase58());
        }
        setIsStreamDetailModalVisibility(true);
      }
    },
    [streamParsedData],
  );
  const closeStreamDetailModal = useCallback(() => {
    setIsStreamDetailModalVisibility(false);
  }, []);

  /////////////////////
  // Data management //
  /////////////////////

  // Process routes
  useEffect(() => {
    let optionInQuery: string | null = null;
    // Get the option if passed-in
    if (searchParams) {
      optionInQuery = searchParams.get('option');
      consoleOut('searchParams:', searchParams.toString(), 'crimson');
      consoleOut('option:', searchParams.get('option'), 'crimson');
    }
    // Pre-select an option
    switch (optionInQuery as TabOption) {
      case 'first-tab':
        setCurrentTab('first-tab');
        break;
      case 'test-stream':
        setCurrentTab('test-stream');
        break;
      case 'account-info':
        setCurrentTab('account-info');
        break;
      case 'multisig-tab':
        setCurrentTab('multisig-tab');
        break;
      case 'misc-tab':
        setCurrentTab('misc-tab');
        break;
      default:
        setCurrentTab('first-tab');
        setSearchParams({ option: 'first-tab' }, { replace: true });
        break;
    }
  }, [searchParams, setSearchParams]);

  //#region Token selector - data management

  // Automatically update all token balances and rebuild token list
  useEffect(() => {
    if (!tokensWithBalances) {
      return;
    }

    setSelectedList(tokensWithBalances.tokenList);
    setUserBalances(tokensWithBalances.balancesMap);
    if (!selectedToken) {
      setSelectedToken(tokensWithBalances.tokenList[0]);
    }
  }, [tokensWithBalances, selectedToken]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (splTokenList?.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [splTokenList, tokenFilter, filteredTokenList, updateTokenListByFilter]);

  //#endregion

  // Get multisig SOL balance
  useEffect(() => {
    if (!connection || !selectedMultisig) {
      return;
    }

    connection.getBalance(selectedMultisig.authority).then(balance => {
      consoleOut('multisigSolBalance', balance, 'orange');
      setMultisigSolBalance(balance);
    });
  }, [connection, selectedMultisig]);

  // Get Multisig assets
  useEffect(() => {
    if (!selectedMultisig || loadingAssets) {
      return;
    }

    const modifiedResults = new Array<MultisigAsset>();
    if (solToken) {
      modifiedResults.push(solToken);
    }

    if (isError) {
      console.error('Error getting multisig vaults');
      setMultisigAssets(modifiedResults);
      return;
    }

    if (!rawMultisigVaults) {
      setMultisigAssets(modifiedResults);
      return;
    }

    for (const item of rawMultisigVaults) {
      modifiedResults.push(item);
    }

    setMultisigAssets(modifiedResults);
    consoleOut('Multisig assets', modifiedResults, 'blue');
  }, [loadingAssets, rawMultisigVaults, selectedMultisig, solToken, isError]);

  // Show amount of assets
  useEffect(() => {
    if (selectedMultisig && multisigAssets && multisigAssets.length > 0) {
      if (multisigAssets.length > 0) {
        setAssetsAmount(`(${multisigAssets.length} assets)`);
      } else {
        setAssetsAmount(`(${multisigAssets.length} asset)`);
      }
    } else {
      setAssetsAmount('(0 assets)');
    }
  }, [multisigAssets, selectedMultisig]);

  // Calculates safe total USD balance
  useEffect(() => {
    if (!connection || !publicKey || !selectedMultisig || !multisigAssets) {
      setTotalSafeBalance(0);
      return;
    }

    let usdValue = 0;
    const solPrice = getPricePerToken(NATIVE_SOL);
    const solBalance = getAmountFromLamports(selectedMultisig.balance);
    const nativeSolUsdValue = solBalance * solPrice;

    for (const asset of multisigAssets) {
      const token = getTokenByMintAddress(asset.mint.toBase58());

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address, token.symbol);
        if (!tokenPrice) {
          continue;
        }
        BigNumber.config({
          CRYPTO: true,
          DECIMAL_PLACES: 16,
        });
        const tokenBalance = toUiAmount(asset.amount, token.decimals);
        const assetValue = new BigNumber(tokenBalance).multipliedBy(tokenPrice);
        usdValue += assetValue.toNumber();
      }
    }

    usdValue += nativeSolUsdValue;
    setTotalSafeBalance(usdValue);
  }, [
    connection,
    getPricePerToken,
    getTokenByMintAddress,
    getTokenPriceByAddress,
    multisigAssets,
    publicKey,
    selectedMultisig,
  ]);

  // Set selected token to the stream associated token as soon as the stream is available or changes
  useEffect(() => {
    if (!publicKey || !streamParsedData) {
      return;
    }

    const associatedToken = getStreamAssociatedMint(streamParsedData);

    if (associatedToken && (!selectedToken || selectedToken.address !== associatedToken)) {
      getTokenOrCustomToken(connection, associatedToken, getTokenByMintAddress).then(token => {
        consoleOut('getTokenOrCustomToken (PlaygroundView) ->', token, 'blue');
        setSelectedToken(token);
      });
    }
  }, [connection, getTokenByMintAddress, publicKey, selectedToken, streamParsedData]);

  ////////////////////////
  // Getters and events //
  ////////////////////////

  const isProgram = useMemo(() => {
    return !!(
      parsedAccountInfo &&
      parsedAccountInfo.data.program === 'bpf-upgradeable-loader' &&
      parsedAccountInfo.data.parsed.type === 'program'
    );
  }, [parsedAccountInfo]);

  const isProgramData = useMemo(() => {
    return !!(
      parsedAccountInfo &&
      parsedAccountInfo.data.program === 'bpf-upgradeable-loader' &&
      parsedAccountInfo.data.parsed.type === 'programData'
    );
  }, [parsedAccountInfo]);

  const isTokenAccount = useMemo(() => {
    return !!(
      parsedAccountInfo &&
      parsedAccountInfo.data.program === 'spl-token' &&
      parsedAccountInfo.data.parsed.type === 'account'
    );
  }, [parsedAccountInfo]);

  const isTokenMint = useMemo(() => {
    return !!(
      parsedAccountInfo &&
      parsedAccountInfo.data.program === 'spl-token' &&
      parsedAccountInfo.data.parsed.type === 'mint'
    );
  }, [parsedAccountInfo]);

  const selectedTokenDecimals = useMemo(() => {
    if (parsedAccountInfo) {
      if (isTokenMint) {
        return parsedAccountInfo.data.parsed.info.decimals || 0;
      }
      if (isTokenAccount) {
        return parsedAccountInfo.data.parsed.info.tokenAmount.decimals || 0;
      }
      return 0;
    }
    return 0;
  }, [parsedAccountInfo, isTokenMint, isTokenAccount]);

  const getImpersonationStatus = useCallback(async () => {
    if (!publicKey) {
      return false;
    }

    const walletAddress = publicKey.toBase58();
    if (walletAddress === selectedAccount.address) {
      return false;
    }

    let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
    let isSystemAccount = false;

    try {
      accInfo = (await connection.getParsedAccountInfo(new PublicKey(selectedAccount.address))).value;
      if (accInfo) {
        isSystemAccount = isSystemOwnedAccount(accInfo);
      } else {
        return false;
      }
    } catch (error) {
      console.error(error);
      return false;
    }

    return isSystemAccount && selectedAccount.address !== walletAddress;
  }, [connection, publicKey, selectedAccount.address]);

  const startImpersonation = useCallback(() => {
    if (!publicKey) {
      return;
    }
    const walletAddress = publicKey.toBase58();

    if (isImpersonating) {
      activateAccount(walletAddress);
    } else {
      activateAccount(targetAddress, true);
    }
  }, [activateAccount, isImpersonating, publicKey, targetAddress]);

  const stopImpersonation = useCallback(() => {
    if (!publicKey) {
      return;
    }

    const walletAddress = publicKey.toBase58();
    activateAccount(walletAddress);
  }, [activateAccount, publicKey]);

  useEffect(() => {
    getImpersonationStatus().then(value => setIsImpersonating(value));
  }, [getImpersonationStatus]);

  ///////////////
  // Rendering //
  ///////////////

  const renderTable = () => {
    return CRYPTO_VALUES.map((value: number) => {
      return (
        <div className='item-list-row' key={`value-${value}`}>
          <div className='std-table-cell responsive-cell text-monospace text-right px-1'>
            {selectedToken ? `${formatThousands(value, selectedToken.decimals)} ${selectedToken.symbol}` : ''}
          </div>
          <div className='std-table-cell responsive-cell text-monospace text-right px-1'>
            {selectedToken
              ? `${formatThousands(value, friendlyDisplayDecimalPlaces(value, selectedToken.decimals))} ${
                  selectedToken.symbol
                }`
              : ''}
          </div>
          <div className='std-table-cell responsive-cell text-monospace text-right px-1'>
            {selectedToken
              ? getAmountWithSymbol(value, selectedToken.address, false, splTokenList, selectedToken.decimals)
              : ''}
          </div>
        </div>
      );
    });
  };

  const renderKformatters = () => {
    return NUMBER_OF_ITEMS.map((value: number) => {
      return (
        <div className='item-list-row' key={`value-${value}`}>
          <div className='std-table-cell responsive-cell text-monospace'>
            <span className='font-size-75 font-bold text-shadow'>{formatThousands(value) || 0}</span>
          </div>
          <div className='std-table-cell responsive-cell text-monospace'>
            <div className='table-cell-flex-content'>
              <div className='icon-cell'>
                <div className='token-icon'>
                  <div className='streams-count'>
                    <span className='font-size-75 font-bold text-shadow'>{formatAmount(value, 0, true) || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className='std-table-cell responsive-cell text-monospace'>
            <div className='table-cell-flex-content'>
              <div className='icon-cell'>
                <div className='token-icon'>
                  <div className='streams-count'>
                    <span className='font-size-75 font-bold text-shadow'>{kFormatter(value, 1) || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  const renderDemoNumberFormatting = (
    <>
      <div className='flex-fixed-right'>
        <div className='left'>
          <div className='tabset-heading'>Number Formatting</div>
        </div>
        <div className='right'>
          <Tooltip title='Pick one of my assets' trigger='hover'>
            <span className='flat-button change-button' onKeyDown={showTokenSelector} onClick={showTokenSelector}>
              <IconCoin className='mean-svg-icons' />
            </span>
          </Tooltip>
        </div>
      </div>
      <div className='item-list-header'>
        <div className='header-row'>
          <div className='std-table-cell responsive-cell text-right px-1'>Format 1</div>
          <div className='std-table-cell responsive-cell text-right px-1'>Format 2</div>
          <div className='std-table-cell responsive-cell text-right px-1'>Format 3</div>
        </div>
      </div>
      <div className='item-list-body'>{renderTable()}</div>
      <div className='mb-2'>
        Format 1:&nbsp;<code>formatThousands</code>
        <br />
        Format 2:&nbsp;
        <code>formatThousands + friendlyDisplayDecimalPlaces</code>
        <br />
        Format 3:&nbsp;<code>getAmountWithSymbol</code>
      </div>

      <Divider />

      <div className='tabset-heading'>Short Number Formatting</div>
      <div className='item-list-header'>
        <div className='header-row'>
          <div className='std-table-cell responsive-cell'>raw value</div>
          <div className='std-table-cell responsive-cell'>formatAmount Fn</div>
          <div className='std-table-cell responsive-cell'>kFormatter</div>
        </div>
      </div>
      <div className='item-list-body'>{renderKformatters()}</div>
    </>
  );

  const infoRow = (caption: string, value: string) => {
    return (
      <div className='flex-fixed-right'>
        <div className='left'>
          <span className='font-size-75'>{caption}</span>
        </div>
        <div className='right flex-row align-items-center'>
          {isValidAddress(value) ? (
            <>
              {!isSystemAccount(value) ? (
                <span
                  className='flat-button tiny mr-1'
                  onKeyDown={() => onScanAddress(value)}
                  onClick={() => onScanAddress(value)}
                >
                  <IconEyeOn className='mean-svg-icons m-0' />
                </span>
              ) : null}
              <code>
                <AddressDisplay address={value} showFullAddress={true} />
              </code>
            </>
          ) : (
            <code>{value}</code>
          )}
        </div>
      </div>
    );
  };

  const renderTestStream = () => {
    return (
      <>
        <div className='flex-fixed-right mt-4'>
          <div className='left'>
            <div className='form-label'>Inspect stream</div>
          </div>
          <div className='right'>
            <span
              className={`simplelink ${streamParsedData ? 'underline-on-hover' : 'disabled'}`}
              onKeyDown={() => showStreamDetailModal('treasurer')}
              onClick={() => showStreamDetailModal('treasurer')}
            >
              View as treasurer
            </span>
            <span className='mx-2'>|</span>
            <span
              className={`simplelink ${streamParsedData ? 'underline-on-hover' : 'disabled'}`}
              onKeyDown={() => showStreamDetailModal('beneficiary')}
              onClick={() => showStreamDetailModal('beneficiary')}
            >
              View as beneficiary
            </span>
          </div>
        </div>

        <div className='two-column-form-layout col70x30'>
          <div className='left'>
            <div className='well'>
              <div className='flex-fixed-right'>
                <div className='left position-relative'>
                  <span className='recipient-field-wrapper'>
                    <input
                      id='stream-id-for-playground'
                      className='general-text-input'
                      autoComplete='on'
                      autoCorrect='off'
                      type='text'
                      onChange={handleStreamIdChange}
                      placeholder='Introduce stream id (required)'
                      required={true}
                      spellCheck='false'
                      value={streamId}
                    />
                  </span>
                </div>
                <div className='right'>
                  <span>&nbsp;</span>
                </div>
              </div>
              {streamId && !isValidAddress(streamId) && <span className='form-field-error'>Not a valid stream id</span>}
              {streamId && accountNotFound && (
                <span className='form-field-error'>Account info is not available for this stream id</span>
              )}
            </div>
          </div>
          <div className='right'>
            <div className='flex-fixed-right'>
              <div className='left'>
                <Button
                  block
                  type='primary'
                  shape='round'
                  size='large'
                  disabled={!streamId || !isValidAddress(streamId)}
                  onClick={() => fetchStreamData(streamId)}
                >
                  Get info
                </Button>
              </div>
              <div className='right'>
                <Button
                  type='primary'
                  shape='round'
                  size='large'
                  className='thin-stroke'
                  disabled={streamId === ''}
                  onClick={onClearStreamId}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        {streamId && isValidAddress(streamId) && displayStreamData && (
          <div className='mb-3'>
            <div className='two-column-layout'>
              <div className='left'>
                <div className='form-label'>On-chain stream account data</div>
                <div className='well mb-1 panel-max-height vertical-scroll'>
                  {streamRawData ? <ReactJson src={streamRawData} theme={'ocean'} collapsed={1} /> : '--'}
                </div>
              </div>
              <div className='right'>
                <div className='form-label'>MSP SDK parsed stream data</div>
                <div className='well mb-1 panel-max-height vertical-scroll'>
                  {streamParsedData ? <ReactJson src={streamParsedData} theme={'ocean'} collapsed={1} /> : '--'}
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  const renderCurrentSupply = () => {
    if (parsedAccountInfo && isTokenMint) {
      return infoRow(
        'Current Supply:',
        getAmountWithSymbol(
          toUiAmount(parsedAccountInfo.data.parsed.info.supply, selectedTokenDecimals),
          parsedAccountInfo.data.parsed.info.mint,
          true,
          splTokenList,
          selectedTokenDecimals,
        ),
      );
    }

    return '';
  };

  const renderCurrentBalance = () => {
    if (parsedAccountInfo && isTokenAccount) {
      return infoRow(
        'Token Balance',
        formatThousands(
          parsedAccountInfo.data.parsed.info.tokenAmount.uiAmount,
          selectedTokenDecimals,
          selectedTokenDecimals,
        ),
      );
    }

    return '';
  };

  const renderAccountInfo = () => {
    if (!accountInfo) {
      return null;
    }

    return (
      <>
        {infoRow('Entity:', 'Account')}
        {infoRow('Balance (SOL):', `◎${formatThousands(accountInfo.lamports / LAMPORTS_PER_SOL, 9, 9)}`)}
        {infoRow('Executable:', accountInfo.executable ? 'Yes' : 'No')}
        {infoRow('Allocated Data Size:', `${accountInfo.data.byteLength} byte(s)`)}
        {infoRow('Owner:', accountInfo.owner.toBase58())}
      </>
    );
  };

  const renderparsedAccountInfo = () => {
    if (!parsedAccountInfo) {
      return null;
    }

    return (
      <>
        {infoRow('Entity:', getParsedAccountType(parsedAccountInfo))}
        {isProgram &&
          infoRow('Balance (SOL):', `◎${formatThousands(parsedAccountInfo.lamports / LAMPORTS_PER_SOL, 9, 9)}`)}
        {infoRow('Executable:', parsedAccountInfo.executable ? 'Yes' : 'No')}
        {isProgramData && infoRow('Upgradeable:', parsedAccountInfo.data.parsed.info.authority ? 'Yes' : 'No')}
        {isProgramData && parsedAccountInfo.data.parsed.info.authority
          ? infoRow('Upgrade Authority:', parsedAccountInfo.data.parsed.info.authority)
          : null}
        {renderCurrentSupply()}
        {renderCurrentBalance()}
        {isTokenMint && infoRow('Mint Authority:', parsedAccountInfo.data.parsed.info.mintAuthority)}
        {isTokenAccount && infoRow('Mint:', parsedAccountInfo.data.parsed.info.mint)}
        {(isTokenMint || isTokenAccount) && infoRow('Decimals:', selectedTokenDecimals)}
        {infoRow('Allocated Data Size:', `${parsedAccountInfo.data.space} byte(s)`)}
        {isProgram && infoRow('Owner:', parsedAccountInfo.owner.toBase58())}
        {isTokenMint && infoRow('Owner:', parsedAccountInfo.owner.toBase58())}
        {isTokenAccount && infoRow('Owner:', parsedAccountInfo.data.parsed.info.owner)}
        {targetAddress && (isTokenAccount || isTokenMint) && (
          <>
            <Divider orientation='left' className='mt-1 mb-1'>
              Preview
            </Divider>
            <TokenDisplay
              className='px-2 pb-2'
              mintAddress={isTokenMint ? targetAddress : parsedAccountInfo.data.parsed.info.mint}
              onClick={undefined}
              showName={true}
            />
          </>
        )}
        {isProgram && infoRow('Program Data:', parsedAccountInfo.data.parsed.info.programData)}
      </>
    );
  };

  const renderAccountInfoResults = () => {
    if (targetAddress && (accountInfo || parsedAccountInfo)) {
      return (
        <div className='well-group text-monospace mb-3'>
          {accountInfo && renderAccountInfo()}
          {parsedAccountInfo && renderparsedAccountInfo()}
        </div>
      );
    }

    return null;
  };

  const renderDemo2Tab = () => {
    return (
      <>
        <div className='tabset-heading'>Get account info</div>
        <div className='flex-fixed-right'>
          <div className='left'>
            <div className='form-label'>Inspect account</div>
          </div>
          <div className='right'>
            {publicKey ? (
              <>
                <Tooltip title='Inspect my wallet address' trigger='hover'>
                  <span className='flat-button change-button' onKeyDown={onScanMyAddress} onClick={onScanMyAddress}>
                    <IconWallet className='mean-svg-icons' />
                  </span>
                </Tooltip>
                <Tooltip title='Pick one of my assets' trigger='hover'>
                  <span className='flat-button change-button' onKeyDown={showTokenSelector} onClick={showTokenSelector}>
                    <IconCoin className='mean-svg-icons' />
                  </span>
                </Tooltip>
              </>
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
        </div>

        <div className='two-column-form-layout col70x30 mb-2'>
          <div className='left'>
            <div className='well'>
              <div className='flex-fixed-right'>
                <div className='left position-relative'>
                  <span className='recipient-field-wrapper'>
                    <input
                      id='payment-recipient-field'
                      className='general-text-input'
                      autoComplete='on'
                      autoCorrect='off'
                      type='text'
                      onFocus={handleRecipientAddressFocusInOut}
                      onChange={handleRecipientAddressChange}
                      onBlur={handleRecipientAddressFocusInOut}
                      placeholder={t('transactions.recipient.placeholder')}
                      required={true}
                      spellCheck='false'
                      value={targetAddress}
                    />
                    <span
                      id='payment-recipient-static-field'
                      className={`${targetAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}
                    >
                      {targetAddress || t('transactions.recipient.placeholder')}
                    </span>
                  </span>
                </div>
                <div className='right'>
                  <span>&nbsp;</span>
                </div>
              </div>
              {targetAddress && !isValidAddress(targetAddress) && (
                <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
              )}
              {targetAddress && accountNotFound && <span className='form-field-error'>{accountNotFound}</span>}
            </div>
          </div>
          <div className='right'>
            <div className='flex-fixed-right'>
              <div className='left'>
                <Button block type='primary' shape='round' size='large' onClick={() => getAccountInfoByAddress()}>
                  Get Account Info
                </Button>
              </div>
              <div className='right'>
                <Button type='primary' shape='round' size='large' className='thin-stroke' onClick={onClearResults}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        {renderAccountInfoResults()}
        <Divider />

        <div className='tabset-heading'>User impersonation</div>
        {publicKey ? (
          <Space size='middle' direction='vertical' wrap={true}>
            {isImpersonating ? (
              <Button type='primary' shape='round' size='large' className='thin-stroke' onClick={stopImpersonation}>
                Stop impersonation
              </Button>
            ) : null}
            {!isImpersonating ? (
              <Button
                type='default'
                shape='round'
                size='large'
                onClick={startImpersonation}
                disabled={!targetAddress || !accountInfo || !isSystemOwnedAccount(accountInfo)}
              >
                Start impersonation
              </Button>
            ) : null}
            <p>Impersonation is only available for system owned accounts.</p>
            <p>
              To start impersonation input a wallet address in the Get Account Info field and click Get Account Info.
              Once the info confirms the account is system owned you can start impersonation.
            </p>
          </Space>
        ) : (
          <span>No connection, please connect wallet.</span>
        )}
      </>
    );
  };

  const renderSafeName = useCallback(() => {
    if (!selectedMultisig) {
      return '--';
    }
    const selectedLabelName = selectedMultisig.label || shortenAddress(selectedMultisig.id);
    return <div>{selectedLabelName}</div>;
  }, [selectedMultisig]);

  const renderSecurity = useCallback(() => {
    return (
      <>
        <span>Security</span>
        <MultisigOwnersView
          label='view'
          className='ml-1'
          participants={selectedMultisig ? selectedMultisig.owners : []}
        />
      </>
    );
  }, [selectedMultisig]);

  const renderSafeBalance = useCallback(() => {
    return totalSafeBalance === undefined ? (
      <>
        <IconLoading className='mean-svg-icons' style={{ height: '15px', lineHeight: '15px' }} />
      </>
    ) : (
      toUsCurrency(totalSafeBalance)
    );
  }, [totalSafeBalance]);

  // Deposit Address
  const renderAccountAddress = useCallback((account: PublicKey) => {
    return <CopyExtLinkGroup content={account.toBase58()} number={4} externalLink={true} />;
  }, []);

  const infoSafeData = useMemo(
    () => [
      {
        name: 'Safe name',
        value: renderSafeName(),
      },
      {
        name: renderSecurity(),
        value: selectedMultisig ? `${selectedMultisig.threshold}/${selectedMultisig.owners.length} signatures` : '--',
      },
      {
        name: `Safe balance ${assetsAmout}`,
        value: renderSafeBalance(),
      },
      {
        name: 'Deposit address',
        value: selectedMultisig ? renderAccountAddress(selectedMultisig.authority) : '-',
      },
      {
        name: 'Multisig SOL balance',
        value: multisigSolBalance ? formatThousands(multisigSolBalance / LAMPORTS_PER_SOL, 9, 9) : 0,
      },
      {
        name: 'Multisig account address',
        value: selectedMultisig ? renderAccountAddress(selectedMultisig.id) : '-',
      },
    ],
    [
      assetsAmout,
      multisigSolBalance,
      renderAccountAddress,
      renderSafeBalance,
      renderSafeName,
      renderSecurity,
      selectedMultisig,
    ],
  );

  const renderMultisigTab = () => {
    return (
      <>
        <div className='tabset-heading'>Get multisig info</div>

        <div className='flex-fixed-right'>
          <div className='left'>
            <div className='form-label'>Inspect account</div>
          </div>
          <div className='right'>&nbsp;</div>
        </div>

        <div className='two-column-form-layout col70x30 mb-2'>
          <div className='left'>
            <div className='well'>
              <div className='flex-fixed-right'>
                <div className='left position-relative'>
                  <span className='recipient-field-wrapper'>
                    <input
                      id='payment-recipient-field'
                      className='general-text-input'
                      autoComplete='on'
                      autoCorrect='off'
                      type='text'
                      onFocus={handleRecipientAddressFocusInOut}
                      onChange={handleRecipientAddressChange}
                      onBlur={handleRecipientAddressFocusInOut}
                      placeholder={t('transactions.recipient.placeholder')}
                      required={true}
                      spellCheck='false'
                      value={targetAddress}
                    />
                    <span
                      id='payment-recipient-static-field'
                      className={`${targetAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}
                    >
                      {targetAddress || t('transactions.recipient.placeholder')}
                    </span>
                  </span>
                </div>
                <div className='right'>
                  <span>&nbsp;</span>
                </div>
              </div>
              {targetAddress && !isValidAddress(targetAddress) && (
                <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
              )}
              {targetAddress && selectedMultisig === undefined && (
                <span className='form-field-error'>{accountNotFound}</span>
              )}
            </div>
          </div>
          <div className='right'>
            <div className='flex-fixed-right'>
              <div className='left'>
                <Button block type='primary' shape='round' size='large' onClick={() => getMultisigInfo(targetAddress)}>
                  Get multisig
                </Button>
              </div>
              <div className='right'>
                <Button type='primary' shape='round' size='large' className='thin-stroke' onClick={onClearResults}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className='mb-3'>
          {targetAddress && selectedMultisig && (
            <>
              <div className='well-group text-monospace flex-row two-column-form-layout flex-wrap'>
                {infoSafeData.map((info, index: number) => {
                  const isEven = index % 2 === 0;
                  return (
                    <div key={`${info.name}`} className={isEven ? 'left' : 'right'}>
                      <div className='info-label'>{info.name}</div>
                      <div className='info-value mb-2 line-height-100'>{info.value}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  const renderRouteLink = (title: string, linkAddress: string) => {
    return (
      <>
        <div className='well small mb-2'>
          <div className='flex-fixed-right'>
            <div className='left position-relative'>
              <span className='recipient-field-wrapper'>
                <span className='referral-link font-size-75 text-monospace'>{linkAddress}</span>
              </span>
            </div>
            <div className='right'>
              <Link to={linkAddress} title={title}>
                <div className='add-on simplelink'>
                  <ArrowRightOutlined />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  };

  const handleNotifWithUiInteraction = useCallback(() => {
    const showcaseNewAccount = () => {
      let element: HTMLElement | null = null;

      if (width < 1200) {
        element = document.querySelector('footer .account-selector-max-width');
      } else {
        element = document.querySelector('header .account-selector-max-width');
      }
      if (element) {
        element.click();
      } else {
        console.log(
          'could not query:',
          width < 1200 ? 'footer .account-selector-max-width' : 'header .account-selector-max-width',
          'red',
        );
      }
    };

    const onNotifySuperSafeCreated = () => {
      const btn = (
        <Button
          type='primary'
          size='small'
          shape='round'
          className='extra-small'
          onClick={() => {
            showcaseNewAccount();
            notification.destroy(notificationKey);
          }}
        >
          Show accounts
        </Button>
      );
      notification.open({
        type: 'success',
        message: 'SuperSafe account created',
        description: <div className='mb-1'>Your SuperSafe account was successfully created.</div>,
        btn,
        key: notificationKey,
        duration: null,
        placement: 'topRight',
        style: { top: 110 },
      });
    };

    onNotifySuperSafeCreated();
  }, [width]);

  const renderRoutingDemo = (
    <>
      <div className='tabset-heading'>Test routing</div>
      <div className='text-left mb-3'>
        <div className='form-label'>Go to my connected account</div>
        {renderRouteLink('With no params', '/')}
      </div>
    </>
  );

  const renderMiscTab = (
    <>
      <div className='tabset-heading'>Miscelaneous features</div>

      <h3>Theme buttons</h3>
      <div className='mb-2'>
        <h4>Extra small Primary, Secondary and Default buttons</h4>
        <div className='mb-1'>
          <Space wrap={true} size='middle'>
            <Button type='primary' shape='round' size='small' className='extra-small'>
              Primary
            </Button>
            <Button type='primary' shape='round' size='small' className='extra-small thin-stroke'>
              Secondary
            </Button>
            <Button type='default' shape='round' size='small' className='extra-small'>
              Default
            </Button>
            <Button type='primary' shape='round' size='small' disabled={true} className='extra-small'>
              Disabled
            </Button>
          </Space>
        </div>
        <h4>Small Primary, Secondary and Default buttons</h4>
        <div className='mb-1'>
          <Space wrap={true} size='middle'>
            <Button type='primary' shape='round' size='small'>
              Primary
            </Button>
            <Button type='primary' shape='round' size='small' className='thin-stroke'>
              Secondary
            </Button>
            <Button type='default' shape='round' size='small'>
              Default
            </Button>
            <Button type='primary' shape='round' size='small' disabled={true}>
              Disabled
            </Button>
          </Space>
        </div>
        <h4>Medium Primary, Secondary and Default buttons</h4>
        <div className='mb-1'>
          <Space wrap={true} size='middle'>
            <Button type='primary' shape='round' size='middle'>
              Primary
            </Button>
            <Button type='primary' shape='round' size='middle' className='thin-stroke'>
              Secondary
            </Button>
            <Button type='default' shape='round' size='middle'>
              Default
            </Button>
            <Button type='primary' shape='round' size='middle' disabled={true}>
              Disabled
            </Button>
          </Space>
        </div>
        <h4>Large Primary, Secondary and Default buttons</h4>
        <div className='mb-1'>
          <Space wrap={true} size='middle'>
            <Button type='primary' shape='round' size='large'>
              Primary
            </Button>
            <Button type='primary' shape='round' size='large' className='thin-stroke'>
              Secondary
            </Button>
            <Button type='default' shape='round' size='large'>
              Default
            </Button>
            <Button type='primary' shape='round' size='large' disabled={true}>
              Disabled
            </Button>
          </Space>
        </div>
      </div>

      <h3>Flat buttons</h3>
      <div className='mb-2'>
        <Space wrap={true} size='middle'>
          <span className='flat-button tiny'>
            <IconCopy className='mean-svg-icons' />
            <span className='ml-1'>copy item</span>
          </span>
          <span className='flat-button tiny'>
            <IconTrash className='mean-svg-icons' />
            <span className='ml-1'>delete item</span>
          </span>
          <span className='flat-button tiny'>
            <IconExternalLink className='mean-svg-icons' />
            <span className='ml-1'>view on blockchain</span>
          </span>
        </Space>
      </div>

      <h3>Flat stroked buttons</h3>
      <div className='mb-2'>
        <Space wrap={true} size='middle'>
          <span className='flat-button tiny stroked'>
            <IconCopy className='mean-svg-icons' />
            <span className='mx-1'>copy item</span>
          </span>
          <span className='flat-button tiny stroked'>
            <IconTrash className='mean-svg-icons' />
            <span className='mx-1'>delete item</span>
          </span>
          <span className='flat-button tiny stroked'>
            <IconExternalLink className='mean-svg-icons' />
            <span className='mx-1'>view on blockchain</span>
          </span>
        </Space>
      </div>

      <div className='tabset-heading'>Notify and navigate</div>
      <div className='text-left mb-3'>
        <Space wrap={true}>
          <span
            className='flat-button stroked'
            onKeyDown={() => sequentialMessagesAndNavigate()}
            onClick={() => sequentialMessagesAndNavigate()}
          >
            <span>Sequential messages → Navigate</span>
          </span>
          <span
            className='flat-button stroked'
            onKeyDown={() => stackedMessagesAndNavigate()}
            onClick={() => stackedMessagesAndNavigate()}
          >
            <span>Stacked messages → Navigate</span>
          </span>
          <span className='flat-button stroked' onKeyDown={() => interestingCase()} onClick={() => interestingCase()}>
            <span>Without title</span>
          </span>
        </Space>
      </div>

      <div className='tabset-heading'>Test Updatable Notifications</div>
      <div className='text-left mb-3'>
        <Space>
          <span
            className='flat-button stroked'
            onKeyDown={() => reuseNotification('pepito')}
            onClick={() => reuseNotification('pepito')}
          >
            <span>See mission status</span>
          </span>
        </Space>
      </div>

      <div className='tabset-heading'>Test Standalone Notifications</div>
      <div className='text-left mb-3'>
        <Space wrap={true}>
          <span
            className='flat-button stroked'
            onKeyDown={() => showNotificationByType('info')}
            onClick={() => showNotificationByType('info')}
          >
            <span>Info</span>
          </span>
          <span
            className='flat-button stroked'
            onKeyDown={() => showNotificationByType('success')}
            onClick={() => showNotificationByType('success')}
          >
            <span>Success</span>
          </span>
          <span
            className='flat-button stroked'
            onKeyDown={() => showNotificationByType('warning')}
            onClick={() => showNotificationByType('warning')}
          >
            <span>Warning</span>
          </span>
          <span
            className='flat-button stroked'
            onKeyDown={() => showNotificationByType('error')}
            onClick={() => showNotificationByType('error')}
          >
            <span>Error</span>
          </span>
          <span
            className='flat-button stroked'
            onKeyDown={() => showNotificationByType('info', true)}
            onClick={() => showNotificationByType('info', true)}
          >
            <span>With CTA</span>
          </span>
        </Space>
      </div>

      <div className='tabset-heading'>Notification with UI interaction</div>
      <div className='text-left mb-3'>
        <Space>
          <span
            className='flat-button stroked'
            onKeyDown={() => handleNotifWithUiInteraction()}
            onClick={() => handleNotifWithUiInteraction()}
          >
            <span>Show me</span>
          </span>
        </Space>
      </div>

      {renderRoutingDemo}
    </>
  );

  const renderTab = () => {
    switch (currentTab) {
      case 'first-tab':
        return renderDemoNumberFormatting;
      case 'test-stream':
        return renderTestStream();
      case 'account-info':
        return renderDemo2Tab();
      case 'multisig-tab':
        return renderMultisigTab();
      case 'misc-tab':
        return renderMiscTab;
      default:
        return null;
    }
  };

  const renderTabset = (
    <>
      <div className='button-tabset-container'>
        <div
          className={`tab-button ${currentTab === 'first-tab' ? 'active' : ''}`}
          onKeyDown={() => navigateToTab('first-tab')}
          onClick={() => navigateToTab('first-tab')}
        >
          Demo 1
        </div>
        <div
          className={`tab-button ${currentTab === 'test-stream' ? 'active' : ''}`}
          onKeyDown={() => navigateToTab('test-stream')}
          onClick={() => navigateToTab('test-stream')}
        >
          Test Stream
        </div>
        <div
          className={`tab-button ${currentTab === 'multisig-tab' ? 'active' : ''}`}
          onKeyDown={() => navigateToTab('multisig-tab')}
          onClick={() => navigateToTab('multisig-tab')}
        >
          Multisig info
        </div>
        <div
          className={`tab-button ${currentTab === 'account-info' ? 'active' : ''}`}
          onKeyDown={() => navigateToTab('account-info')}
          onClick={() => navigateToTab('account-info')}
        >
          Account info
        </div>
        <div
          className={`tab-button ${currentTab === 'misc-tab' ? 'active' : ''}`}
          onKeyDown={() => navigateToTab('misc-tab')}
          onClick={() => navigateToTab('misc-tab')}
        >
          Misc
        </div>
      </div>
      {renderTab()}
    </>
  );

  //#region Token selector - render methods

  const getTokenListItemClass = (item: TokenInfo) => {
    return selectedToken?.address === item.address ? 'selected' : 'simplelink';
  };

  const renderTokenList = () => {
    return filteredTokenList.map((t, index) => {
      const onClick = () => {
        setSelectedToken(t);

        setTimeout(() => {
          onScanAssetAddress(t);
        }, 100);

        consoleOut('token selected:', t, 'blue');
        onCloseTokenSelector();
      };

      if (index < MAX_TOKEN_LIST_ITEMS) {
        const balance = userBalances ? (userBalances[t.address] as number) : 0;
        return (
          <TokenListItem
            key={t.address}
            name={t.name || CUSTOM_TOKEN_NAME}
            mintAddress={t.address}
            token={t}
            className={balance ? getTokenListItemClass(t) : 'hidden'}
            onClick={onClick}
            balance={balance}
            showUsdValues={true}
          />
        );
      }

      return null;
    });
  };

  const getSelectedTokenError = () => {
    if (tokenFilter && selectedToken) {
      if (selectedToken.decimals === -1) {
        return 'Account not found';
      }
      if (selectedToken.decimals === -2) {
        return 'Account is not a token mint';
      }
    }
    return undefined;
  };

  const getBalanceForTokenFilter = () => {
    return connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0;
  };

  const renderTokenSelectorInner = () => {
    return (
      <div className='token-selector-wrapper'>
        <div className='token-search-wrapper'>
          <TextInput
            id='token-search-rp'
            value={tokenFilter}
            allowClear={true}
            extraClass='mb-2'
            onInputClear={onInputCleared}
            placeholder={t('token-selector.search-input-placeholder')}
            error={getSelectedTokenError()}
            onInputChange={onTokenSearchInputChange}
          />
        </div>
        <div className='token-list'>
          {filteredTokenList.length > 0 && renderTokenList()}
          {tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0 && (
            <TokenListItem
              key={tokenFilter}
              name={CUSTOM_TOKEN_NAME}
              mintAddress={tokenFilter}
              className={selectedToken && selectedToken.address === tokenFilter ? 'selected' : 'simplelink'}
              onClick={async () => {
                const address = tokenFilter;
                let decimals = -1;
                let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
                try {
                  accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
                  consoleOut('accountInfo:', accountInfo, 'blue');
                } catch (error) {
                  console.error(error);
                }
                decimals = getDecimalsFromAccountInfo(accountInfo, -1);
                const unknownToken: TokenInfo = {
                  address,
                  name: CUSTOM_TOKEN_NAME,
                  chainId: getNetworkIdByEnvironment(environment),
                  decimals,
                  symbol: `[${shortenAddress(address)}]`,
                };
                setSelectedToken(unknownToken);
                consoleOut('token selected:', unknownToken, 'blue');
                // Do not close on errors (-1 or -2)
                if (decimals >= 0) {
                  onCloseTokenSelector();
                }
              }}
              balance={getBalanceForTokenFilter()}
            />
          )}
        </div>
      </div>
    );
  };
  //#endregion

  if (!publicKey || !isWhitelisted) {
    return (
      <>
        <div className='container main-container'>
          <div className='interaction-area'>
            <div className='title-and-subtitle w-75 h-100'>
              <div className='title'>
                <IconCodeBlock className='mean-svg-icons' />
                <div>Diagnostics playground</div>
              </div>
              <div className='w-50 h-100 p-5 text-center flex-column flex-center'>
                <div className='text-center mb-2'>
                  <WarningFilled style={{ fontSize: 48 }} className='icon fg-warning' />
                </div>
                {!publicKey ? (
                  <h3>Please connect your wallet to access this page</h3>
                ) : (
                  <h3>
                    The content you are accessing is not available at this time or you don't have access permission
                  </h3>
                )}
              </div>
            </div>
          </div>
        </div>
        <PreFooter />
      </>
    );
  }

  return (
    <>
      <section>
        <div className='container mt-4 flex-column flex-center'>
          <div className='boxed-area'>
            {renderTabset}
            {/* <span className="secondary-link" onClick={getTopJupiterTokensByVolume}>Read list of top Jupiter tokens in volume over 1,000 USD</span> */}
          </div>
        </div>
      </section>

      <PreFooter />

      {isStreamDetailModalVisible && streamParsedData && (
        <VestingContractStreamDetailModal
          accountAddress={streamViewerAddress}
          handleClose={closeStreamDetailModal}
          highlightedStream={streamParsedData}
          isVisible={isStreamDetailModalVisible}
          msp={tokenStreamingV2}
          selectedToken={selectedToken}
          isDebugging={true}
        />
      )}

      {/* Token selection modal */}
      {isTokenSelectorModalVisible && (
        <Modal
          className='mean-modal unpadded-content'
          open={isTokenSelectorModalVisible}
          title={<div className='modal-title'>{t('token-selector.modal-title')}</div>}
          onCancel={onCloseTokenSelector}
          width={450}
          footer={null}
        >
          {renderTokenSelectorInner()}
        </Modal>
      )}
    </>
  );
};
