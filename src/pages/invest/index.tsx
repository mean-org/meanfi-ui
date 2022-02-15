import { PreFooter } from "../../components/PreFooter";
import { IconStats } from "../../Icons";

export const InvestView = () => {
  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>Invest</div>
            </div>
            <div className="subtitle">
              The easiest way to grow your money stash
            </div>
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
}