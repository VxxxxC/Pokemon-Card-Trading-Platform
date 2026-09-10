// TODO: [server] Trust flow steps should be configurable via CMS/admin panel in Supabase

const steps = [
  {
    number: "1",
    title: "支付費用",
    description: "支付鑑定服務費用，啟動鑑定流程",
    icon: ShieldIcon,
  },
  {
    number: "2",
    title: "實體鑑定",
    description: "鑑定卡牌真偽與品相",
    icon: CheckIcon,
  },
  {
    number: "3",
    title: "安全發貨",
    description: "系統自動發貨，安全到手",
    icon: TruckIcon,
  },
];

export function TrustBanner() {
  return (
    <section
      className="border-y border-white/[0.08] py-3 sm:py-3.5"
      aria-labelledby="trust-heading"
    >
      <h2
        id="trust-heading"
        className="font-sans font-semibold text-[11px] sm:text-[13px] text-text-secondary mb-1.5 sm:mb-2 text-center leading-snug"
      >
        鑑定託管・三步即享安心交易
      </h2>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-3 lg:gap-5">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.number}
              className="flex min-w-0 flex-col items-center text-center px-0.5"
            >
              <div className="mb-1 flex size-7 sm:size-9 items-center justify-center rounded-full border border-brand/15 bg-brand/10">
                <Icon className="size-[14px] sm:size-[18px]" />
              </div>
              <h3 className="font-sans font-semibold text-[10px] sm:text-[12px] text-text-primary leading-tight">
                {step.title}
              </h3>
              <p className="hidden sm:block font-sans text-[10px] text-text-disabled leading-snug mt-0.5">
                {step.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d4a574"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d4a574"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d4a574"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}
