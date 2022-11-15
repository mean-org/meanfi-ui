import { Connection, PublicKey } from '@solana/web3.js';
import { Col, Row, Tooltip } from 'antd';
import BN from 'bn.js';
import { openNotification } from 'components/Notifications';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam } from 'contexts/connection';
import { IconExternalLink } from 'Icons';
import { appConfig } from 'index';
import {
  consoleOut,
  copyText,
  getDurationUnitFromSeconds,
} from 'middleware/ui';
import {
  displayAmountWithSymbol,
  formatThousands,
  getTokenOrCustomToken,
  makeDecimal,
} from 'middleware/utils';
import {
  InstructionAccountInfo,
  InstructionDataInfo,
  MultisigTransactionInstructionInfo,
} from 'models/multisig';
import { TokenInfo } from 'models/SolanaTokenInfo';
import moment from 'moment';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const RenderInstructions = (props: {
  connection: Connection;
  proposalIxInfo: MultisigTransactionInstructionInfo | null;
}) => {
  const { connection, proposalIxInfo } = props;

  const { splTokenList, getTokenByMintAddress } = useContext(AppStateContext);

  const { t } = useTranslation('common');
  const [proposalIxAssociatedToken, setProposalIxAssociatedToken] = useState<
    TokenInfo | undefined
  >(undefined);

  const multisigAddressPK = useMemo(
    () => new PublicKey(appConfig.getConfig().multisigProgramAddress),
    [],
  );

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback(
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
        return `${makeDecimal(new BN(item.value), 4)}%`;
      case 'RateIntervalInSeconds':
        return `${formatThousands(item.value)}s (${getDurationUnitFromSeconds(
          +item.value,
        )})`;
      case 'StartUtc':
        return moment(+item.value)
          .format('LLL')
          .toLocaleString();
      case 'Amount':
      case 'RateAmountUnits':
      case 'AllocationAssignedUnits':
        return proposalIxAssociatedToken
          ? displayAmountWithSymbol(
              item.value,
              proposalIxAssociatedToken.address,
              proposalIxAssociatedToken.decimals,
              splTokenList,
            )
          : item.value;
      default:
        return item.value;
    }
  };

  useEffect(() => {
    if (
      !proposalIxInfo ||
      !proposalIxInfo.accounts ||
      proposalIxInfo.accounts.length === 0
    ) {
      return undefined;
    }
    const idx = proposalIxInfo.accounts.findIndex(
      p => p.label === 'Associated Token',
    );
    if (idx !== -1) {
      const associatedToken = proposalIxInfo.accounts[idx].value;
      getTokenOrCustomToken(
        connection,
        associatedToken,
        getTokenByMintAddress,
      ).then(token => {
        consoleOut('proposal Associated Token ->', token, 'blue');
        setProposalIxAssociatedToken(token);
      });
    } else {
      setProposalIxAssociatedToken(undefined);
    }
  }, [connection, getTokenByMintAddress, proposalIxInfo]);

  return (
    <>
      {proposalIxInfo ? (
        <div className="safe-details-collapse w-100 pl-1 pr-4">
          <Row gutter={[8, 8]} className="mb-2 mt-2" key="programs">
            <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
              <span className="info-label">
                {t('multisig.proposal-modal.instruction-program')}
              </span>
            </Col>
            <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
              <span
                onClick={() => copyAddressToClipboard(proposalIxInfo.programId)}
                className="d-block info-data simplelink underline-on-hover text-truncate"
                style={{ cursor: 'pointer' }}
              >
                {proposalIxInfo.programName
                  ? `${proposalIxInfo.programName} (${proposalIxInfo.programId})`
                  : proposalIxInfo.programId}
              </span>
            </Col>
            <Col xs={1} sm={1} md={1} lg={1}>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                  proposalIxInfo.programId
                }${getSolanaExplorerClusterParam()}`}
              >
                <IconExternalLink className="mean-svg-icons external-icon" />
              </a>
            </Col>
          </Row>

          {proposalIxInfo.accounts.map(
            (account: InstructionAccountInfo, index: number) => {
              return (
                <Row gutter={[8, 8]} className="mb-2" key={`item-${index}`}>
                  <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                    <span className="info-label">
                      {account.label ||
                        t('multisig.proposal-modal.instruction-account')}
                    </span>
                  </Col>
                  <Col xs={17} sm={17} md={19} lg={19} className="pl-1 pr-3">
                    <span
                      onClick={() => copyAddressToClipboard(account.value)}
                      className="d-block info-data simplelink underline-on-hover text-truncate"
                      style={{ cursor: 'pointer' }}
                    >
                      {account.value}
                    </span>
                  </Col>
                  <Col xs={1} sm={1} md={1} lg={1}>
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                        account.value
                      }${getSolanaExplorerClusterParam()}`}
                    >
                      <IconExternalLink className="mean-svg-icons external-icon" />
                    </a>
                  </Col>
                </Row>
              );
            },
          )}

          {proposalIxInfo.programId === multisigAddressPK.toBase58()
            ? proposalIxInfo.data.map(
                (item: InstructionDataInfo, index: number) => {
                  return (
                    <Row
                      gutter={[8, 8]}
                      className="mb-2"
                      key={`more-items-${index}`}
                    >
                      {item.label && (
                        <Col
                          xs={6}
                          sm={6}
                          md={4}
                          lg={4}
                          className="pr-1 text-truncate"
                        >
                          <Tooltip placement="right" title={item.label || ''}>
                            <span className="info-label">
                              {item.label ||
                                t('multisig.proposal-modal.instruction-data')}
                            </span>
                          </Tooltip>
                        </Col>
                      )}
                      {item.label === 'Owners' ? (
                        <>
                          {item.value.map((owner: any, idx: number) => {
                            return (
                              <Row key={`owners-${idx}`} className="pr-1">
                                <Col
                                  xs={6}
                                  sm={6}
                                  md={4}
                                  lg={4}
                                  className="pl-1 pr-1 text-truncate"
                                >
                                  <Tooltip
                                    placement="right"
                                    title={owner.label || ''}
                                  >
                                    <span className="info-label">
                                      {owner.label ||
                                        t(
                                          'multisig.proposal-modal.instruction-data',
                                        )}
                                    </span>
                                  </Tooltip>
                                </Col>
                                <Col
                                  xs={17}
                                  sm={17}
                                  md={19}
                                  lg={19}
                                  className="pl-1 pr-3"
                                >
                                  <span
                                    onClick={() =>
                                      copyAddressToClipboard(owner.data)
                                    }
                                    className="d-block info-data simplelink underline-on-hover text-truncate"
                                    style={{ cursor: 'pointer' }}
                                  >
                                    {owner.data}
                                  </span>
                                </Col>
                                <Col xs={1} sm={1} md={1} lg={1}>
                                  <a
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${
                                      owner.data
                                    }${getSolanaExplorerClusterParam()}`}
                                  >
                                    <IconExternalLink className="mean-svg-icons external-icon" />
                                  </a>
                                </Col>
                              </Row>
                            );
                          })}
                        </>
                      ) : (
                        <>
                          <Col
                            xs={17}
                            sm={17}
                            md={19}
                            lg={19}
                            className="pl-1 pr-3"
                            key="loquejea"
                          >
                            <span
                              className="d-block info-data text-truncate"
                              style={{ cursor: 'pointer' }}
                            >
                              {item.value}
                            </span>
                          </Col>
                        </>
                      )}
                    </Row>
                  );
                },
              )
            : proposalIxInfo.data.map(
                (item: InstructionDataInfo, index: number) => {
                  return (
                    item.label &&
                    item.value && (
                      <Row
                        gutter={[8, 8]}
                        className="mb-2"
                        key={`data-${index}`}
                      >
                        <Col
                          xs={6}
                          sm={6}
                          md={4}
                          lg={4}
                          className="pr-1 text-truncate"
                        >
                          <Tooltip placement="right" title={item.label || ''}>
                            <span className="info-label">
                              {item.label ||
                                t('multisig.proposal-modal.instruction-data')}
                            </span>
                          </Tooltip>
                        </Col>
                        <Col
                          xs={17}
                          sm={17}
                          md={19}
                          lg={19}
                          className="pl-1 pr-3"
                        >
                          <span
                            className="d-block info-data text-truncate"
                            style={{ cursor: 'pointer' }}
                          >
                            {getTokenAmountValue(item)}
                          </span>
                        </Col>
                      </Row>
                    )
                  );
                },
              )}
        </div>
      ) : (
        <span className="pl-1">Loading instruction...</span>
      )}
    </>
  );
};
