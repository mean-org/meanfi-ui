import { CSSProperties } from "react";

export const IconArrowBack = (props: {className: string; style?: CSSProperties;}) => {
    return (
      <svg className={props.className} style={props.style}  width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.422 16.594l-1.406 1.406-6-6 6-6 1.406 1.406-4.594 4.594z" fill="currentColor"></path>
      </svg>
    );
};