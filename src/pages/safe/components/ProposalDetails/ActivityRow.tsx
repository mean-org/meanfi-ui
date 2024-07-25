import type { MultisigTransactionActivityItem } from '@mean-dao/mean-multisig-sdk';
import { IconExternalLink } from 'Icons';
import { SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from 'app-constants/common';
import { getSolanaExplorerClusterParam } from 'contexts/connection';
import dayjs from 'dayjs';
import { shortenAddress } from 'middleware/utils';
import ActivityIcon from './ActivityIcon';

interface Props {
  activity: MultisigTransactionActivityItem;
  onCopyAddress: (address: string) => void;
}

const ActivityRow = ({ activity, onCopyAddress }: Props) => {
  const title = dayjs(activity.createdOn).format('LLL').toLocaleString();

  const resume = (
    <div className='d-flex align-items-center activity-container'>
      <div className='d-flex align-items-center'>
        <ActivityIcon activity={activity} /> {`Proposal ${activity.action} by ${activity.owner.name} `}
      </div>
      <div
        onClick={() => onCopyAddress(activity.address)}
        onKeyDown={() => {}}
        className='simplelink underline-on-hover activity-address ml-1'
      >
        ({shortenAddress(activity.address, 4)})
      </div>
    </div>
  );

  return (
    <div
      key={`${activity.index + 1}`}
      className={`w-100 activities-list mr-1 pr-4 ${(activity.index + 1) % 2 === 0 ? '' : 'bg-secondary-02'}`}
    >
      <div className='resume-item-container'>
        <div className='d-flex'>
          <span className='mr-1'>{title}</span>
          {resume}
        </div>
        <span className='icon-button-container icon-stream-row'>
          <a
            target='_blank'
            rel='noopener noreferrer'
            href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${activity.address}${getSolanaExplorerClusterParam()}`}
          >
            <IconExternalLink className='mean-svg-icons external-icon ml-1' />
          </a>
        </span>
      </div>
    </div>
  );
};

export default ActivityRow;
