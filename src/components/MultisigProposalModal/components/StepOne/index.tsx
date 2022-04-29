import './style.scss';
import { Col, Row } from 'antd';

export const StepOne = (props: {

}) => {


  const solanaApps = [
    {
      logo: "",
      name: "BPF Loader Program"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh7gt29278eysxa7rb5sl8%3Ftype%3DLOGO&w=3840&q=75",
      name: "Friktion"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwiiri37677eysxluqnog8e%3Ftype%3DLOGO&w=3840&q=75",
      name: "Raydium"
    },
    {
      logo: "",
      name: "Money Streaming"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh6nj28403eysxj7hduqbo%3Ftype%3DLOGO&w=3840&q=75",
      name: "Saber"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwip3w40063eysxbk0kx2lc%3Ftype%3DLOGO&w=3840&q=75",
      name: "Wormhole"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh67t27981eysx2yzq2dq6%3Ftype%3DLOGO&w=3840&q=75",
      name: "Socean Streams"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfd38506eysxniku8quh%3Ftype%3DLOGO&w=3840&q=75",
      name: "Mango Markets"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh6su28617eysxuaubvt93%3Ftype%3DLOGO&w=3840&q=75",
      name: "Marinade Finance"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwilfj38513eysxcwypxovh%3Ftype%3DLOGO&w=3840&q=75",
      name: "Lido Finance"
    },
    {
      logo: "https://solana.com/_next/image?url=%2Fapi%2Fprojectimg%2Fckwgwh8w830938eysxhy5e8syg%3Ftype%3DLOGO&w=3840&q=75",
      name: "Solend"
    },
  ];
  
  return (
    <>
      <Row gutter={[8, 8]} className="step-one-select-app">
        {solanaApps.map((app) => (
          <Col xs={8} sm={6} md={6} lg={6} className="select-app">
            <div className="select-app-item simplelink" onClick={() => {}}>
              {app.logo === "" ? (
                <div className="empty-background"></div>
              ) : (
                <img src={app.logo} alt={app.name} width={80} height={80} />
              )}
              <span className="info-label">{app.name}</span>
            </div>
          </Col>
        ))}
      </Row>
    </>
  )
}