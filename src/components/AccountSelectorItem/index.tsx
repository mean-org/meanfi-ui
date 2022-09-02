import './style.scss';

export const AccountSelectorItem = (props: {
  id?: string;
  src?: string;
  title?: any;
  subtitle?: string;
  amount?: any;
  resume?: string;
}) => {

  const {
    id,
    src,
    title,
    subtitle,
    amount,
    resume,
  } = props;

  return (
    <div className="two-column-form-layout col70x30 simplelink" onClick={() => {}}>
      <div key={`resume-item-${id}`} className="resume-item-container account-selector-item mr-0 ml-0">
        <div className="resume-left-container">
          <div className="img-container">
            {src && (
              <img src={src} alt={title} width={35} height={35} style={{borderRadius: "0.25em !important"}} />
            )}
          </div>
          <div className="resume-left-text">
            <div className="resume-title">
              {title}
            </div>
            {subtitle && (
              subtitle === "null" ? (
                <div className="info-label">
                  <span className="subtitle"></span>
                </div>
              ) : (
                <div className="info-label">
                  <span className="subtitle">{subtitle}</span>
                </div>
              )
            )}
          </div>
        </div>
        <div className="resume-right-text">
          <div className="resume-right-text-up">
            {amount && (
              <div className="rate-amount">
                {amount}
              </div>
            )}
          </div>
          <div className="info-label">
            {resume && (
              <span className="subtitle">{resume}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}