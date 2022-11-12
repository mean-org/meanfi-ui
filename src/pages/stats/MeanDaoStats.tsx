import { CopyOutlined } from '@ant-design/icons';
import { Button, Divider, Row } from 'antd';
import { formatThousands } from '../../middleware/utils';
import CardStats from './components/CardStats';

const items = [
  {
    name: 'USD Coin',
    symbol: 'https://www.orca.so/static/media/usdc.3b5972c1.svg',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amount: 3653778.8,
    token: 'USDC',
    value: 365366553,
  },
  {
    name: 'MEAN',
    symbol: 'https://www.gate.io/images/coin_icon/64/mean.png',
    address: 'MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD',
    amount: 190000000,
    token: 'MEAN',
    value: 14040430000,
  },
];

const transactions = [
  {
    slot: 115534798,
    token: 'MEAN',
    signature:
      '45n19mmfh1kkLfKY68ESM6TWqUV1TGu66HZVdbbTRMXSfoUD2MrLTd7Ka4Vm8KGUjHHNsrRKk3Z2W6Upeb3vuiMD',
  },
  {
    slot: 115534529,
    token: 'MEAN',
    signature:
      'xSX65F5BAqk4SgYhcFCwwov3vuKi5vtBK3ec6gN6XvGB1Hop8Wvbc579UU8urYi86ikujzvjZMVYVobLKKUuRRo',
  },
  {
    slot: 112757513,
    token: 'MEAN',
    signature:
      '4X7CwhbegXpH4SEZq1x97NVgzCaEyiQjFNR11nwnKtWCJFccJh5bc68qfFnyrvr9JAD82aW26FVxFvi8hkv9Cd99',
  },
  {
    slot: 112757184,
    token: 'MEAN',
    signature:
      'okhvHtmaRwYzMpbTCGtsVdKL3DBhFsLEJtH5szJDRWYAcJQqYir9QMAGJz6xKN5mDNYmAitmsbTf9ktNCUGoTKF',
  },
  {
    slot: 112707500,
    token: 'MEAN',
    signature:
      '4eb6FsYa41uLs76ufT6L99uLDpR3RQrM6nwagPoF3iGbFWrRr2A2NzqmBk1NmMfsEWai7gUP2yxVSKvtHU5nHqWY',
  },
  {
    slot: 112705254,
    token: 'MEAN',
    signature:
      '3Nnoz6HsMtjq5iXnmrGapUsvtK4DTTc9sVPakJiD7yEEGgfiLFXLs6i9nYcCwzVvZewTygq6rSLU6vjNJ5y84EDU',
  },
];

const MeanDaoStats = () => {
  const totalTreasuryValue = items.reduce((accumulator, item) => {
    return accumulator + item.value;
  }, 0);

  const renderHeaderTreasury = (
    <div className="ant-card-head-title">
      <span>Treasury Balance</span>
      <span>$ {formatThousands(totalTreasuryValue)}</span>
    </div>
  );

  const renderBodyTreasury = (
    <div className="item-container">
      {items.map((item, index) => (
        <div key={index} className="item-inner">
          <div className="item-header">
            <img src={item.symbol} alt={item.name} className="avatar-coin" />
            <h3>{item.name}</h3>
          </div>
          <div className="item-content">
            <span>
              {formatThousands(item.amount)} {item.token}
            </span>
            <span>$ {formatThousands(item.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );

  const renderHeaderEmissions = (
    <div className="ant-card-head-title">
      <span>Total MEAN Emissions</span>
    </div>
  );

  const renderBodyEmissions = (
    <div className="item-container">
      <table className="btable-table w-100">
        <thead className="">
          <tr>
            <th className="">Slot</th>
            <th className="">Token</th>
            <th className="">Signature</th>
          </tr>
        </thead>
        <tbody className="">
          {transactions.map((transaction, index) => (
            <tr key={index}>
              <td className="">
                <span className="">{formatThousands(transaction.slot)}</span>
              </td>
              <td className="">
                <span className="">{transaction.token}</span>
              </td>
              <td className="">
                <span className="icon-button-container">
                  <Button
                    type="default"
                    shape="circle"
                    size="middle"
                    icon={<CopyOutlined className="mean-svg-icons" />}
                  />
                  {transaction.signature}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const cards = [
    {
      header: renderHeaderTreasury,
      body: renderBodyTreasury,
      className: 'treasury-card',
    },
    {
      header: renderHeaderEmissions,
      body: renderBodyEmissions,
      className: 'emissions-card',
    },
  ];

  return (
    <>
      <Row gutter={[8, 8]}>
        <CardStats
          xs={24}
          sm={24}
          md={24}
          lg={24}
          header={cards[0].header}
          body={cards[0].body}
          className={cards[0].className}
        />
      </Row>
      <Divider />
      <Row gutter={[8, 8]}>
        <CardStats
          xs={24}
          sm={24}
          md={24}
          lg={24}
          header={cards[1].header}
          body={cards[1].body}
          className={cards[1].className}
        />
      </Row>
    </>
  );
};

export default MeanDaoStats;
