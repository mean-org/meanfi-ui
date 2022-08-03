import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusOutlined } from "@ant-design/icons";
import { MultisigParticipant } from "@mean-dao/mean-multisig-sdk";
import { isValidAddress, scrollToBottom } from "../../utils/ui";
import { InputMean } from "../InputMean";
import { isMobile } from "react-device-detect";
import useWindowSize from "../../hooks/useWindowResize";
import { IconHelpCircle, IconInfoCircle, IconTrash } from "../../Icons";
import "./style.scss";
import { Tooltip } from "antd";

export const MultisigSafeOwners = (props: {
  participants: MultisigParticipant[];
  onParticipantsChanged: any;
  label: string;
  disabled?: boolean;
  multisigAddresses: string[];
}) => {
  const { t } = useTranslation('common');
  const { width } = useWindowSize();

  const { participants, onParticipantsChanged, label, disabled, multisigAddresses } = props;
  
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  const setSingleItemName = useCallback((name: string, index: number) => {
    const items = JSON.parse(JSON.stringify(participants)) as MultisigParticipant[];
    items[index].name = name;
    onParticipantsChanged(items);
  }, [onParticipantsChanged, participants]);

  const setSingleItemAddress = useCallback((address: string, index: number) => {
    const items = JSON.parse(JSON.stringify(participants)) as MultisigParticipant[];
    items[index].address = address;
    onParticipantsChanged(items);
  }, [onParticipantsChanged, participants]);

  const onRemoveSingleItem = useCallback((index: number) => {
    const items = JSON.parse(JSON.stringify(participants)) as MultisigParticipant[];
    items.splice(index, 1);
    onParticipantsChanged(items);
  }, [onParticipantsChanged, participants]);

  const addParticipant = useCallback(() => {
    const items = JSON.parse(JSON.stringify(participants)) as MultisigParticipant[];
    items.push({
      name: `Owner ${items.length + 1}`,
      address: ''
    });
    if (!checkIfDuplicateExists(items)) {
      onParticipantsChanged(items);
      setTimeout(() => {
        scrollToBottom('multisig-participants-max-height');
      }, 100);
    }
  }, [onParticipantsChanged, participants]);

  const checkIfDuplicateExists = (arr: MultisigParticipant[]): boolean => {
    const items = arr.map(i => i.address);
    return new Set(items).size !== items.length ? true : false;
  }

  const isInputMultisigAddress = (address: string) => {
    return multisigAddresses.includes(address);
  }

  return (
    <div className="multisig-safe-owners">
      <div className={`flex-fixed-right ${disabled ? 'click-disabled' : ''}`}>
        <div className="left">
          {label ? (
            <div className="form-label icon-label">
              {label}
              <Tooltip placement="bottom" title="">
                <span>
                  <IconInfoCircle className="mean-svg-icons" />
                </span>
              </Tooltip>
            </div>
          ) : (<div className="form-label">&nbsp;</div>)}
        </div>
        <div className="right">
          <span className={`flat-button change-button ${participants.length === 10 ? 'disabled' : ''}`} onClick={() => addParticipant()}>
            <PlusOutlined />
            <span className="ml-1">Add owner</span>
          </span>
        </div>
      </div>
      
      {!isXsDevice ? (
        <div className="two-column-form-layout mb-0 mt-1">
          <div className="form-label">Owner's name</div>
          <div className="form-label">Owner's address</div>
        </div>
      ) : (
        <div className="mb-0 mt-1">
          <div className="form-label">Owner's name and address</div>
        </div>
      )}
      {participants && participants.length > 0 ? (
        <div id="multisig-participants-max-height" className={`mb-3 ${participants.length > 2 ? 'vertical-scroll pr-2' : ''}`}>
          {participants.map((participant: MultisigParticipant, index: number) => {
            return (
              <div className="container-owner-item" key={index}>
                <div className={`two-column-layout w-100 mb-0 ${disabled ? 'disabled' : ''}`}>
                  <div className="left">
                    <InputMean
                      id={`participant-name-${index + 1}`}
                      className=""
                      type="text"
                      value={participant.name}
                      onChange={(e: any) => {
                        const value = e.target.value;
                        setSingleItemName(value, index);
                      }}
                      placeholder="Enter the name of the owner"
                    />
                  </div>
                  <div className="right">
                    <InputMean
                      id={`participant-address-${index + 1}`}
                      className="pt-2 pb-2"
                      type="text"
                      value={participant.address}
                      maxLength={100}
                      onChange={(e: any) => {
                        const value = e.target.value;
                        setSingleItemAddress(value, index);
                      }}
                      placeholder="Enter address of the owner"
                      validationIcons={true}
                      isValid={isValidAddress(participant.address)}
                    />
                    {isValidAddress(participant.address) ? (
                      isInputMultisigAddress(participant.address) && (
                        <small className="form-field-error ml-1">{t('multisig.create-multisig.multisig-address-used-as-participant')}</small>
                      )
                    ) : (
                      <small className="form-field-error ml-1">Please enter a valid Solana address</small>
                    )}
                  </div>
                </div>
                <div className="trash-icon" onClick={() => onRemoveSingleItem(index)}>
                  <IconTrash className="mean-svg-icons simplelink"/>
                </div>
              </div>
            );
          })}
          {checkIfDuplicateExists(participants) ? (
            <span className="form-field-error pl-2">{t('multisig.create-multisig.multisig-duplicate-participants')}</span>
          ) : participants.length === 10 ? (
            <span className="form-field-hint pl-1">{t('multisig.create-multisig.multisig-threshold-input-max-warn')}</span>
          ) : null}
        </div>
      ) : (
        <div className="inner-label pl-1">{t('multisig.create-multisig.multisig-no-participants')}</div>
      )}
    </div>
  );
}
