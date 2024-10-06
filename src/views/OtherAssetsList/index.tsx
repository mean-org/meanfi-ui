import { LoadingOutlined } from '@ant-design/icons';
import { Empty, Spin } from 'antd';
import { useLocation } from 'react-router-dom';
import { Identicon } from 'src/components/Identicon';
import { formatThousands, shortenAddress } from 'src/middleware/utils';
import type { ProgramAccounts } from 'src/models/accounts';

const loadIndicator = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface OtherAssetsListProps {
  loadingPrograms: boolean;
  onProgramSelected?: (program: ProgramAccounts) => void;
  programs?: ProgramAccounts[];
  selectedProgram: ProgramAccounts | undefined;
}

export const OtherAssetsList = ({
  loadingPrograms,
  onProgramSelected,
  programs,
  selectedProgram,
}: OtherAssetsListProps) => {
  const location = useLocation();

  const getActiveClass = (program: ProgramAccounts) => {
    if (selectedProgram?.pubkey.equals(program.pubkey) && location.pathname.startsWith('/programs/')) {
      return 'selected';
    }
    return '';
  };

  if (loadingPrograms) {
    return (
      <div key='asset-category-other-assets-items' className='asset-category flex-column flex-center h-75'>
        <Spin indicator={loadIndicator} />
      </div>
    );
  }
  if (!loadingPrograms && (!programs || programs.length === 0)) {
    return (
      <div key='asset-category-other-assets-items' className='asset-category flex-column flex-center h-75'>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span>No programs found</span>} />
      </div>
    );
  }

  return (
    <>
      <div key='asset-category-other-assets-items' className='asset-category flex-column other-assets-list'>
        {programs
          ? programs.map(program => {
              const address = program.pubkey.toBase58();
              return (
                <div
                  key={`${address}`}
                  onClick={() => onProgramSelected?.(program)}
                  onKeyDown={() => {}}
                  id={address}
                  className={`transaction-list-row ${getActiveClass(program)}`}
                >
                  <div className='icon-cell'>
                    <div className='token-icon'>
                      <Identicon address={address} style={{ width: '24', height: '24', display: 'inline-flex' }} />
                    </div>
                  </div>
                  <div className='description-cell'>
                    <div className='title'>{shortenAddress(address)}</div>
                  </div>
                  <div className='rate-cell'>
                    <div className='rate-amount'>{formatThousands(program.size)} bytes</div>
                  </div>
                </div>
              );
            })
          : null}
      </div>
    </>
  );
};
