import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
/** `toolbar` is the 34px bar-control scale — what sits in the tab bar next to filters. */
type ButtonSize = "sm" | "toolbar" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon node, e.g. `<Download size={15} />`. */
  icon?: ReactNode;
  /** Trailing icon node, e.g. a chevron. */
  trailingIcon?: ReactNode;
  /** Square button that renders only its icon (children are ignored). */
  iconOnly?: boolean;
  /** React 19 reads `ref` as a plain prop on function components — no `forwardRef` needed. Used
   *  to anchor a `Dropdown` popover to a `Button` trigger instead of `DropdownTrigger`'s own
   *  filter-button look. */
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "border border-border bg-surface text-ink hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas hover:text-brand",
  danger: "text-negative hover:bg-negative/10",
  "danger-solid": "bg-negative text-white hover:bg-negative/90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  toolbar: "h-[34px] gap-2 px-[13px] text-[12.5px]",
  md: "h-[38px] gap-2 px-[15px] text-[13px]",
};

const ICON_ONLY_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  toolbar: "h-[34px] w-[34px]",
  md: "h-[38px] w-[38px]",
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  iconOnly = false,
  type = "button",
  className,
  children,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-[9px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        iconOnly ? ICON_ONLY_SIZES[size] : SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {!iconOnly && children}
      {!iconOnly && trailingIcon}
    </button>
  );
}
