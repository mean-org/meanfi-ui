import { CSSProperties } from "react";

export const IconLink = (props: {className: string; style?: CSSProperties;}) => {
    return (
      <svg className={props.className} style={props.style} width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 7.762v-7.762l12 12-12 12v-7.932c-13.961-0.328-13.362 9.493-9.808 15.932-8.772-9.482-6.909-24.674 9.808-24.238z" fill="currentColor"></path>
      </svg>
    );
};