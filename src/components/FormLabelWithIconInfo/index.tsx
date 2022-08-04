import { IconHelpCircle } from "../../Icons";
import { InfoIcon } from "../InfoIcon";

export const FormLabelWithIconInfo = (props: {
  label: string;
  tooltip_text: any;
  tooltip_placement?: any;
}) => {
  const { label, tooltip_text, tooltip_placement } = props;

  return (
    <>
      <div className="form-label icon-label align-items-center">
        <span>{label}</span>
        <InfoIcon content={tooltip_text} placement={tooltip_placement || "top"}>
          <IconHelpCircle className="mean-svg-icons" />
        </InfoIcon>
      </div>
    </>
  )
}