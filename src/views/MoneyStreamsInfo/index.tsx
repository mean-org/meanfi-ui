import { Connection, PublicKey } from "@solana/web3.js";
import { Button, Col, Menu, Row } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { ResumeItem } from "../../components/ResumeItem";
import { RightInfoDetails } from "../../components/RightInfoDetails";
import { TabsMean } from "../../components/TabsMean";
import { TreasuryStreamCreateModal } from "../../components/TreasuryStreamCreateModal";
import { AppStateContext } from "../../contexts/appstate";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { IconArrowForward, IconVerticalEllipsis } from "../../Icons";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { TransactionStatus } from "../../models/enums";
import PieChartComponent from "./PieChart";
import "./style.scss";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import {
  TransactionFees,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  calculateActionFees as calculateActionFeesV2,
  Treasury,
  Stream,
  MSP,
  Constants as MSPV2Constants
} from '@mean-dao/msp';
import { MSP_ACTIONS, StreamInfo, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import { MeanMultisig, MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { consoleOut, isValidAddress } from "../../utils/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { shortenAddress } from "../../utils/utils";
import { TREASURY_TYPE_OPTIONS } from "../../constants/treasury-type-options";
import { openNotification } from "../../components/Notifications";
import { useTranslation } from "react-i18next";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useAccountsContext } from "../../contexts/accounts";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { NO_FEES } from "../../constants";
import { useLocation, useParams } from "react-router-dom";
import { TreasuryOpenModal } from "../../components/TreasuryOpenModal";

export const MoneyStreamsInfoView = (props: {
  onSendFromIncomingStreamInfo?: any;
  onSendFromOutgoingStreamInfo?: any;
  onSendFromStreamingAccountDetails?: any;
}) => {
  const {
    tokenList,
    selectedToken,
    refreshTokenBalance,
    resetContractValues,
    streamProgramAddress,
    getTokenByMintAddress,
    streamV2ProgramAddress,
    setTransactionStatus,
    setTreasuryOption,
    setEffectiveRate,
    setSelectedToken,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const {
    onSendFromIncomingStreamInfo,
    onSendFromOutgoingStreamInfo,
    onSendFromStreamingAccountDetails
  } = props;

  const accounts = useAccountsContext();
  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { publicKey } = useWallet();
  const location = useLocation();
  const { address } = useParams();

  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuryList, setTreasuryList] = useState<(Treasury | TreasuryInfo)[]>([]);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [customStreamDocked, setCustomStreamDocked] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<(Stream | StreamInfo)[]>([]);

  // Multisig related
  const [multisigAddress, setMultisigAddress] = useState('');
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(false);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [needReloadMultisig, setNeedReloadMultisig] = useState(true);

  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);

  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed"
    );

  }, [
    connection,
    publicKey,
    connectionConfig.endpoint,
  ]);

  // Create and cache Money Streaming Program V1 instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  // Create and cache Money Streaming Program V2 instance
  const msp = useMemo(() => {
    if (publicKey) {
      return new MSP(
        connectionConfig.endpoint,
        streamV2ProgramAddress,
        "confirmed"
      );
    }
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const setCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
      const unkToken: TokenInfo = {
        address: address,
        name: 'Unknown',
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setSelectedToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
      setEffectiveRate(0);
    }
  }, [
    setEffectiveRate,
    setSelectedToken,
  ]);

  const openTreasuryById = useCallback((treasuryId: string, isNew = true, dock = false) => {
    if (!connection || !publicKey || !msp || !ms || loadingTreasuryDetails) { return; }

    setLoadingTreasuryDetails(true);
    const mspInstance: any = isNew || dock ? msp : ms;
    const treasuryPk = new PublicKey(treasuryId);

    mspInstance.getTreasury(treasuryPk)
      .then((details: Treasury | TreasuryInfo | undefined) => {
        if (details) {
          consoleOut('treasuryDetails:', details, 'blue');
          setTreasuryDetails(details);
          setSignalRefreshTreasuryStreams(true);
          const v1 = details as TreasuryInfo;
          const v2 = details as Treasury;
          const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      
          // Preset active token to the treasury associated token
          const ata = isNewTreasury ? v2.associatedToken as string : v1.associatedTokenAddress as string;
          const type = isNewTreasury ? v2.treasuryType : v1.type;
          const token = getTokenByMintAddress(ata);
          consoleOut("treasury token:", token ? token.symbol : 'Custom', 'blue');
          if (token) {
            if (!selectedToken || selectedToken.address !== token.address) {
              setSelectedToken(token);
            }
          } else if (!token && (!selectedToken || selectedToken.address !== ata)) {
            setCustomToken(ata);
          }

          const tOption = TREASURY_TYPE_OPTIONS.find(t => t.type === type);
          if (tOption) {
            setTreasuryOption(tOption);
          }
          if (dock) {
            setTreasuryList([details]);
            setCustomStreamDocked(true);
            openNotification({
              description: t('notifications.success-loading-treasury-message', {treasuryId: shortenAddress(treasuryId, 10)}),
              type: "success"
            });
          }
        } else {
          setTreasuryDetails(undefined);
          setTreasuryDetails(undefined);
          if (dock) {
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
              type: "error"
            });
          }
        }
      })
      .catch((error: any) => {
        console.error(error);
        setTreasuryDetails(undefined);
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
          type: "error"
        });
      })
      .finally(() => {
        setLoadingTreasuryDetails(false);
      });

  }, [
    ms,
    msp,
    publicKey,
    connection,
    selectedToken,
    loadingTreasuryDetails,
    getTokenByMintAddress,
    setTreasuryOption,
    setSelectedToken,
    setCustomToken,
    t,
  ]);

  const getAllUserV2Treasuries = useCallback(async () => {

    if (!connection || !publicKey || loadingTreasuries || !msp) { return []; }

    let treasuries = await msp.listTreasuries(publicKey);

    if (selectedMultisig && multisigAccounts) {

      const multisigTreasuries: any[] = [];

      const filterMultisigAccounts = selectedMultisig
        ? [selectedMultisig.authority]
        : multisigAccounts.map(m => m.authority);

      if (filterMultisigAccounts) {
        for (const key of filterMultisigAccounts) {
          multisigTreasuries.push(...(await msp.listTreasuries(key)));
        }
      }

      treasuries = multisigTreasuries;
    } 

    return treasuries.filter((t: any) => !t.autoClose);

  }, [
    connection, 
    loadingTreasuries, 
    msp,
    selectedMultisig,
    multisigAccounts,
    publicKey
  ]);

  const refreshTreasuries = useCallback((reset = false) => {
    
    if (!connection || !publicKey || loadingTreasuries) { return; }

    if (msp && ms && fetchTxInfoStatus !== "fetching") {

      setTimeout(() => {
        setLoadingTreasuries(true);
        clearTxConfirmationContext();
      });

      const treasuryAccumulator: (Treasury | TreasuryInfo)[] = [];
      let treasuriesv1: TreasuryInfo[] = [];
      getAllUserV2Treasuries()
        .then(async (treasuriesv2) => {
          treasuryAccumulator.push(...treasuriesv2);
          consoleOut('v2 treasuries:', treasuriesv2, 'blue');

          if (!selectedMultisig) {
            try {
              treasuriesv1 = await ms.listTreasuries(publicKey);
            } catch (error) {
              console.error(error);
            }
            consoleOut('v1 treasuries:', treasuriesv1, 'blue');
            treasuryAccumulator.push(...treasuriesv1);
          }

          setTreasuryList(treasuryAccumulator);
          consoleOut('Combined treasury list:', treasuryAccumulator, 'blue');
          let item: Treasury | TreasuryInfo | undefined = undefined;
              
          if (treasuryAccumulator.length) {
            if (reset) {
              if (treasuryAddress) {
                // treasuryAddress was passed in as query param?
                const itemFromServer = treasuryAccumulator.find(i => i.id === treasuryAddress);
                item = itemFromServer || treasuryAccumulator[0];
              } else {
                item = treasuryAccumulator[0];
              }
            } else {
              // Try to get current item by its id
              if (treasuryAddress) {
                // treasuryAddress was passed in as query param?
                const itemFromServer = treasuryAccumulator.find(i => i.id === treasuryAddress);
                item = itemFromServer || treasuryAccumulator[0];
              } else if (treasuryDetails) {
                // there was an item already selected
                const itemFromServer = treasuryAccumulator.find(i => i.id === treasuryDetails.id);
                item = itemFromServer || treasuryAccumulator[0];
              } else {
                // then choose the first one
                item = treasuryAccumulator[0];
              }
            }

            if (!item) {
              item = Object.assign({}, treasuryAccumulator[0]);
            }

            if (item) {
              const isNewTreasury = (item as Treasury).version && (item as Treasury).version >= 2 ? true : false;
              openTreasuryById(item.id as string, isNewTreasury);
            }

          } else {
            setTreasuryDetails(undefined);
            setTreasuryDetails(undefined);
            setTreasuryStreams([]);
          }
        })
        .catch(error => {
          console.error(error);
        })
        .finally(() => setLoadingTreasuries(false));
    }

  }, [
    ms,
    msp,
    publicKey,
    connection,
    treasuryAddress,
    treasuryDetails,
    selectedMultisig,
    fetchTxInfoStatus,
    loadingTreasuries,
    clearTxConfirmationContext,
    openTreasuryById,
    getAllUserV2Treasuries
  ]);

  const onRefreshTreasuriesClick = () => {
    refreshTreasuries(false);
    setCustomStreamDocked(false);
  };

  const refreshUserBalances = useCallback(() => {

    if (!connection || !publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const balancesMap: any = {};
    connection.getTokenAccountsByOwner(
      publicKey, 
      { programId: TOKEN_PROGRAM_ID }, 
      connection.commitment
    )
    .then(response => {
      for (const acc of response.value) {
        const decoded = ACCOUNT_LAYOUT.decode(acc.account.data);
        const address = decoded.mint.toBase58();
        const itemIndex = tokenList.findIndex(t => t.address === address);
        if (itemIndex !== -1) {
          balancesMap[address] = decoded.amount.toNumber() / (10 ** tokenList[itemIndex].decimals);
        } else {
          balancesMap[address] = 0;
        }
      }
    })
    .catch(error => {
      console.error(error);
      for (const t of tokenList) {
        balancesMap[t.address] = 0;
      }
    })
    .finally(() => setUserBalances(balancesMap));

  }, [
    accounts,
    publicKey,
    tokenList,
    connection,
  ]);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    refreshUserBalances();
    refreshTokenBalance();
    setIsCreateStreamModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createStreamWithFunds).then((value: any) => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
      setWithdrawTransactionFees(value);
      consoleOut('withdrawTransactionFees:', value, 'orange');
    });
  }, [
    refreshUserBalances,
    refreshTokenBalance,
    getTransactionFeesV2,
    resetTransactionStatus,
  ]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
    resetContractValues();
    refreshTokenBalance();
    resetTransactionStatus();
  }, [refreshTokenBalance, resetContractValues, resetTransactionStatus]);

  const isMultisigTreasury = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!treasurer.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }

    return false;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ]);

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

  const onAcceptOpenTreasury = (e: any) => {
    closeOpenTreasuryModal();
    consoleOut('treasury id:', e, 'blue');
    openTreasuryById(e, true, true);
  };

  // TODO: Here the multisig ID is returned
  const getSelectedTreasuryMultisig = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return PublicKey.default;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!multisigAccounts || !treasuryDetails) { return PublicKey.default; }
    const multisig = multisigAccounts.filter(a => a.authority.equals(treasurer))[0];
    if (!multisig) { return PublicKey.default; }
    return multisig.id;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ])

    // Get the Multisig accounts
  // TODO: Signal when it is loading
  useEffect(() => {

    if (!connection || !publicKey || !multisigClient || !multisigAddress || !needReloadMultisig) {
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Loading multisigs...', '', 'blue');
      setNeedReloadMultisig(false);
      setLoadingMultisigAccounts(true);

      multisigClient
        .getMultisigs(publicKey)
        .then((allInfo: MultisigInfo[]) => {
          allInfo.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
          setMultisigAccounts(allInfo);
          consoleOut('multisigs:', allInfo, 'blue');
        })
        .catch(err => {
          console.error(err);
        })
        .finally(() => {
          setLoadingMultisigAccounts(false);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    multisigClient,
    multisigAddress,
    needReloadMultisig,
  ]);

  // Set selectedMultisig based on the passed-in multisigAddress in query params
  useEffect(() => {

    if (!publicKey || !multisigAddress || !multisigAccounts || multisigAccounts.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      if (location.search) {
        consoleOut(`try to select multisig ${multisigAddress} from list`, multisigAccounts, 'blue');
        const selected = multisigAccounts.find(m => m.authority.toBase58() === multisigAddress);
        if (selected) {
          consoleOut('selectedMultisig:', selected, 'blue');
          setSelectedMultisig(selected);
        } else {
          consoleOut('multisigAccounts does not contain the requested multisigAddress:', multisigAddress, 'orange');
        }
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    location.search,
    multisigAddress,
    multisigAccounts,
  ]);

  // Protocol
  const listOfBadges = ["MSP", "DEFI", "Money Streams"];

  const renderBadges = (
    <div className="badge-container">
      {listOfBadges.map((badge) => (
        <span className="badge darken small text-uppercase mr-1">{badge}</span>
      ))}
      </div>
  );

  // Balance
  const renderBalance = (
    <a href="#" className="simplelink underline-on-hover">Tracking 2 smart contracts</a>
  );

  const infoData = [
    {
      name: "Protocol",
      value: "Money Streams",
      content: renderBadges
    },
    {
      name: "Balance (My TVL)",
      value: "$3,391.01",
      content: renderBalance
    }
  ];

  const renderSummary = (
    <>
      <Row gutter={[8, 8]}>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card">
          <h3>Incoming Streams</h3>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                $49,853.58
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                3 streams
              </div>
            </div>
          </div>
        </Col>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card">
          <h3>Outgoing Streams</h3>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                $12,291.01
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                4 streams
              </div>
            </div>
          </div>
        </Col>
      </Row>
      <PieChartComponent />
    </>
  );

  const subtitle = address && (
    <CopyExtLinkGroup
      content={address}
      number={8}
      externalLink={true}
    />
  );
    

  const incomingStreams = [
    {
      title: "Monthly Remittance from Jesse",
      amount: "3.29805 USDC/hour",
      resume: "out of funds on 01/02/2022",
      status: 1
    },
    {
      title: "Mean Salary for Pavelsan",
      amount: "100 USDC/hour",
      resume: "starts in 06:35:11",
      status: 2
    },
    {
      title: "Grape’s Research Distribution",
      amount: "25,158 GRAPE/hour",
      resume: "streaming since 01/05/2022",
      status: 0
    },
  ];

  const outgoingStreams = [
    {
      title: "Monthly remittance for Mom",
      amount: "150 USDC/month",
      resume: "streaming since 01/05/2022",
      status: 1
    }
  ];

  const streamingAccounts = [
    {
      title: "Coinbase team salary",
      subtitle: subtitle,
      amount: "3",
      resume: "streams"
    }
  ];

  const teamSalary = [
    {
      title: "Yamel Amador’s Salary",
      amount: "5.11 USDC/hour",
      resume: "streaming since 03/01/2022",
      status: 1
    },
    {
      title: "Tania’s Salary",
      amount: "1,000.00 USDC/min",
      resume: "streaming since 04/15/2022",
      status: 2
    },
    {
      title: "Michel Comp",
      amount: "2,150.11 USDC/month",
      resume: "out of funds on 01/02/2022",
      status: 0
    }
  ];

  // Incoming streams list
  const renderListOfIncomingStreams = (
    <>
      {incomingStreams.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromIncomingStreamInfo(stream);
        };

        const title = stream.title ? stream.title : "Unknown incoming stream";

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
          >
            <ResumeItem
              id={index}
              title={title}
              subtitle={stream.amount}
              resume={stream.resume}
              status={stream.status}
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
            />
          </div>
        )
      })}
    </>
  );

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="0" onClick={() => {}}>
        <span className="menu-item-text">Add outgoing stream</span>
      </Menu.Item>
      <Menu.Item key="0" onClick={() => {}}>
        <span className="menu-item-text">Add streaming account</span>
      </Menu.Item>
    </Menu>
  );

  // Outgoing streams list
  const renderListOfOutgoingStreams = (
    <>
      <ResumeItem
        title="Outflows"
        classNameTitle="text-uppercase"
        subtitle={subtitle}
        amount={1}
        resume="outflow"
        className="account-category-title"
        hasRightIcon={true}
        rightIconHasDropdown={true}
        rightIcon={<IconVerticalEllipsis className="mean-svg-icons"/>}
        dropdownMenu={menu}
        isLink={false}
      />
      {outgoingStreams.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromOutgoingStreamInfo(stream);
        };

        const title = stream.title ? stream.title : "Unknown outgoing stream";

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
          >
            <ResumeItem
              id={index}
              title={title}
              status={stream.status}
              subtitle={stream.amount}
              resume={stream.resume}
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
            />
          </div>
        )
      })}
      {streamingAccounts.map((stream, index) => {
        const onSelectedStreamingAccount = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromStreamingAccountDetails(stream);
        }

        const title = stream.title ? stream.title : "Unknown streaming account";

        return (
          <div 
            key={index}
          >
            <ResumeItem
              title={title}
              classNameTitle="text-uppercase"
              subtitle={stream.subtitle}
              amount={stream.amount}
              resume={stream.resume}
              className="account-category-title"
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
              onClick={onSelectedStreamingAccount}
            />
          </div>
        )
      })}
      {teamSalary.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromOutgoingStreamInfo(stream);
        };

        const title = stream.title ? stream.title : "Unknown salary";

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
            >
              <ResumeItem
                id={index}
                title={title}
                status={stream.status}
                subtitle={stream.amount}
                resume={stream.resume}
                hasRightIcon={true}
                rightIcon={<IconArrowForward className="mean-svg-icons" />}
                isLink={true}
              />
          </div>
        )
      })}
    </>
  );

  // Tabs
  const tabs = [
    {
      id: "summary",
      name: "Summary",
      render: renderSummary
    },
    {
      id: "incoming",
      name: "Incoming (3)",
      render: renderListOfIncomingStreams
    },
    {
      id: "outgoing",
      name: "Outgoing (4)",
      render: renderListOfOutgoingStreams
    },
  ];

  return (
    <>
      <RightInfoDetails
        infoData={infoData}
      />

      <Row gutter={[8, 8]} className="safe-btns-container mb-1">
        <Col xs={24} sm={24} md={24} lg={24} className="btn-group">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={showCreateStreamModal}>
              <div className="btn-content">
                Create stream
              </div>
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={showOpenTreasuryModal}>
              <div className="btn-content">
                Find money stream
              </div>
          </Button>
        </Col>
      </Row>

      <TabsMean
        tabs={tabs}
        defaultTab="summary"
      />

      {/* TODO: Here the multisig ID is used */}
      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={
            treasuryDetails
              ? (treasuryDetails as Treasury).version && (treasuryDetails as Treasury).version >= 2
                ? (treasuryDetails as Treasury).associatedToken as string
                : (treasuryDetails as TreasuryInfo).associatedTokenAddress as string
              : ''
          }
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={treasuryDetails}
          isMultisigTreasury={isMultisigTreasury()}
          minRequiredBalance={minRequiredBalance}
          multisigClient={multisigClient}
          multisigAddress={getSelectedTreasuryMultisig()}
          userBalances={userBalances}
        />
      )}

      {isOpenTreasuryModalVisible && (
        <TreasuryOpenModal
          isVisible={isOpenTreasuryModalVisible}
          handleOk={onAcceptOpenTreasury}
          handleClose={closeOpenTreasuryModal}
        />
      )}
    </>
  )
}