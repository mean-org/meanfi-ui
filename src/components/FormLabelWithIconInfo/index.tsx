import { IconHelpCircle } from "../../Icons";
import { InfoIcon } from "../InfoIcon";

export const FormLabelWithIconInfo = (props: {
  label: string;
  tooltipText: any;
  tooltipPlacement?: any;
}) => {
  const { label, tooltipText, tooltipPlacement } = props;

  return (
    <>
      <div className="form-label icon-label align-items-center">
        <span>{label}</span>
        <InfoIcon content={tooltipText} placement={tooltipPlacement || "top"}>
          <IconHelpCircle className="mean-svg-icons" />
        </InfoIcon>
      </div>
    </>
  )
}