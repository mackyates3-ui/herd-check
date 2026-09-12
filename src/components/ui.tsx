import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "leather";
type ButtonSize = "md" | "lg" | "icon";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50",
        size === "lg" && "min-h-12 px-4 text-base",
        size === "md" && "min-h-11 px-3.5 text-sm",
        size === "icon" && "size-11",
        variant === "primary" && "bg-primary text-primary-foreground",
        variant === "leather" && "bg-leather text-primary-foreground",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        variant === "ghost" && "bg-transparent text-foreground hover:bg-muted",
        variant === "outline" && "border border-border bg-card text-foreground",
        variant === "danger" && "bg-destructive text-destructive-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-12 w-full rounded-xl border border-border bg-card px-3 text-base",
        props.className,
      )}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "min-h-24 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-base",
        props.className,
      )}
    />
  );
}

export function Sheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-leather/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-background shadow-[var(--shadow-lift)] sm:rounded-3xl"
      >
        {children}
      </div>
    </div>
  );
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        "inline-flex size-11 items-center justify-center rounded-xl text-foreground hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
