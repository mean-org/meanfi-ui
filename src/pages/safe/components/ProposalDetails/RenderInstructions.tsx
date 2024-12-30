import type { InstructionDataInfo, OwnerMeta } from '@mean-dao/mean-multisig-sdk';
import { BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { type Connection, SystemProgram } from '@solana/web3.js';
import { Col, Row, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconExternalLink } from 'src/Icons';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from 'src/app-constants/common';
import { openNotification } from 'src/components/Notifications';
import { AppStateContext } from 'src/contexts/appstate';
import { getSolanaExplorerClusterParam } from 'src/contexts/connection';
import getWalletOwnerOfTokenAccount from 'src/middleware/getWalletOwnerOfTokenAccount';
import { getMultisigProgramId } from 'src/middleware/multisig-helpers';
import { consoleOut, copyText, getDurationUnitFromSeconds } from 'src/middleware/ui';
import { displayAmountWithSymbol, formatThousands, getTokenOrCustomToken, makeDecimal } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { MultisigTransactionInstructionInfo } from 'src/models/multisig';

export const RenderInstructions = (props: {
  connection: Connection;
  proposalIxInfo: MultisigTransactionInstructionInfo | null;
}) => {
  const { connection, proposalIxInfo } = props;

  const { splTokenList, getTokenByMintAddress } = useContext(AppStateContext);

  const { t } = useTranslation('common');
  const [proposalIxAssociatedToken, setProposalIxAssociatedToken] = useState<TokenInfo | undefined>(undefined);
  const [transferDestinationOwner, setTransferDestinationOwner] = useState<string>();

  const multisigAddressPK = useMemo(() => getMultisigProgramId(), []);

  const copyAddressToClipboard = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (address: any) => {
      if (copyText(address.toString())) {
        openNotification({
          description: t('notifications.account-address-copied-message'),
          type: 'info',
        });
      } else {
        openNotification({
          description: t('notifications.account-address-not-copied-message'),
          type: 'error',
        });
      }
    },
    [t],
  );

  const getTokenAmountValue = (item: InstructionDataInfo) => {
    switch (item.label) {
      case 'CliffVestPercent':
        return `${makeDecimal(new BN(item.value as string), 4)}%`;
      case 'RateIntervalInSeconds':
        return `${formatThousands(+item.value)}s (${getDurationUnitFromSeconds(+item.value)})`;
      case 'StartUtc':
        return dayjs(+item.value).format('LLL').toLocaleString();
      case 'Amount':
      case 'RateAmountUnits':
      case 'AllocationAssignedUnits':
        return proposalIxAssociatedToken
          ? displayAmountWithSymbol(
              item.value as string,
              proposalIxAssociatedToken.address,
              proposalIxAssociatedToken.decimals,
              splTokenList,
            )
          : `${item.value}`;
      default:
        return `${item.value}`;
    }
  };

  // Set Proposal Instruction Associated Token
  useEffect(() => {
    if (!proposalIxInfo?.accounts || proposalIxInfo.accounts.length === 0) {
      return;
    }
    const idx = proposalIxInfo.accounts.findIndex(p => p.label === 'Associated Token');
    if (idx === -1) {
      setProposalIxAssociatedToken(undefined);
    } else {
      const associatedToken = proposalIxInfo.accounts[idx].value;
      getTokenOrCustomToken(connection, associatedToken, getTokenByMintAddress).then(token => {
        consoleOut('proposal Associated Token ->', token, 'blue');
        setProposalIxAssociatedToken(token);
      });
    }
  }, [connection, getTokenByMintAddress, proposalIxInfo]);

  useEffect(() => {
    if (
      proposalIxInfo?.programId !== TOKEN_PROGRAM_ID.toBase58() ||
      !proposalIxInfo?.accounts ||
      proposalIxInfo.accounts.length === 0
    ) {
      return;
    }

    const targetAccount = proposalIxInfo.accounts.find(p => p.label === 'Destination');
    if (!targetAccount) {
      setTransferDestinationOwner(undefined);
      return;
    }

    getWalletOwnerOfTokenAccount(connection, targetAccount.value).then(owner => {
      setTransferDestinationOwner(owner);
    });
  }, [connection, proposalIxInfo]);

  return (
    <>
      {proposalIxInfo ? (
        <div className='safe-details-collapse w-100 pl-1 pr-4'>
          {/* Instruction program */}
          <Row gutter={[8, 8]} className='mb-2 mt-2' key='programs'>
            <Col xs={6} sm={6} md={4} lg={4} className='pr-1'>
              <span className='info-label'>{t('multisig.proposal-modal.instruction-program')}</span>
            </Col>
            <Col xs={17} sm={17} md={19} lg={19} className='pl-1 pr-3'>
              <span
                onKeyDown={() => {}}
                onClick={() => copyAddressToClipboard(proposalIxInfo.programId)}
                className='d-block info-data simplelink underline-on-hover text-truncate'
                style={{ cursor: 'pointer' }}
              >
                {proposalIxInfo.programName
                  ? `${proposalIxInfo.programName} (${proposalIxInfo.programId})`
                  : proposalIxInfo.programId}
              </span>
            </Col>
            <Col xs={1} sm={1} md={1} lg={1}>
              <a
                target='_blank'
                rel='noopener noreferrer'
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                  proposalIxInfo.programId
                }${getSolanaExplorerClusterParam()}`}
              >
                <IconExternalLink className='mean-svg-icons external-icon' />
              </a>
            </Col>
          </Row>

          {/* Instruction accounts */}
          {proposalIxInfo.accounts.map(account => {
            return (
              <Fragment key={`account-${account.index}-${account.label}`}>
                <Row gutter={[8, 8]} className='mb-2'>
                  <Col xs={6} sm={6} md={4} lg={4} className='pr-1'>
                    <span className='info-label'>
                      {account.label || t('multisig.proposal-modal.instruction-account')}
                    </span>
                  </Col>
                  <Col xs={17} sm={17} md={19} lg={19} className='pl-1 pr-3'>
                    <span
                      onKeyDown={() => {}}
                      onClick={() => copyAddressToClipboard(account.value)}
                      className='d-block info-data simplelink underline-on-hover text-truncate'
                      style={{ cursor: 'pointer' }}
                    >
                      {account.value}
                    </span>
                  </Col>
                  <Col xs={1} sm={1} md={1} lg={1}>
                    <a
                      target='_blank'
                      rel='noopener noreferrer'
                      href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${account.value}${getSolanaExplorerClusterParam()}`}
                    >
                      <IconExternalLink className='mean-svg-icons external-icon' />
                    </a>
                  </Col>
                </Row>
                {account.label === 'Destination' &&
                transferDestinationOwner &&
                transferDestinationOwner !== SystemProgram.programId.toBase58() ? (
                  <Row gutter={[8, 8]} className='mb-2' key={`item-${account.index}-${account.label}`}>
                    <Col xs={6} sm={6} md={4} lg={4} className='pr-1'>
                      <span className='info-label'>Owner</span>
                    </Col>
                    <Col xs={17} sm={17} md={19} lg={19} className='pl-1 pr-3'>
                      <span
                        onKeyDown={() => {}}
                        onClick={() => copyAddressToClipboard(transferDestinationOwner)}
                        className='d-block info-data simplelink underline-on-hover text-truncate'
                        style={{ cursor: 'pointer' }}
                      >
                        {transferDestinationOwner}
                      </span>
                    </Col>
                    <Col xs={1} sm={1} md={1} lg={1}>
                      <a
                        target='_blank'
                        rel='noopener noreferrer'
                        href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${transferDestinationOwner}}${getSolanaExplorerClusterParam()}`}
                      >
                        <IconExternalLink className='mean-svg-icons external-icon' />
                      </a>
                    </Col>
                  </Row>
                ) : null}
              </Fragment>
            );
          })}

          {proposalIxInfo.programId === multisigAddressPK.toBase58()
            ? proposalIxInfo.data.map(item => {
                return (
                  <Row gutter={[8, 8]} className='mb-2' key={`more-items-${item.index}`}>
                    {item.label && (
                      <Col xs={6} sm={6} md={4} lg={4} className='pr-1 text-truncate'>
                        <Tooltip placement='right' title={item.label || ''}>
                          <span className='info-label'>
                            {item.label || t('multisig.proposal-modal.instruction-data')}
                          </span>
                        </Tooltip>
                      </Col>
                    )}
                    {item.label === 'Owners' ? (
                      <>
                        {(item.value as OwnerMeta[]).map(owner => {
                          return (
                            <Row key={`owners-${owner.label}`} className='pr-1'>
                              <Col xs={6} sm={6} md={4} lg={4} className='pl-1 pr-1 text-truncate'>
                                <Tooltip placement='right' title={owner.label || ''}>
                                  <span className='info-label'>
                                    {owner.label || t('multisig.proposal-modal.instruction-data')}
                                  </span>
                                </Tooltip>
                              </Col>
                              <Col xs={17} sm={17} md={19} lg={19} className='pl-1 pr-3'>
                                <span
                                  onKeyDown={() => {}}
                                  onClick={() => copyAddressToClipboard(owner.data)}
                                  className='d-block info-data simplelink underline-on-hover text-truncate'
                                  style={{ cursor: 'pointer' }}
                                >
                                  {owner.data}
                                </span>
                              </Col>
                              <Col xs={1} sm={1} md={1} lg={1}>
                                <a
                                  target='_blank'
                                  rel='noopener noreferrer'
                                  href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                                    owner.data
                                  }${getSolanaExplorerClusterParam()}`}
                                >
                                  <IconExternalLink className='mean-svg-icons external-icon' />
                                </a>
                              </Col>
                            </Row>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        <Col xs={17} sm={17} md={19} lg={19} className='pl-1 pr-3' key='loquejea'>
                          <span className='d-block info-data text-truncate' style={{ cursor: 'pointer' }}>
                            {`${item.value}`}
                          </span>
                        </Col>
                      </>
                    )}
                  </Row>
                );
              })
            : proposalIxInfo.data.map(item => {
                if (!item.label || !item.value) {
                  return null;
                }
                return (
                  <Row gutter={[8, 8]} className='mb-2' key={`data-${item.index}`}>
                    <Col xs={6} sm={6} md={4} lg={4} className='pr-1 text-truncate'>
                      <Tooltip placement='right' title={item.label || ''}>
                        <span className='info-label'>
                          {item.label || t('multisig.proposal-modal.instruction-data')}
                        </span>
                      </Tooltip>
                    </Col>
                    <Col xs={17} sm={17} md={19} lg={19} className='pl-1 pr-3'>
                      <span className='d-block info-data text-truncate' style={{ cursor: 'pointer' }}>
                        {getTokenAmountValue(item)}
                      </span>
                    </Col>
                  </Row>
                );
              })}
        </div>
      ) : (
        <span className='pl-1'>Loading instruction...</span>
      )}
    </>
  );
};
