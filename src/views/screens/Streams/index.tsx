import { Divider } from "antd";

export const Streams = () => {

    return (
        <div className="streams-layout">
        {/* Left / top panel*/}
        <div className="streams-container">
          <div className="streams-heading">My Money Streams</div>
          <div className="inner-container">
            Left view, list of money streams
          </div>
        </div>
        {/* Right / down panel */}
        <div className="stream-details-container">
          <Divider plain></Divider>
          <div className="streams-heading">Stream details</div>
          <div className="inner-container">
            Right view, details of the money stream
          </div>
        </div>
      </div>
    );
}
