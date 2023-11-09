import { ReactNode, useMemo } from 'react'
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, InfoCircleFilled } from '@ant-design/icons'
import { ValidationStatus, ValidationStatusCode } from 'models/ValidationStatus'

interface Props {
  validationStatus: ValidationStatus
}

const AlertIcon = ({ validationStatus }: Props) => {
  let iconName = ''
  let icon: ReactNode
  switch (validationStatus.severity) {
    case 'success':
      icon = <CheckCircleFilled />
      iconName = 'check-circle'
      break
    case 'warning':
      icon = <ExclamationCircleFilled />
      iconName = 'exclamation-circle'
      break
    case 'error':
      icon = <CloseCircleFilled />
      iconName = 'close-circle'
      break
    default:
      icon = <InfoCircleFilled />
      iconName = 'info-circle'
      break
  }
  return (
    <span
      aria-label={iconName}
      className={`anticon anticon-${iconName} ant-alert-icon`}
    >
      {icon}
    </span>
  )
}

const ValidationStatusDisplay = ({ validationStatus }: Props) => {
  const alertTitle = useMemo(() => {
    switch (validationStatus.code) {
      case ValidationStatusCode.RECIPIENT_INVALID_ADDRESS:
        return 'Invalid account address'
      case ValidationStatusCode.RECIPIENT_IS_TOKEN_ACCOUNT:
        return 'Destination address is a token account'
      case ValidationStatusCode.RECIPIENT_TOKEN_ACCOUNT_MINT_MISSMATCH:
      case ValidationStatusCode.RECIPIENT_IS_TOKEN_MINT:
        return 'Invalid destination address'
      case ValidationStatusCode.RECIPIENT_IS_SYSTEM_ACCOUNT:
      case ValidationStatusCode.RECIPIENT_IS_PROGRAM_ACCOUNT:
        return 'Destination is not a regular wallet'
      case ValidationStatusCode.RECIPIENT_NO_ACCOUNT_INFO:
      default:
        return null
    }
  }, [validationStatus.code])

  const alertMessage = useMemo(() => {
    switch (validationStatus.code) {
      case ValidationStatusCode.RECIPIENT_INVALID_ADDRESS:
        return 'The entered address is not a valid Solana address, please review your input.'
      case ValidationStatusCode.RECIPIENT_IS_TOKEN_ACCOUNT:
        return 'You are sending directly to a token account, not to a regular wallet. Proceed only if you understand what you are doing.'
      case ValidationStatusCode.RECIPIENT_TOKEN_ACCOUNT_MINT_MISSMATCH:
        return 'The entered address cannot be used for transferring your tokens. Find the correct destination address.'
      case ValidationStatusCode.RECIPIENT_IS_TOKEN_MINT:
        return 'The entered address corresponds to a mint address. Find the correct destination address.'
      case ValidationStatusCode.RECIPIENT_IS_SYSTEM_ACCOUNT:
      case ValidationStatusCode.RECIPIENT_IS_PROGRAM_ACCOUNT:
        return 'Proceed only if you are sure the address is correct.'
      case ValidationStatusCode.RECIPIENT_NO_ACCOUNT_INFO:
      default:
        return null
    }
  }, [validationStatus.code])

  return (
    <div data-show="true" className={`ant-alert ant-alert-${validationStatus.severity} translucent`} role="alert">
      <AlertIcon validationStatus={validationStatus} />
      <div className="ant-alert-content">
        {alertTitle ? (
          <div className="ant-alert-message">
            {alertTitle}
          </div>
        ) : null}
        {alertMessage ? (
          <div className="ant-alert-description" style={{ display: 'block' }}>{alertMessage}</div>
        ) : null}
      </div>
    </div>
  )

}

export default ValidationStatusDisplay