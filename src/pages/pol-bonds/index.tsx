import { PreFooter } from "../../components/PreFooter";
import { IconStats } from "../../Icons";

export const PolBondsView = () => {
  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>POL Bonds</div>
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