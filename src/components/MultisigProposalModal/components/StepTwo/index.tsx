import './style.scss';
import { Col, Row } from 'antd';
import { useTranslation } from 'react-i18next';
import { IconUser } from '../../../../Icons';

export const StepTwo = (props: {
  isBusy: boolean;
  onProposalTitleValueChange: any;
  proposalTitleValue: string;
}) => {
  const { t } = useTranslation('common');

  const { isBusy, onProposalTitleValueChange, proposalTitleValue } = props;

  return (
    <>
      <Row gutter={[8, 8]}>
        <Col span={24} className="step-two-selected-app">
          <IconUser className="mean-svg-icons" />
          <div className="selected-app">
            <div className="info-label">Selected App</div>
            <span>Raydium</span>
          </div>
        </Col>
        {/* Proposal title */}
        <Col xs={24} sm={24} md={16} lg={16}>
          <div className="mb-3">
            <div className="form-label">{t('multisig.proposal-modal.title')}</div>
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-right">
                <div className="left">
                  <input
                    id="proposal-title-field"
                    className="w-100 general-text-input"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    maxLength={52}
                    onChange={onProposalTitleValueChange}
                    placeholder={t('multisig.proposal-modal.title-placeholder')}
                    value={proposalTitleValue}
                  />
                </div>
              </div>
            </div>
          </div>
        </Col>
        {/* Expiry date */}
        <Col xs={24} sm={24} md={8} lg={8}>
          <div className="mb-3">
            <div className="form-label">Expires</div>
            <div className={`well ${props.isBusy ? 'disabled' : ''}`}>

            </div>
          </div>
        </Col>
      </Row>

      <div className="step-two-select-instruction">
        {/* Instruction */}
        <Row gutter={[8, 8]} className="mb-1">
          <Col span={6} className="text-right pr-1">
            <div className="form-label">Instruction</div>
          </Col>
          <Col span={18}>
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-right">
                <div className="left">
                  <input
                    id="proposal-title-field"
                    className="w-100 general-text-input"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    maxLength={52}
                    onChange={() => {}}
                    placeholder="Select an instruction"
                    value=""
                  />
                </div>
              </div>
            </div>
          </Col>
        </Row>

        {/* Type */}
        <Row gutter={[8, 8]} className="mb-1">
          <Col span={6} className="text-right pr-1">
            <div className="form-label">Type</div>
          </Col>
          <Col span={18}>
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-right">
                <div className="left">
                  <input
                    id="proposal-title-field"
                    className="w-100 general-text-input"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    maxLength={52}
                    onChange={() => {}}
                    placeholder="Add a type"
                    value=""
                  />
                </div>
              </div>
            </div>
          </Col>
        </Row>

        {/* Memo */}
        <Row gutter={[8, 8]} className="mb-1">
          <Col span={6} className="text-right pr-1">
            <div className="form-label">Memo</div>
          </Col>
          <Col span={18}>
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-right">
                <div className="left">
                  <input
                    id="proposal-title-field"
                    className="w-100 general-text-input"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    maxLength={52}
                    onChange={() => {}}
                    placeholder="Add a memo"
                    value=""
                  />
                </div>
              </div>
            </div>
          </Col>
        </Row>

        {/* Recipient */}
        <Row gutter={[8, 8]} className="mb-1">
          <Col span={6} className="text-right pr-1">
            <div className="form-label">Recipient</div>
          </Col>
          <Col span={18}>
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-right">
                <div className="left">
                  <input
                    id="proposal-title-field"
                    className="w-100 general-text-input"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    maxLength={52}
                    onChange={() => {}}
                    placeholder="Add a recipient"
                    value=""
                  />
                </div>
              </div>
            </div>
          </Col>
        </Row>

        {/* Amount */}
        <Row gutter={[8, 8]} className="mb-1">
          <Col span={6} className="text-right pr-1">
            <div className="form-label">Amount</div>
          </Col>
          <Col span={18}>
            <div className={`well ${isBusy ? 'disabled' : ''}`}>
              <div className="flex-fixed-right">
                <div className="left">
                  <input
                    id="proposal-title-field"
                    className="w-100 general-text-input"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    maxLength={52}
                    onChange={() => {}}
                    placeholder="Add an amount"
                    value=""
                  />
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </>
  )
}