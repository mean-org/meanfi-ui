import { ArrowRightOutlined, WarningFilled } from '@ant-design/icons';
import { MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { MSP, Stream } from '@mean-dao/msp';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  AccountInfo,
  Connection,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  PublicKey,
} from '@solana/web3.js';
import { Button, Divider, Modal, Space, Tooltip } from 'antd';
import notification, { IconType } from 'antd/lib/notification';
import BigNumber from 'bignumber.js';
import BN from 'bn.js';
import { AddressDisplay } from 'components/AddressDisplay';
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import { MultisigOwnersView } from 'components/MultisigOwnersView';
import { openNotification } from 'components/Notifications';
import { PreFooter } from 'components/PreFooter';
import { TextInput } from 'components/TextInput';
import { TokenDisplay } from 'components/TokenDisplay';
import { TokenListItem } from 'components/TokenListItem';
import {
  CUSTOM_TOKEN_NAME,
  MAX_TOKEN_LIST_ITEMS,
  MULTISIG_ROUTE_BASE_PATH,
} from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import {
  getNetworkIdByEnvironment,
  useConnection,
  useConnectionConfig,
} from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import useWindowSize from 'hooks/useWindowResize';
import {
  IconCodeBlock,
  IconCoin,
  IconCopy,
  IconExternalLink,
  IconEyeOn,
  IconLoading,
  IconTrash,
  IconWallet,
} from 'Icons';
import { appConfig } from 'index';
import { getTokensWithBalances } from 'middleware/accounts';
import { NATIVE_SOL_MINT, SYSTEM_PROGRAM_ID } from 'middleware/ids';
import { ACCOUNT_LAYOUT } from 'middleware/layouts';
import { getStreamForDebug } from 'middleware/stream-debug-middleware';
import { getReadableStream } from 'middleware/streams';
import {
  consoleOut,
  delay,
  friendlyDisplayDecimalPlaces,
  isValidAddress,
  kFormatter,
  toUsCurrency,
} from 'middleware/ui';
import {
  formatAmount,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTokenOrCustomToken,
  shortenAddress,
  toUiAmount,
} from 'middleware/utils';
import { MultisigAsset, NATIVE_LOADER } from 'models/multisig';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactJson from 'react-json-view';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { VestingContractStreamDetailModal } from '../vesting/components/VestingContractStreamDetailModal';
import './style.scss';

type TabOption =
  | 'first-tab'
  | 'test-stream'
  | 'account-info'
  | 'multisig-tab'
  | 'demo-notifications'
  | 'misc-tab'
  | undefined;
type StreamViewerOption = 'treasurer' | 'beneficiary';
const notificationKey = 'updatable';

const CRYPTO_VALUES: number[] = [
  0.0004, 0.000003, 0.00000012345678, 1200.5, 1500.000009, 100500.000009226,
  7131060.641513,
];

const NUMBER_OF_ITEMS: number[] = [
  0, 1, 99, 157, 679, 1000, 1300, 1550, 99600, 154350, 600000, 1200000,
];

export const PlaygroundView = () => {
  const { t } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const connectionConfig = useConnectionConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    priceList,
    coinPrices,
    splTokenList,
    isWhitelisted,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
  } = useContext(AppStateContext);
  const { account } = useNativeAccount();
  const { width } = useWindowSize();
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [currentTab, setCurrentTab] = useState<TabOption>(undefined);
  const [parsedAccountInfo, setParsedAccountInfo] =
    useState<AccountInfo<ParsedAccountData> | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo<Buffer> | null>(
    null,
  );
  const [accountNotFound, setAccountNotFound] = useState<string>('');
  const [tokenFilter, setTokenFilter] = useState('');
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(
    undefined,
  );
  const [streamId, setStreamId] = useState<string>('');
  const [streamRawData, setStreamRawData] = useState();
  const [streamParsedData, setStreamParsedData] = useState<Stream | undefined>(
    undefined,
  );
  const [displayStreamData, setDisplayStreamData] = useState<boolean>(false);
  const [targetAddress, setTargetAddress] = useState<string>('');
  // Multisig
  const [selectedMultisig, setSelectedMultisig] = useState<
    MultisigInfo | undefined
  >(undefined);
  const [assetsAmout, setAssetsAmount] = useState<string>();
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [multisigAssets, setMultisigAssets] = useState<MultisigAsset[]>([]);
  const [multisigSolBalance, setMultisigSolBalance] = useState<
    number | undefined
  >(undefined);
  const [totalSafeBalance, setTotalSafeBalance] = useState<number | undefined>(
    undefined,
  );
  const [streamViewerAddress, setStreamViewerAddress] = useState('');

  const multisigAddressPK = useMemo(
    () => new PublicKey(appConfig.getConfig().multisigProgramAddress),
    [],
  );
  const streamV2ProgramAddressFromConfig = useMemo(
    () => appConfig.getConfig().streamV2ProgramAddress,
    [],
  );

  const msp = useMemo(() => {
    return new MSP(
      connectionConfig.endpoint,
      streamV2ProgramAddressFromConfig,
      'confirmed',
    );
  }, [connectionConfig.endpoint, streamV2ProgramAddressFromConfig]);

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      'confirmed',
      multisigAddressPK,
    );
  }, [publicKey, connection, multisigAddressPK, connectionConfig.endpoint]);

  ///////////////
  //  Actions  //
  ///////////////

  const fetchStreamData = useCallback(
    (id: string) => {
      if (!id || !isValidAddress(id) || !msp) {
        return;
      }

      const streamPK = new PublicKey(id);

      getStreamForDebug(streamPK, msp).then(value => {
        consoleOut('raw stream data payload:', value, 'blue');
        setStreamRawData(value);
      });

      msp.getStream(streamPK).then(value => {
        if (value) {
          consoleOut('parsed stream data payload:', value, 'blue');
          setStreamParsedData(value);
          if (value.version >= 2) {
            consoleOut(
              'Humanized stream data:',
              getReadableStream(value),
              'blue',
            );
          }
        }
      });

      setDisplayStreamData(true);
    },
    [msp],
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
    } else if (acc.executable) {
      return 'Program';
    } else {
      if (acc.data.program === 'spl-token') {
        return acc.data.parsed.type === 'mint' ? 'Token Mint' : 'Token Account';
      } else {
        return 'PDA (Program Derived Address) account';
      }
    }
  };

  const getAccountInfoByAddress = useCallback(
    async (address?: string) => {
      if (!targetAddress && !address) {
        return;
      }

      const scanAddress = address || targetAddress;
      if (!isValidAddress(scanAddress)) {
        return;
      }

      let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
      try {
        accInfo = (
          await connection.getParsedAccountInfo(new PublicKey(scanAddress))
        ).value;
      } catch (error) {
        console.error(error);
      }
      if (accInfo) {
        if (!(accInfo as any).data['parsed']) {
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
      if (!publicKey || !multisigClient || !filter) {
        return undefined;
      }

      if (!isValidAddress(filter)) {
        return;
      }

      try {
        const allInfo = await multisigClient.getMultisigs(publicKey);
        consoleOut('All multisigs:', allInfo, 'green');
        const selectedMultisig = allInfo.find(
          m => m.authority.toBase58() === filter,
        );
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
    [multisigClient, publicKey],
  );

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  };

  const handleRecipientAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setTargetAddress(trimmedValue);
  };

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

  const onClearResults = () => {
    setAccountInfo(null);
    setParsedAccountInfo(null);
    setTargetAddress('');
    setSelectedMultisig(undefined);
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

  const autoFocusInput = useCallback(() => {
    const input = document.getElementById('token-search-otp');
    if (input) {
      setTimeout(() => {
        input.focus();
      }, 100);
    }
  }, []);

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] =
    useState(false);

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

      const timeout = setTimeout(() => {
        const filter = (t: any) => {
          return (
            t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
            t.name.toLowerCase().includes(searchString.toLowerCase()) ||
            t.address.toLowerCase().includes(searchString.toLowerCase())
          );
        };

        const showFromList = !searchString
          ? selectedList
          : selectedList.filter((t: any) => filter(t));

        setFilteredTokenList(showFromList);
      });

      return () => {
        clearTimeout(timeout);
      };
    },
    [selectedList],
  );

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  }, [updateTokenListByFilter]);

  const onTokenSearchInputChange = useCallback(
    (e: any) => {
      const newValue = e.target.value;
      setTokenFilter(newValue);
      updateTokenListByFilter(newValue);
    },
    [updateTokenListByFilter],
  );

  // const getTopJupiterTokensByVolume = useCallback(() => {
  //   fetch('https://cache.jup.ag/stats/month')
  //     .then(res => {
  //       if (res.status >= 400) {
  //         throw new Error("Bad response from server");
  //       }
  //       return res.json();
  //     })
  //     .then(data => {
  //       // Only get tokens with volume for more than 1000 USD a month
  //       const tokens = data.lastXTopTokens.filter((s: any) => s.amount >= 1000);
  //       const topTokens = Array<any>();
  //       if (tokens && tokens.length > 0) {
  //         tokens.forEach((element: any) => {
  //           const token = splTokenList.find(t => t.symbol === element.symbol);
  //           if (token) {
  //             topTokens.push({
  //               name: token.name,
  //               symbol: token.symbol,
  //               address: token.address,
  //               decimals: token.decimals
  //             });
  //           }
  //         });
  //         consoleOut('Tokens with volume over 1000 USD:', tokens.length, 'crimson');
  //         consoleOut('Added to list of top tokens:', topTokens.length, 'crimson');
  //         consoleOut('topTokens:', topTokens, 'crimson');
  //       }
  //     })
  //     .catch(err => {
  //       console.error(err);
  //     });
  // }, [splTokenList]);

  const notificationTwo = () => {
    consoleOut('Notification is closing...');
    openNotification({
      type: 'info',
      description: t(
        'treasuries.create-treasury.multisig-treasury-created-instructions',
      ),
      duration: null,
    });
    navigate('/custody');
  };

  const sequentialMessagesAndNavigate = () => {
    openNotification({
      type: 'info',
      description: t(
        'treasuries.create-treasury.multisig-treasury-created-info',
      ),
      handleClose: notificationTwo,
    });
  };

  const stackedMessagesAndNavigate = async () => {
    openNotification({
      type: 'info',
      description: t(
        'treasuries.create-treasury.multisig-treasury-created-info',
      ),
      duration: 10,
    });
    await delay(1500);
    openNotification({
      type: 'info',
      description: t(
        'treasuries.create-treasury.multisig-treasury-created-instructions',
      ),
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
            Lorem, ipsum dolor sit amet consectetur adipisicing elit. Natus,
            ullam perspiciatis accusamus, sunt ipsum asperiores similique
            cupiditate autem veniam explicabo earum voluptates!
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
          <div className="mb-1">
            This notification is meant to have an additional CTA to perform
            another action!
          </div>
          <Button
            type="primary"
            size="small"
            shape="round"
            className="extra-small"
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
      description: t(
        'treasuries.create-treasury.multisig-treasury-created-info',
      ),
      duration: 0,
    });
  };

  const getPricePerToken = useCallback(
    (token: TokenInfo): number => {
      if (!token || !coinPrices) {
        return 0;
      }

      return coinPrices && coinPrices[token.symbol]
        ? coinPrices[token.symbol]
        : 0;
    },
    [coinPrices],
  );

  const getMultisigAssets = useCallback(
    async (connection: Connection, multisig: PublicKey) => {
      const [multisigSigner] = await PublicKey.findProgramAddress(
        [multisig.toBuffer()],
        multisigAddressPK,
      );

      const accountInfos = await connection.getProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
          filters: [
            { memcmp: { offset: 32, bytes: multisigSigner.toBase58() } },
            { dataSize: ACCOUNT_LAYOUT.span },
          ],
        },
      );

      if (!accountInfos || !accountInfos.length) {
        return [];
      }

      const results = accountInfos.map((t: any) => {
        const tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
        tokenAccount.address = t.pubkey;
        return tokenAccount;
      });

      return results;
    },
    [multisigAddressPK],
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
      mint: NATIVE_SOL_MINT,
      owner: selectedMultisig.authority,
      state: 1,
    } as MultisigAsset;
  }, [selectedMultisig, multisigSolBalance]);

  // Stream detail modal
  const [isStreamDetailModalVisible, setIsStreamDetailModalVisibility] =
    useState(false);
  const showStreamDetailModal = useCallback(
    (option: StreamViewerOption) => {
      if (streamParsedData) {
        if (option === 'treasurer') {
          setStreamViewerAddress(streamParsedData.treasurer.toBase58());
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
      case 'demo-notifications':
        setCurrentTab('demo-notifications');
        break;
      case 'misc-tab':
        setCurrentTab('misc-tab');
        break;
      default:
        setCurrentTab('first-tab');
        setSearchParams({ option: 'first-tab' }, { replace: true });
        break;
    }
  }, [location.search, searchParams, setSearchParams]);

  //#region Token selector - data management

  // Automatically update all token balances and rebuild token list
  useEffect(() => {
    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !splTokenList) {
      return;
    }

    const timeout = setTimeout(() => {
      getTokensWithBalances(
        connection,
        publicKey.toBase58(),
        priceList,
        splTokenList,
        false,
      ).then(response => {
        if (response) {
          setSelectedList(response.tokenList);
          setUserBalances(response.balancesMap);
          if (!selectedToken) {
            setSelectedToken(response.tokenList[0]);
          }
        }
      });
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [priceList, publicKey, connection, splTokenList, selectedToken]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (
      splTokenList &&
      splTokenList.length &&
      filteredTokenList.length === 0 &&
      !tokenFilter
    ) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [splTokenList, tokenFilter, filteredTokenList, updateTokenListByFilter]);

  //#endregion

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance]);

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
    if (!connection || !multisigClient || !selectedMultisig || !loadingAssets) {
      return;
    }

    const timeout = setTimeout(() => {
      getMultisigAssets(connection, selectedMultisig.id)
        .then(result => {
          const modifiedResults = new Array<any>();
          modifiedResults.push(solToken);
          result.forEach(item => {
            modifiedResults.push(item);
          });
          setMultisigAssets(modifiedResults);
          consoleOut('Multisig assets', modifiedResults, 'blue');
        })
        .catch(err => {
          console.error(err);
          setMultisigAssets([solToken as MultisigAsset]);
        })
        .finally(() => setLoadingAssets(false));
    });

    return () => {
      clearTimeout(timeout);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, loadingAssets, multisigClient, selectedMultisig]);

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
        const tokenPrice =
          getTokenPriceByAddress(token.address) ||
          getTokenPriceBySymbol(token.symbol);
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
    getTokenPriceBySymbol,
    multisigAssets,
    publicKey,
    selectedMultisig,
  ]);

  // Set selected token to the stream associated token as soon as the stream is available or changes
  useEffect(() => {
    if (!publicKey || !streamParsedData) {
      return;
    }

    const associatedToken = streamParsedData.associatedToken.toBase58();

    if (
      associatedToken &&
      (!selectedToken || selectedToken.address !== associatedToken)
    ) {
      getTokenOrCustomToken(
        connection,
        associatedToken,
        getTokenByMintAddress,
      ).then(token => {
        consoleOut('getTokenOrCustomToken (PlaygroundView) ->', token, 'blue');
        setSelectedToken(token);
      });
    }
  }, [
    connection,
    getTokenByMintAddress,
    publicKey,
    selectedToken,
    streamParsedData,
  ]);

  ////////////////////////
  // Getters and values //
  ////////////////////////

  const isSystemAccount = useCallback((account: string) => {
    const native = NATIVE_LOADER.toBase58();
    const system = SYSTEM_PROGRAM_ID.toBase58();
    return account === native || account === system;
  }, []);

  const isProgram = useMemo(() => {
    return parsedAccountInfo &&
      parsedAccountInfo.data.program === 'bpf-upgradeable-loader' &&
      parsedAccountInfo.data.parsed.type === 'program'
      ? true
      : false;
  }, [parsedAccountInfo]);

  const isProgramData = useMemo(() => {
    return parsedAccountInfo &&
      parsedAccountInfo.data.program === 'bpf-upgradeable-loader' &&
      parsedAccountInfo.data.parsed.type === 'programData'
      ? true
      : false;
  }, [parsedAccountInfo]);

  const isTokenAccount = useMemo(() => {
    return parsedAccountInfo &&
      parsedAccountInfo.data.program === 'spl-token' &&
      parsedAccountInfo.data.parsed.type === 'account'
      ? true
      : false;
  }, [parsedAccountInfo]);

  const isTokenMint = useMemo(() => {
    return parsedAccountInfo &&
      parsedAccountInfo.data.program === 'spl-token' &&
      parsedAccountInfo.data.parsed.type === 'mint'
      ? true
      : false;
  }, [parsedAccountInfo]);

  const selectedTokenDecimals = useMemo(() => {
    if (parsedAccountInfo) {
      if (isTokenMint) {
        return parsedAccountInfo.data.parsed.info.decimals || 0;
      } else if (isTokenAccount) {
        return parsedAccountInfo.data.parsed.info.tokenAmount.decimals || 0;
      } else {
        return 0;
      }
    }
    return 0;
  }, [parsedAccountInfo, isTokenMint, isTokenAccount]);

  ///////////////
  // Rendering //
  ///////////////

  const renderTable = () => {
    return CRYPTO_VALUES.map((value: number, index: number) => {
      return (
        <div className="item-list-row" key={index}>
          <div className="std-table-cell responsive-cell text-monospace text-right px-1">
            {selectedToken
              ? `${formatThousands(value, selectedToken.decimals)} ${
                  selectedToken.symbol
                }`
              : ''}
          </div>
          <div className="std-table-cell responsive-cell text-monospace text-right px-1">
            {selectedToken
              ? `${formatThousands(
                  value,
                  friendlyDisplayDecimalPlaces(value, selectedToken.decimals),
                )} ${selectedToken.symbol}`
              : ''}
          </div>
          <div className="std-table-cell responsive-cell text-monospace text-right px-1">
            {selectedToken
              ? getAmountWithSymbol(
                  value,
                  selectedToken.address,
                  false,
                  splTokenList,
                  selectedToken.decimals,
                )
              : ''}
          </div>
        </div>
      );
    });
  };

  const renderKformatters = () => {
    return NUMBER_OF_ITEMS.map((value: number, index: number) => {
      return (
        <div className="item-list-row" key={`${index}`}>
          <div className="std-table-cell responsive-cell text-monospace">
            <span className="font-size-75 font-bold text-shadow">
              {formatThousands(value) || 0}
            </span>
          </div>
          <div className="std-table-cell responsive-cell text-monospace">
            <div className="table-cell-flex-content">
              <div className="icon-cell">
                <div className="token-icon">
                  <div className="streams-count">
                    <span className="font-size-75 font-bold text-shadow">
                      {formatAmount(value, 0, true) || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="std-table-cell responsive-cell text-monospace">
            <div className="table-cell-flex-content">
              <div className="icon-cell">
                <div className="token-icon">
                  <div className="streams-count">
                    <span className="font-size-75 font-bold text-shadow">
                      {kFormatter(value, 1) || 0}
                    </span>
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
      <div className="flex-fixed-right">
        <div className="left">
          <div className="tabset-heading">Number Formatting</div>
        </div>
        <div className="right">
          <Tooltip title="Pick one of my assets" trigger="hover">
            <span
              className="flat-button change-button"
              onClick={showTokenSelector}
            >
              <IconCoin className="mean-svg-icons" />
            </span>
          </Tooltip>
        </div>
      </div>
      <div className="item-list-header">
        <div className="header-row">
          <div className="std-table-cell responsive-cell text-right px-1">
            Format 1
          </div>
          <div className="std-table-cell responsive-cell text-right px-1">
            Format 2
          </div>
          <div className="std-table-cell responsive-cell text-right px-1">
            Format 3
          </div>
        </div>
      </div>
      <div className="item-list-body">{renderTable()}</div>
      <div className="mb-2">
        Format 1:&nbsp;<code>formatThousands</code>
        <br />
        Format 2:&nbsp;
        <code>formatThousands + friendlyDisplayDecimalPlaces</code>
        <br />
        Format 3:&nbsp;<code>getAmountWithSymbol</code>
      </div>

      <Divider />

      <div className="tabset-heading">Short Number Formatting</div>
      <div className="item-list-header">
        <div className="header-row">
          <div className="std-table-cell responsive-cell">raw value</div>
          <div className="std-table-cell responsive-cell">formatAmount Fn</div>
          <div className="std-table-cell responsive-cell">kFormatter</div>
        </div>
      </div>
      <div className="item-list-body">{renderKformatters()}</div>
    </>
  );

  const infoRow = (caption: string, value: string) => {
    return (
      <div className="flex-fixed-right">
        <div className="left">
          <span className="font-size-75">{caption}</span>
        </div>
        <div className="right flex-row align-items-center">
          {isValidAddress(value) ? (
            <>
              {!isSystemAccount(value) ? (
                <span
                  className="flat-button tiny mr-1"
                  onClick={() => onScanAddress(value)}
                >
                  <IconEyeOn className="mean-svg-icons m-0" />
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
        <div className="flex-fixed-right mt-4">
          <div className="left">
            <div className="form-label">Inspect stream</div>
          </div>
          <div className="right">
            <span
              className={`simplelink ${
                streamParsedData ? 'underline-on-hover' : 'disabled'
              }`}
              onClick={() => showStreamDetailModal('treasurer')}
            >
              View as treasurer
            </span>
            <span className="mx-2">|</span>
            <span
              className={`simplelink ${
                streamParsedData ? 'underline-on-hover' : 'disabled'
              }`}
              onClick={() => showStreamDetailModal('beneficiary')}
            >
              View as beneficiary
            </span>
          </div>
        </div>

        <div className="two-column-form-layout col70x30">
          <div className="left">
            <div className="well">
              <div className="flex-fixed-right">
                <div className="left position-relative">
                  <span className="recipient-field-wrapper">
                    <input
                      id="stream-id-for-playground"
                      className="general-text-input"
                      autoComplete="on"
                      autoCorrect="off"
                      type="text"
                      onChange={handleStreamIdChange}
                      placeholder="Introduce stream id (required)"
                      required={true}
                      spellCheck="false"
                      value={streamId}
                    />
                  </span>
                </div>
                <div className="right">
                  <span>&nbsp;</span>
                </div>
              </div>
              {streamId && !isValidAddress(streamId) && (
                <span className="form-field-error">Not a valid stream id</span>
              )}
              {streamId && accountNotFound && (
                <span className="form-field-error">
                  Account info is not available for this stream id
                </span>
              )}
            </div>
          </div>
          <div className="right">
            <div className="flex-fixed-right">
              <div className="left">
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  disabled={!streamId || !isValidAddress(streamId)}
                  onClick={() => fetchStreamData(streamId)}
                >
                  Get info
                </Button>
              </div>
              <div className="right">
                <Button
                  type="default"
                  shape="round"
                  size="large"
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
          <div className="mb-3">
            <div className="two-column-layout">
              <div className="left">
                <div className="form-label">On-chain stream account data</div>
                <div className="well mb-1 panel-max-height vertical-scroll">
                  {streamRawData ? (
                    <ReactJson
                      src={streamRawData}
                      theme={'ocean'}
                      collapsed={1}
                    />
                  ) : (
                    '--'
                  )}
                </div>
              </div>
              <div className="right">
                <div className="form-label">MSP SDK parsed stream data</div>
                <div className="well mb-1 panel-max-height vertical-scroll">
                  {streamParsedData ? (
                    <ReactJson
                      src={streamParsedData}
                      theme={'ocean'}
                      collapsed={1}
                    />
                  ) : (
                    '--'
                  )}
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
          toUiAmount(
            parsedAccountInfo.data.parsed.info.supply,
            selectedTokenDecimals,
          ),
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
        {infoRow(
          'Balance (SOL):',
          `◎${formatThousands(accountInfo.lamports / LAMPORTS_PER_SOL, 9, 9)}`,
        )}
        {infoRow('Executable:', accountInfo.executable ? 'Yes' : 'No')}
        {infoRow(
          'Allocated Data Size:',
          `${accountInfo.data.byteLength} byte(s)`,
        )}
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
          infoRow(
            'Balance (SOL):',
            `◎${formatThousands(
              parsedAccountInfo.lamports / LAMPORTS_PER_SOL,
              9,
              9,
            )}`,
          )}
        {infoRow('Executable:', parsedAccountInfo.executable ? 'Yes' : 'No')}
        {isProgramData &&
          infoRow(
            'Upgradeable:',
            parsedAccountInfo.data.parsed.info.authority ? 'Yes' : 'No',
          )}
        {isProgramData && parsedAccountInfo.data.parsed.info.authority
          ? infoRow(
              'Upgrade Authority:',
              parsedAccountInfo.data.parsed.info.authority,
            )
          : null}
        {renderCurrentSupply()}
        {renderCurrentBalance()}
        {isTokenMint &&
          infoRow(
            'Mint Authority:',
            parsedAccountInfo.data.parsed.info.mintAuthority,
          )}
        {isTokenAccount &&
          infoRow('Mint:', parsedAccountInfo.data.parsed.info.mint)}
        {(isTokenMint || isTokenAccount) &&
          infoRow('Decimals:', selectedTokenDecimals)}
        {infoRow(
          'Allocated Data Size:',
          `${parsedAccountInfo.data.space} byte(s)`,
        )}
        {isProgram && infoRow('Owner:', parsedAccountInfo.owner.toBase58())}
        {isTokenMint && infoRow('Owner:', parsedAccountInfo.owner.toBase58())}
        {isTokenAccount &&
          infoRow('Owner:', parsedAccountInfo.data.parsed.info.owner)}
        {targetAddress && (isTokenAccount || isTokenMint) && (
          <>
            <Divider orientation="left" className="mt-1 mb-1">
              Preview
            </Divider>
            <TokenDisplay
              className="px-2 pb-2"
              mintAddress={
                isTokenMint
                  ? targetAddress
                  : parsedAccountInfo.data.parsed.info.mint
              }
              onClick={undefined}
              showName={true}
            />
          </>
        )}
        {isProgram &&
          infoRow(
            'Program Data:',
            parsedAccountInfo.data.parsed.info.programData,
          )}
      </>
    );
  };

  const renderAccountInfoResults = () => {
    if (targetAddress) {
      return (
        <div className="well-group text-monospace">
          {accountInfo && renderAccountInfo()}
          {parsedAccountInfo && renderparsedAccountInfo()}
        </div>
      );
    } else {
      return null;
    }
  };

  const renderDemo2Tab = () => {
    return (
      <>
        <div className="tabset-heading">Get account info</div>
        <div className="flex-fixed-right">
          <div className="left">
            <div className="form-label">Inspect account</div>
          </div>
          <div className="right">
            {publicKey ? (
              <>
                <Tooltip title="Inspect my wallet address" trigger="hover">
                  <span
                    className="flat-button change-button"
                    onClick={onScanMyAddress}
                  >
                    <IconWallet className="mean-svg-icons" />
                  </span>
                </Tooltip>
                <Tooltip title="Pick one of my assets" trigger="hover">
                  <span
                    className="flat-button change-button"
                    onClick={showTokenSelector}
                  >
                    <IconCoin className="mean-svg-icons" />
                  </span>
                </Tooltip>
              </>
            ) : (
              <span>&nbsp;</span>
            )}
          </div>
        </div>

        <div className="two-column-form-layout col70x30 mb-2">
          <div className="left">
            <div className="well">
              <div className="flex-fixed-right">
                <div className="left position-relative">
                  <span className="recipient-field-wrapper">
                    <input
                      id="payment-recipient-field"
                      className="general-text-input"
                      autoComplete="on"
                      autoCorrect="off"
                      type="text"
                      onFocus={handleRecipientAddressFocusInOut}
                      onChange={handleRecipientAddressChange}
                      onBlur={handleRecipientAddressFocusInOut}
                      placeholder={t('transactions.recipient.placeholder')}
                      required={true}
                      spellCheck="false"
                      value={targetAddress}
                    />
                    <span
                      id="payment-recipient-static-field"
                      className={`${
                        targetAddress
                          ? 'overflow-ellipsis-middle'
                          : 'placeholder-text'
                      }`}
                    >
                      {targetAddress || t('transactions.recipient.placeholder')}
                    </span>
                  </span>
                </div>
                <div className="right">
                  <span>&nbsp;</span>
                </div>
              </div>
              {targetAddress && !isValidAddress(targetAddress) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              )}
              {targetAddress && accountNotFound && (
                <span className="form-field-error">{accountNotFound}</span>
              )}
            </div>
          </div>
          <div className="right">
            <div className="flex-fixed-right">
              <div className="left">
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  onClick={() => getAccountInfoByAddress()}
                >
                  Get info
                </Button>
              </div>
              <div className="right">
                <Button
                  type="default"
                  shape="round"
                  size="large"
                  onClick={onClearResults}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3">{renderAccountInfoResults()}</div>
      </>
    );
  };

  const renderSafeName = useCallback(() => {
    if (!selectedMultisig) {
      return '--';
    }
    const selectedLabelName =
      selectedMultisig.label || shortenAddress(selectedMultisig.id);
    return <div>{selectedLabelName}</div>;
  }, [selectedMultisig]);

  const renderSecurity = useCallback(() => {
    return (
      <>
        <span>Security</span>
        <MultisigOwnersView
          label="view"
          className="ml-1"
          participants={selectedMultisig ? selectedMultisig.owners : []}
        />
      </>
    );
  }, [selectedMultisig]);

  const renderSafeBalance = useCallback(() => {
    return totalSafeBalance === undefined ? (
      <>
        <IconLoading
          className="mean-svg-icons"
          style={{ height: '15px', lineHeight: '15px' }}
        />
      </>
    ) : (
      toUsCurrency(totalSafeBalance)
    );
  }, [totalSafeBalance]);

  // Deposit Address
  const renderDepositAddress = useCallback(() => {
    return (
      <CopyExtLinkGroup
        content={selectedMultisig ? selectedMultisig.authority.toBase58() : ''}
        number={4}
        externalLink={true}
      />
    );
  }, [selectedMultisig]);

  const infoSafeData = useMemo(
    () => [
      {
        name: 'Safe name',
        value: renderSafeName(),
      },
      {
        name: renderSecurity(),
        value: selectedMultisig
          ? `${selectedMultisig.threshold}/${selectedMultisig.owners.length} signatures`
          : '--',
      },
      {
        name: `Safe balance ${assetsAmout}`,
        value: renderSafeBalance(),
      },
      {
        name: 'Deposit address',
        value: renderDepositAddress(),
      },
    ],
    [
      assetsAmout,
      renderDepositAddress,
      renderSafeBalance,
      renderSafeName,
      renderSecurity,
      selectedMultisig,
    ],
  );

  const renderMultisigTab = () => {
    return (
      <>
        <div className="tabset-heading">Get multisig info</div>

        <div className="flex-fixed-right">
          <div className="left">
            <div className="form-label">Inspect account</div>
          </div>
          <div className="right">&nbsp;</div>
        </div>

        <div className="two-column-form-layout col70x30 mb-2">
          <div className="left">
            <div className="well">
              <div className="flex-fixed-right">
                <div className="left position-relative">
                  <span className="recipient-field-wrapper">
                    <input
                      id="payment-recipient-field"
                      className="general-text-input"
                      autoComplete="on"
                      autoCorrect="off"
                      type="text"
                      onFocus={handleRecipientAddressFocusInOut}
                      onChange={handleRecipientAddressChange}
                      onBlur={handleRecipientAddressFocusInOut}
                      placeholder={t('transactions.recipient.placeholder')}
                      required={true}
                      spellCheck="false"
                      value={targetAddress}
                    />
                    <span
                      id="payment-recipient-static-field"
                      className={`${
                        targetAddress
                          ? 'overflow-ellipsis-middle'
                          : 'placeholder-text'
                      }`}
                    >
                      {targetAddress || t('transactions.recipient.placeholder')}
                    </span>
                  </span>
                </div>
                <div className="right">
                  <span>&nbsp;</span>
                </div>
              </div>
              {targetAddress && !isValidAddress(targetAddress) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              )}
              {targetAddress && selectedMultisig === undefined && (
                <span className="form-field-error">{accountNotFound}</span>
              )}
            </div>
          </div>
          <div className="right">
            <div className="flex-fixed-right">
              <div className="left">
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="large"
                  onClick={() => getMultisigInfo(targetAddress)}
                >
                  Get multisig
                </Button>
              </div>
              <div className="right">
                <Button
                  type="default"
                  shape="round"
                  size="large"
                  onClick={onClearResults}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3">
          {targetAddress && selectedMultisig && (
            <>
              <div className="well-group text-monospace flex-row two-column-form-layout flex-wrap">
                {infoSafeData.map((info, index: number) => {
                  const isEven = index % 2 === 0 ? true : false;
                  return (
                    <div key={`${index}`} className={isEven ? 'left' : 'right'}>
                      <div className="info-label">{info.name}</div>
                      <div className="info-value mb-2 line-height-100">
                        {info.value}
                      </div>
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
        <div className="well small mb-2">
          <div className="flex-fixed-right">
            <div className="left position-relative">
              <span className="recipient-field-wrapper">
                <span className="referral-link font-size-75 text-monospace">
                  {linkAddress}
                </span>
              </span>
            </div>
            <div className="right">
              <Link to={linkAddress} title={title}>
                <div className="add-on simplelink">
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
          width < 1200
            ? 'footer .account-selector-max-width'
            : 'header .account-selector-max-width',
          'red',
        );
      }
    };

    const onNotifySuperSafeCreated = () => {
      const btn = (
        <Button
          type="primary"
          size="small"
          shape="round"
          className="extra-small"
          onClick={() => {
            showcaseNewAccount();
            notification.close(notificationKey);
          }}
        >
          Show accounts
        </Button>
      );
      notification.open({
        type: 'success',
        message: 'SuperSafe account created',
        description: (
          <div className="mb-1">
            Your SuperSafe account was successfully created.
          </div>
        ),
        btn,
        key: notificationKey,
        duration: null,
        placement: 'topRight',
        top: 110,
      });
    };

    onNotifySuperSafeCreated();
  }, [width]);

  const renderRoutingDemo = (
    <>
      <div className="tabset-heading">Test routing</div>
      <div className="text-left mb-3">
        <div className="form-label">Go to my connected account</div>
        {renderRouteLink('With no params', '/')}
      </div>
    </>
  );

  const renderDemo3Tab = (
    <>
      <div className="tabset-heading">Notify and navigate</div>
      <div className="text-left mb-3">
        <Space wrap={true}>
          <span
            className="flat-button stroked"
            onClick={() => sequentialMessagesAndNavigate()}
          >
            <span>Sequential messages → Navigate</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => stackedMessagesAndNavigate()}
          >
            <span>Stacked messages → Navigate</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => interestingCase()}
          >
            <span>Without title</span>
          </span>
        </Space>
      </div>

      <div className="tabset-heading">Test Updatable Notifications</div>
      <div className="text-left mb-3">
        <Space>
          <span
            className="flat-button stroked"
            onClick={() => reuseNotification('pepito')}
          >
            <span>See mission status</span>
          </span>
        </Space>
      </div>

      <div className="tabset-heading">Test Standalone Notifications</div>
      <div className="text-left mb-3">
        <Space wrap={true}>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType('info')}
          >
            <span>Info</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType('success')}
          >
            <span>Success</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType('warning')}
          >
            <span>Warning</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType('error')}
          >
            <span>Error</span>
          </span>
          <span
            className="flat-button stroked"
            onClick={() => showNotificationByType('info', true)}
          >
            <span>With CTA</span>
          </span>
        </Space>
      </div>

      <div className="tabset-heading">Notification with UI interaction</div>
      <div className="text-left mb-3">
        <Space>
          <span
            className="flat-button stroked"
            onClick={() => handleNotifWithUiInteraction()}
          >
            <span>Show me</span>
          </span>
        </Space>
      </div>

      {renderRoutingDemo}
    </>
  );

  const renderMiscTab = (
    <>
      <div className="tabset-heading">Miscelaneous features</div>

      <h3>Primary, Secondary and Terciary buttons</h3>
      <div className="mb-2">
        <div className="mb-1">
          <Space wrap={true} size="middle">
            <Button
              type="primary"
              shape="round"
              size="small"
              className="extra-small"
            >
              Primary
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="extra-small"
            >
              Default
            </Button>
            <Button
              type="ghost"
              shape="round"
              size="small"
              className="extra-small"
            >
              Ghost
            </Button>
          </Space>
        </div>
        <div className="mb-1">
          <Space wrap={true} size="middle">
            <Button
              type="primary"
              shape="round"
              size="middle"
              className="thin-stroke"
            >
              Primary
            </Button>
            <Button
              type="default"
              shape="round"
              size="middle"
              className="thin-stroke"
            >
              Default
            </Button>
            <Button
              type="ghost"
              shape="round"
              size="middle"
              className="thin-stroke"
            >
              Ghost
            </Button>
          </Space>
        </div>
      </div>
      <h3>Primary, Secondary and Terciary buttons disabled</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <Button
            type="primary"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}
          >
            Primary disabled
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}
          >
            Default disabled
          </Button>
          <Button
            type="ghost"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={true}
          >
            Ghost disabled
          </Button>
        </Space>
      </div>

      <h3>Animated buttons</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <button className="animated-button-red">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Red
          </button>
          <button className="animated-button-green">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Green
          </button>
          <button className="animated-button-blue">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Blue
          </button>
          <button className="animated-button-gold">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
            Gold
          </button>
        </Space>
      </div>

      <h3>Flat buttons</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <span className="flat-button tiny">
            <IconCopy className="mean-svg-icons" />
            <span className="ml-1">copy item</span>
          </span>
          <span className="flat-button tiny">
            <IconTrash className="mean-svg-icons" />
            <span className="ml-1">delete item</span>
          </span>
          <span className="flat-button tiny">
            <IconExternalLink className="mean-svg-icons" />
            <span className="ml-1">view on blockchain</span>
          </span>
        </Space>
      </div>

      <h3>Flat stroked buttons</h3>
      <div className="mb-2">
        <Space wrap={true} size="middle">
          <span className="flat-button tiny stroked">
            <IconCopy className="mean-svg-icons" />
            <span className="mx-1">copy item</span>
          </span>
          <span className="flat-button tiny stroked">
            <IconTrash className="mean-svg-icons" />
            <span className="mx-1">delete item</span>
          </span>
          <span className="flat-button tiny stroked">
            <IconExternalLink className="mean-svg-icons" />
            <span className="mx-1">view on blockchain</span>
          </span>
        </Space>
      </div>
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
      case 'demo-notifications':
        return renderDemo3Tab;
      case 'misc-tab':
        return renderMiscTab;
      default:
        return null;
    }
  };

  const renderTabset = (
    <>
      <div className="button-tabset-container">
        <div
          className={`tab-button ${currentTab === 'first-tab' ? 'active' : ''}`}
          onClick={() => navigateToTab('first-tab')}
        >
          Demo 1
        </div>
        <div
          className={`tab-button ${
            currentTab === 'test-stream' ? 'active' : ''
          }`}
          onClick={() => navigateToTab('test-stream')}
        >
          Test Stream
        </div>
        <div
          className={`tab-button ${
            currentTab === 'multisig-tab' ? 'active' : ''
          }`}
          onClick={() => navigateToTab('multisig-tab')}
        >
          Multisig info
        </div>
        <div
          className={`tab-button ${
            currentTab === 'account-info' ? 'active' : ''
          }`}
          onClick={() => navigateToTab('account-info')}
        >
          Account info
        </div>
        <div
          className={`tab-button ${
            currentTab === 'demo-notifications' ? 'active' : ''
          }`}
          onClick={() => navigateToTab('demo-notifications')}
        >
          Demo 3
        </div>
        <div
          className={`tab-button ${currentTab === 'misc-tab' ? 'active' : ''}`}
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
      const onClick = function () {
        setSelectedToken(t);

        setTimeout(() => {
          onScanAssetAddress(t);
        }, 100);

        consoleOut('token selected:', t, 'blue');
        onCloseTokenSelector();
      };

      if (index < MAX_TOKEN_LIST_ITEMS) {
        const balance =
          connected && userBalances && userBalances[t.address] > 0
            ? userBalances[t.address]
            : 0;
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
      } else {
        return null;
      }
    });
  };

  const getSelectedTokenError = () => {
    if (tokenFilter && selectedToken) {
      if (selectedToken.decimals === -1) {
        return 'Account not found';
      } else if (selectedToken.decimals === -2) {
        return 'Account is not a token mint';
      }
    }
    return undefined;
  };

  const getBalanceForTokenFilter = () => {
    return connected && userBalances && userBalances[tokenFilter] > 0
      ? userBalances[tokenFilter]
      : 0;
  };

  const renderTokenSelectorInner = () => {
    return (
      <div className="token-selector-wrapper">
        <div className="token-search-wrapper">
          <TextInput
            id="token-search-rp"
            value={tokenFilter}
            allowClear={true}
            extraClass="mb-2"
            onInputClear={onInputCleared}
            placeholder={t('token-selector.search-input-placeholder')}
            error={getSelectedTokenError()}
            onInputChange={onTokenSearchInputChange}
          />
        </div>
        <div className="token-list">
          {filteredTokenList.length > 0 && renderTokenList()}
          {tokenFilter &&
            isValidAddress(tokenFilter) &&
            filteredTokenList.length === 0 && (
              <TokenListItem
                key={tokenFilter}
                name={CUSTOM_TOKEN_NAME}
                mintAddress={tokenFilter}
                className={
                  selectedToken && selectedToken.address === tokenFilter
                    ? 'selected'
                    : 'simplelink'
                }
                onClick={async () => {
                  const address = tokenFilter;
                  let decimals = -1;
                  let accountInfo: AccountInfo<
                    Buffer | ParsedAccountData
                  > | null = null;
                  try {
                    accountInfo = (
                      await connection.getParsedAccountInfo(
                        new PublicKey(address),
                      )
                    ).value;
                    consoleOut('accountInfo:', accountInfo, 'blue');
                  } catch (error) {
                    console.error(error);
                  }
                  if (accountInfo) {
                    if (
                      (accountInfo as any).data['program'] &&
                      (accountInfo as any).data['program'] === 'spl-token' &&
                      (accountInfo as any).data['parsed'] &&
                      (accountInfo as any).data['parsed']['type'] &&
                      (accountInfo as any).data['parsed']['type'] === 'mint'
                    ) {
                      decimals = (accountInfo as any).data['parsed']['info'][
                        'decimals'
                      ];
                    } else {
                      decimals = -2;
                    }
                  }
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
        <div className="container main-container">
          <div className="interaction-area">
            <div className="title-and-subtitle w-75 h-100">
              <div className="title">
                <IconCodeBlock className="mean-svg-icons" />
                <div>Diagnostics playground</div>
              </div>
              <div className="w-50 h-100 p-5 text-center flex-column flex-center">
                <div className="text-center mb-2">
                  <WarningFilled
                    style={{ fontSize: 48 }}
                    className="icon fg-warning"
                  />
                </div>
                {!publicKey ? (
                  <h3>Please connect your wallet to access this page</h3>
                ) : (
                  <h3>
                    The content you are accessing is not available at this time
                    or you don't have access permission
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
        <div className="container mt-4 flex-column flex-center">
          <div className="boxed-area">
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
          msp={msp}
          selectedToken={selectedToken}
          isDebugging={true}
        />
      )}

      {/* Token selection modal */}
      {isTokenSelectorModalVisible && (
        <Modal
          className="mean-modal unpadded-content"
          open={isTokenSelectorModalVisible}
          title={
            <div className="modal-title">{t('token-selector.modal-title')}</div>
          }
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
