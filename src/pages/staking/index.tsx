import { PreFooter } from "../../components/PreFooter";
import { IconStats } from "../../Icons";

export const StakingView = () => {
  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>Staking</div>
            </div>
            <div className="subtitle">
              Subtitle
            </div>
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
}