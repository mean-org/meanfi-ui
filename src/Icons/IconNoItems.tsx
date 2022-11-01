import { CSSProperties } from "react";

export const IconNoItems = (props: {className: string; style?: CSSProperties;}) => {
    return (
		<svg className={props.className} style={props.style} width="24" height="24" viewBox="0 0 330 330" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path fillRule="evenodd" clipRule="evenodd" d="M195,150c27.57,0,50-22.43,50-50s-22.43-50-50-50s-50,22.43-50,50S167.43,150,195,150z" fill="currentColor" />
			<path fillRule="evenodd" clipRule="evenodd" d="M315,0H15C6.716,0,0,6.716,0,15v239.804c0,0.01,0,0.02,0,0.03V315c0,8.284,6.716,15,15,15h300
				c8.284,0,15-6.716,15-15V15C330,6.716,323.284,0,315,0z M300,209.636l-32.957-44.388c-2.829-3.811-7.296-6.058-12.043-6.058
				s-9.214,2.247-12.043,6.058l-47.531,64.016l-78.093-112.802C114.531,112.415,109.922,110,105,110s-9.531,2.415-12.333,6.462
				L30,206.981V30h270V209.636z" fill="currentColor" />
		</svg>
    );
};
