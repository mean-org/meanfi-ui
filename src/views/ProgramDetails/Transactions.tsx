import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import { Col, Row } from 'antd';
import dayjs from 'dayjs';
import { CopyExtLinkGroup } from 'src/components/CopyExtLinkGroup';
import { formatThousands } from 'src/middleware/utils';
import './style.scss';

interface Props {
  loadingTxs: boolean;
  programTransactions: ParsedTransactionWithMeta[];
}

const ProgaramDetailsTransactions = ({ loadingTxs, programTransactions }: Props) => {
  return (
    <>
      <div className='item-list-header compact mt-2 mr-1'>
        <Row gutter={[8, 8]} className='d-flex header-row pb-2'>
          <Col span={14} className='std-table-cell pr-1'>
            Signatures
          </Col>
          <Col span={5} className='std-table-cell pl-3 pr-1'>
            Slots
          </Col>
          <Col span={5} className='std-table-cell pl-3 pr-1'>
            Time
          </Col>
        </Row>
      </div>
      {!loadingTxs ? (
        programTransactions && programTransactions.length > 0 ? (
          programTransactions.map(tx => (
            <Row gutter={[8, 8]} className='item-list-body compact hover-list w-100 pt-1' key={tx.blockTime}>
              <Col span={14} className='std-table-cell pr-1 simplelink signature'>
                <CopyExtLinkGroup
                  content={tx.transaction.signatures.slice(0, 1).shift() || ''}
                  externalLink={true}
                  className='text-truncate'
                  message='Signature'
                  isTx={true}
                />
              </Col>
              <Col span={5} className='std-table-cell pr-1 simplelink'>
                <CopyExtLinkGroup
                  content={formatThousands(tx.slot)}
                  externalLink={false}
                  className='text-truncate'
                  message='Slot'
                />
              </Col>
              <Col span={5} className='std-table-cell pr-1'>
                {dayjs.unix(tx.blockTime as number).fromNow()}
              </Col>
            </Row>
          ))
        ) : (
          <span>This program has no transactions</span>
        )
      ) : (
        <span>Loading transactions ...</span>
      )}
    </>
  );
};

export default ProgaramDetailsTransactions;
