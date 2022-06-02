import { CSSProperties } from "react";

export const IconApprove = (props: {className: string; style?: CSSProperties;}) => {
    return (
      <svg className={props.className} style={props.style} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.293 5.293l-10.293 10.293-4.293-4.293c-0.391-0.391-1.024-0.391-1.414 0s-0.391 1.024 0 1.414l5 5c0.391 0.391 1.024 0.391 1.414 0l11-11c0.391-0.391 0.391-1.024 0-1.414s-1.024-0.391-1.414 0z" fill="currentColor"></path>
      </svg>
    );
};