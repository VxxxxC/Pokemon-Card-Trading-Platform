export const ABOUT_PAGE_SECTIONS = [
  {
    id: "mission",
    title: "我們的使命",
    body: [
      "本平台是香港首個專注日版寶可夢卡牌的專業交易平台。我們相信每一張卡牌都承載收藏與交易價值，因此以透明掛單、安全託管與專業鑑定，為買家與賣家建立可信的交易環境。",
      "無論你是入門收藏家、進階玩家，還是專業商戶，都可以在同一個平台完成搜尋、議價、付款與交割。",
    ],
  },
  {
    id: "features",
    title: "平台特色",
    bullets: [
      "交易所大盤：公開掛單、即時搜尋與價格參考",
      "議價聊天：買家出價、賣家確認，流程清晰可追蹤",
      "託管付款：成交後資金託管，降低交易風險",
      "鑑定加購：可選平台第三方鑑定，保障卡牌真偽與品相",
      "商戶入駐：認證商戶可開設櫥窗，管理庫存與訂單",
    ],
  },
  {
    id: "trust",
    title: "安全與合規",
    body: [
      "平台採用託管交易與訂單狀態機制，重要節點均有系統紀錄。爭議、檢舉與客服流程依服務條款處理，保障雙方權益。",
      "我們持續優化防詐提示、站內溝通規範與資料保護措施，讓交易體驗更安全、更專業。",
    ],
  },
] as const;

export const ABOUT_LEGAL_SECTION = {
  id: "legal",
  title: "條款與政策",
  body: [
    "使用本平台前，請先閱讀服務條款與私隱政策，了解交易規則、託管流程及個人資料處理方式。",
    "條款涵蓋掛單交易、託管付款、鑑定服務與爭議處理；私隱政策說明我們如何收集、使用及保護你的資料。",
  ],
  links: [
    { label: "服務條款", href: "/terms" },
    { label: "私隱政策", href: "/privacy" },
  ],
} as const;

export const ABOUT_CONTACT_EMAIL = "cs@cardvaulthk.com";

export const ABOUT_CONTACT_SECTION = {
  id: "contact",
  title: "聯絡我們",
  body: [
    "如有合作洽談、商戶入駐、媒體查詢或交易相關問題，歡迎電郵聯絡客服團隊。",
    "我們會於辦公時間內盡快回覆。",
  ],
  email: ABOUT_CONTACT_EMAIL,
} as const;
