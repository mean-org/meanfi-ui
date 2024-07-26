import type { MultisigTransactionActivityItem } from '@mean-dao/mean-multisig-sdk';
import { IconApprove, IconCreated, IconCross, IconMinus } from 'Icons';

interface Props {
  activity: MultisigTransactionActivityItem;
}

const ActivityIcon = ({ activity }: Props) => {
  switch (activity.action) {
    case 'created':
      return <IconCreated className='mean-svg-icons fg-purple activity-icon' />;
    case 'approved':
      return <IconApprove className='mean-svg-icons fg-green activity-icon' />;
    case 'executed':
      return <IconApprove className='mean-svg-icons fg-green activity-icon' />;
    case 'rejected':
      return <IconCross className='mean-svg-icons fg-red activity-icon' />;
    case 'deleted':
      return <IconMinus className='mean-svg-icons fg-yellow activity-icon' />;
    default:
      return null;
  }
};

export default ActivityIcon;
