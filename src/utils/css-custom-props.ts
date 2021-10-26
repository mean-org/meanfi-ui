import { CSSProperties } from "react";

export type CustomCSSProps = CSSProperties & Record<`${string}`, number | string>;
