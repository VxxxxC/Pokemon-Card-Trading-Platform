type MemberOrderInvoiceRowProps = {
  label: string;
  amount: number;
  suffix?: string;
  valueClassName?: string;
  labelClassName?: string;
};

export function MemberOrderInvoiceRow({
  label,
  amount,
  suffix,
  valueClassName = "text-text-primary",
  labelClassName,
}: MemberOrderInvoiceRowProps) {
  return (
    <div className="flex justify-between gap-3">
      <span className={labelClassName}>{label}</span>
      <span className={valueClassName}>
        {suffix ?? "HK$ " + amount.toLocaleString("zh-TW")}
      </span>
    </div>
  );
}
