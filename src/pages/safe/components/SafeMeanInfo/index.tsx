import './style.scss';

import { IconApprove, IconArrowForward, IconCheckCircle, IconCreated, IconCross, IconMinus } from "../../../../Icons"
import { formatThousands, getTokenByMintAddress, makeDecimal, shortenAddress } from "../../../../utils/utils";
import { Button, Col, Row, Spin } from "antd"
import { SafeInfo } from "../UI/SafeInfo";
import { MeanMultisig, MultisigTransaction } from '@mean-dao/mean-multisig-sdk';
import { ProgramAccounts } from '../../../../utils/accounts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Connection, MemcmpFilter, PublicKey } from '@solana/web3.js';
import { useConnectionConfig } from '../../../../contexts/connection';
import { consoleOut } from '../../../../utils/ui';
// import { useWallet } from '../../../../contexts/wallet';
import { ResumeItem } from '../UI/ResumeItem';
import { program } from '@project-serum/anchor/dist/cjs/spl/token';
import { FALLBACK_COIN_IMAGE } from '../../../../constants';
import { MultisigVault } from '../../../../models/multisig';
import { Identicon } from '../../../../components/Identicon';
import { BN } from 'bn.js';
import { u64 } from '@solana/spl-token';
import { MEAN_MULTISIG } from '../../../../utils/ids';
import { ACCOUNT_LAYOUT } from '../../../../utils/layouts';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export const SafeMeanInfo = (props: {
  connection: Connection;
  isSafeDetails: boolean;
  isProgramDetails: boolean;
  isAssetDetails: boolean;
  onDataToSafeView: any;
  onDataToProgramView: any;
  onDataToAssetView: any;
  selectedMultisig?: any;
  onEditMultisigClick: any;
  onNewCreateAssetClick: any;
  onNewProposalMultisigClick: any;
  // multisigVaults: MultisigVault[];
  multisigClient: MeanMultisig | null;
  multisigTxs: MultisigTransaction[];
  selectedTab?: any;
}) => {

  const {
    connection,
    isSafeDetails, 
    isProgramDetails, 
    multisigTxs, 
    selectedMultisig, 
    onEditMultisigClick, 
    onNewProposalMultisigClick, 
    onNewCreateAssetClick,
    selectedTab,
    multisigClient,
    isAssetDetails
  } = props;

  // const { publicKey } = useWallet();
  const connectionConfig = useConnectionConfig();

  const [programs, setPrograms] = useState<ProgramAccounts[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<ProgramAccounts | undefined>(undefined);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [multisigVaults, setMultisigVaults] = useState<any[]>([]);

  useEffect(() => {
    if (selectedMultisig) {
      setLoadingProposals(true);
      setLoadingAssets(true);
      setLoadingPrograms(true);
    }
  }, [selectedMultisig]);

  // Proposals list
  useEffect(() => {
    if (multisigTxs || (isSafeDetails)) {
      setLoadingProposals(false);
    } else {
      setLoadingProposals(true);
    }
  }, [isSafeDetails, multisigTxs]);

  const renderListOfProposals = (
    <>
      {!loadingProposals ? (
        (multisigTxs && multisigTxs.length > 0) ? (
          multisigTxs.map((proposal, index) => {
            const onSelectProposal = () => {
              // Sends isSafeDetails value to the parent component "SafeView"
              props.onDataToSafeView(proposal);
            };

          // Number of participants who have already approved the Tx
          const approvedSigners = proposal.signers.filter((s: any) => s === true).length;
          const expirationDate = proposal.details.expirationDate ? proposal.details.expirationDate.toDateString() : "";
          const executedOnDate = proposal.executedOn ? proposal.executedOn.toDateString() : "";

            return (
              <div 
                key={index}
                onClick={onSelectProposal}
                className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <ResumeItem
                    id={proposal.id.toBase58()}
                    // logo={proposal.logo}
                    title={proposal.details.title}
                    expires={expirationDate}
                    executedOn={executedOnDate}
                    approved={approvedSigners}
                    // rejected={proposal.rejected}
                    status={proposal.status}
                    isSafeDetails={isSafeDetails}
                  />
              </div>
            )
          })
        ) : (
          <span>This multisig has no proposals</span>
        )
      ) : (
        <span>Loading proposals ...</span>
      )}
    </>
  );

  // Assets list
  useEffect(() => {
    if (multisigVaults || (isAssetDetails)) {
      setLoadingAssets(false);
    } else {
      setLoadingAssets(true);
    }
  }, [isAssetDetails, multisigVaults]);

  const renderListOfAssets = (
    <>
      {!loadingAssets ? (
        (multisigVaults && multisigVaults.length > 0) ? (
          multisigVaults.map((asset, index) => {
            const onSelectAsset = () => {
              // Sends isProgramDetails value to the parent component "SafeView"
              props.onDataToAssetView(asset);
              // setSelectedAsset(asset);
              // setDtailsPanelOpen(true);
              consoleOut('selected asset:', asset, 'blue');
              // setLoadingMultisigTxs(true);
            };

            // const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
            //   event.currentTarget.src = FALLBACK_COIN_IMAGE;
            //   event.currentTarget.className = "error";
            // };

            // const tokenIcon = (
            //   <div className="token-icon">
            //     {token && token.logoURI && (
            //       <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
            //     ) : (
            //       <Identicon address={new PublicKey(asset.mint).toBase58()} style={{
            //         width: "30",
            //         display: "inline-flex",
            //         height: "30",
            //         overflow: "hidden",
            //         borderRadius: "50%"
            //       }} />
            //     )}
            //   </div>
            // )

            const token = getTokenByMintAddress(asset.mint.toBase58());
            const tokenIcon = token && token.logoURI;
            const assetToken = token && token.symbol;
            const assetAddress = shortenAddress(asset.address.toBase58(), 8);
            const assetAmount = token && formatThousands(makeDecimal(asset.amount, token.decimals), token.decimals);          

            return (
              <div 
                key={`${asset.address.toBase58() + 60}`}
                onClick={onSelectAsset}
                className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <ResumeItem
                    id={`${index + 61}`}
                    logo={tokenIcon}
                    title={assetToken}
                    subtitle={assetAddress}
                    isAsset={true}
                    rightContent={assetAmount}
                    isSafeDetails={isSafeDetails}
                    isAssetDetails={isAssetDetails}
                  />
              </div>
            );
          })
        ) : (
          <span>This multisig has no assets</span>
        )
      ) : (
        <span>Loading assets ...</span>
      )}
    </>
  );

  // Settings
  // const renderSettings = (
  //   <>
  //     <Row gutter={[8, 8]}>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Minimum cool-off period:</Col>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">24 hours</Col>
  //     </Row>
  //     <Row gutter={[8, 8]}>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-right pr-1">Single signer balance threshold:</Col>
  //       <Col xs={12} sm={12} md={12} lg={12} className="text-left pl-1">$100.00</Col>
  //     </Row>
  //   </>
  // );

  // // Activities list 
  // const renderActivities= (
  //   <>
  //     {/* {proposals && proposals.length && (
  //       proposals.map((proposal) => (
  //         proposal.activities.map((activity: any) => {

  //           let icon = null;

  //           switch (activity.description) {
  //             case 'approved':
  //               icon = <IconApprove className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'rejected':
  //               icon = <IconCross className="mean-svg-icons fg-red" />;
  //               break;
  //             case 'passed':
  //               icon = <IconCheckCircle className="mean-svg-icons fg-green" />;
  //               break;
  //             case 'created':
  //               icon = <IconCreated className="mean-svg-icons fg-purple" />;
  //               break;
  //             case 'deleted':
  //               icon = <IconMinus className="mean-svg-icons fg-purple" />;
  //               break;
  //             default:
  //               icon = "";
  //               break;
  //           }

  //           return (
  //             <div 
  //               key={activity.id}
  //               className={`d-flex w-100 align-items-center activities-list ${activity.id % 2 === 0 ? '' : 'background-gray'}`}
  //               >
  //                 <div className="list-item">
  //                   <span className="mr-2">
  //                       {activity.date}
  //                   </span>
  //                   {icon}
  //                   <span>
  //                     {`Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
  //                   </span>
  //                 </div>
  //             </div>
  //           )
  //         })
  //       ))
  //     )} */}
  //   </>
  // );

  // Programs list
  const getProgramsByUpgradeAuthority = useCallback(async (upgradeAuthority: PublicKey): Promise<ProgramAccounts[] | undefined> => {

    if (!connection || !upgradeAuthority) { return undefined; }

    consoleOut(`Searching for programs with upgrade authority: ${upgradeAuthority}`);

    // 1. Fetch executable data account having upgradeAuthority as upgrade authority
    const BPFLoaderUpgradeab1e = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    const executableDataAccountsFilter: MemcmpFilter = { memcmp: { offset: 13, bytes: upgradeAuthority.toBase58() } }
    const executableDataAccounts = await connection.getProgramAccounts(
      BPFLoaderUpgradeab1e,
      {
        encoding: "base64",
        filters: [
          executableDataAccountsFilter
        ]
      });

    // 2. For each executable data account found in the previous step, fetch the corresponding program
    const programs: ProgramAccounts[] = [];
    for (let i = 0; i < executableDataAccounts.length; i++) {
      const executableData = executableDataAccounts[i].pubkey;

      const executableAccountsFilter: MemcmpFilter = { memcmp: { offset: 4, bytes: executableData.toBase58() } }
      const executableAccounts = await connection.getProgramAccounts(
        BPFLoaderUpgradeab1e,
        {
          encoding: "base64",
          dataSlice: {
            offset: 0,
            length: 0
          },
          filters: [
            executableAccountsFilter
          ]
        });

      if (executableAccounts.length === 0) {
        continue;
      }

      if (executableAccounts.length > 1) {
        throw new Error(`More than one program was found for program data account '${executableData}'`);
      }

      const foundProgram = {
        pubkey: executableAccounts[0].pubkey,
        owner: executableAccounts[0].account.owner,
        executable: executableData,
        upgradeAuthority: upgradeAuthority,
        size: executableDataAccounts[i].account.data.byteLength

      } as ProgramAccounts;

      consoleOut(`Upgrade Authority: ${upgradeAuthority} --> Executable Data: ${executableData} --> Program: ${foundProgram}`);

      programs.push(foundProgram);

    }

    consoleOut(`${programs.length} programs found!`);

    return programs;

  }, [connection]);

  // Get Programs
  useEffect(() => {

    if (!connection || !selectedMultisig || !selectedMultisig.authority) { return; }

    const timeout = setTimeout(() => {
      getProgramsByUpgradeAuthority(selectedMultisig.authority)
      .then(progs => {
        consoleOut('programs:', progs, 'blue');
        setPrograms(progs || []);
      })
      .catch(error => console.error(error))
      .finally(() => setLoadingPrograms(false));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    selectedProgram,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
  ]);

  const getMultisigVaults = useCallback(async (
    connection: Connection,
    multisig: PublicKey

  ) => {

    const [multisigSigner] = await PublicKey.findProgramAddress(
      [multisig.toBuffer()],
      MEAN_MULTISIG
    );

    const accountInfos = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 32, bytes: multisigSigner.toBase58() } }, 
        { dataSize: ACCOUNT_LAYOUT.span }
      ],
    });

    if (!accountInfos || !accountInfos.length) { return []; }

    const results = accountInfos.map((t: any) => {
      const tokenAccount = ACCOUNT_LAYOUT.decode(t.account.data);
      tokenAccount.address = t.pubkey;
      return tokenAccount;
    });

    consoleOut('multisig assets:', results, 'blue');
    return results;

  },[]);

  // Get Multisig Vaults
  useEffect(() => {

    if (!multisigClient || !selectedMultisig || !selectedMultisig.id) {
      return;
    }

    const program = multisigClient.getProgram();
    const timeout = setTimeout(() => {
      getMultisigVaults(program.provider.connection, selectedMultisig.id)
        .then(result => setMultisigVaults(result))
        .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    getMultisigVaults,
    multisigClient, 
    selectedMultisig
  ]);

  useEffect(() => {
    if (programs || (isProgramDetails)) {
      setLoadingPrograms(false);
    } else {
      setLoadingPrograms(true);
    }
  }, [isProgramDetails, programs]);

  const renderListOfPrograms = (
    <>
      {!loadingPrograms ? (
        (programs && programs.length > 0) ? (
          programs.map((program, index) => {
            const onSelectProgram = () => {
              // Sends isProgramDetails value to the parent component "SafeView"
              props.onDataToProgramView(program);
            }
  
            const programTitle = shortenAddress(program.pubkey.toBase58(), 4);
  
            return (
              <div 
                key={`${index + 1}`}
                onClick={onSelectProgram}
                className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
              >
                  <ResumeItem
                    id={program.pubkey.toBase58()}
                    title={programTitle}
                    isSafeDetails={isSafeDetails}
                    isProgram={true}
                    programSize={program.size}
                    isProgramDetails={isProgramDetails}
                  />
              </div>
            )
          })
        ) : (
          <span>This multisig has no programs</span>
        )
      ) : (
        <span>Loading programs ...</span>
      )}
    </>
  );

  // Tabs
  const tabs = [
    {
      name: "Proposals",
      render: renderListOfProposals
    }, 
    {
      name: "Assets",
      render: renderListOfAssets
    }, 
    // {
    //   name: "Settings",
    //   render: renderSettings
    // }, 
    // {
    //   name: "Activity",
    //   render: renderActivities
    // }, 
    {
      name: "Programs",
      render: renderListOfPrograms
    }
  ];

  return (
    <>
      <SafeInfo
        selectedMultisig={selectedMultisig}
        onNewProposalMultisigClick={onNewProposalMultisigClick}
        onEditMultisigClick={onEditMultisigClick}
        onNewCreateAssetClick={onNewCreateAssetClick}
        tabs={tabs}
        selectedTab={selectedTab}
      />
    </>
  )
}