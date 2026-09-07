"use client";

import React, { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useUIStore } from "@/app/store/useUIStore";
import { usePwaInstall } from "@/app/lib/hooks/usePwaInstall";
import { snoozePwaPrompt } from "@/lib/pwa/snooze";

interface TutorialSlide {
  title: string;
  desc: string;
  imgSrc: string;
  // 🟢 核心校準：精準對齊 Gemini 實體圖片結構的絕對定位與跳動修正
  arrowStyle: string;
}

const IOS_PWA_SLIDES: TutorialSlide[] = [
  {
    title: "第一步：點擊分享按鈕",
    desc: "在 Safari 瀏覽器正底部的工具欄中，點擊「分享」核心圖標（一個帶有向上箭頭的正方形）。",
    imgSrc: "/asset/01.png", // 👈 對齊你放置在 public/asset/01.png 嘅實體圖
    // 🎯 像素級對齊：Gemini 實體圖的分享掣大約位於整張 4:3 畫布下方的 21% 腹地，箭頭向下指 (rotate-180)
    arrowStyle: "bottom-[25%] left-1/2 -translate-x-1/2 rotate-180",
  },
  {
    title: "第二步：選擇「加入主畫面」",
    desc: "在彈出的系統功能選單中向下捲動，找到並點擊帶有方形加號的「加入主畫面」選項。",
    imgSrc: "/asset/02.png", // 👈 請確保第二張圖也放進了 public/asset/02.png
    // 🎯 像素級對齊：Add to Home Screen 框正好位於畫布中下腹 (59% 處)，箭頭向上指 (rotate-0) 完美咬合
    arrowStyle: "top-[66%] left-1/2 -translate-x-1/2 rotate-0",
  },
  {
    title: "第三步：確認把程式加入到主畫面",
    desc: "看向最後彈出窗的右上方，點擊金色高亮的「新增」按鈕，大盤傳送門即刻安全降落至您的主畫面！",
    imgSrc: "/asset/03.png", // 👈 請確保第三張圖也放進了 public/asset/03.png
    // 🎯 像素級對齊：右上方「Add」掣位於全體畫布的 top-24% right-24% 內縮視域，斜向右上指 (rotate-45)
    arrowStyle: "top-[29%] right-[29%] rotate-45",
  },
];

export function IosPwaModal() {
  const { promptState } = usePwaInstall();
  const isOpen = useUIStore((state) => state.isIosPwaModalOpen);
  const closeIosPwaModal = useUIStore((state) => state.closeIosPwaModal);
  const [currentStep, setCurrentStep] = useState(0);

  const handleSnooze = () => {
    snoozePwaPrompt();
  };

  if (!isOpen) return null;

  const currentSlide = IOS_PWA_SLIDES[currentStep];

  const handleNext = () => {
    if (currentStep < IOS_PWA_SLIDES.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleClose = () => {
    handleSnooze();
    setCurrentStep(0);
    closeIosPwaModal();
  };

  // NOTE: prevent Android will pop-up this Modal
  if (promptState === "NATIVE_READY") return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-pwa-modal-title"
    >
      {/* 毛玻璃黑金背景 */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-xs"
        onClick={handleClose}
      />

      {/* 獨立控制艙主體 */}
      <div className="relative bg-[#2e2925] border border-[rgba(237,232,224,0.15)] rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col text-left animate-scaleUp">
        {/* 頂部 Header 欄 */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
          <div>
            <p className="font-sans text-xs text-brand font-black tracking-widest block uppercase">
              [macOS/iOS/iPadOS] Safari
            </p>
            <h3
              id="ios-pwa-modal-title"
              className="font-sans font-black text-[15px] text-[#eae1da] mt-0.5"
            >
              安裝方法
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-6 h-6 rounded-lg bg-[#17130f] hover:bg-[#39342f] text-[#8A8680] hover:text-brand flex items-center justify-center text-[11px] font-mono transition-colors cursor-pointer focus:outline-none"
          >
            ✕
          </button>
        </div>

        {/* 核心 Carousel 視窗 */}
        <div className="space-y-4 flex-1">
          {/* 4:3 獨立高純淨度畫布容器 */}
          <div className="relative w-full aspect-[4/3] bg-[#17130f] rounded-xl border border-white/5 overflow-hidden shadow-inner group">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{
                  duration: 0.25,
                  ease: "easeInOut",
                }}
                className="relative w-full h-full"
              >
                <Image
                  src={currentSlide.imgSrc}
                  alt={currentSlide.title}
                  fill
                  // 🟢 核心修正：改用 object-contain，防止 4:3 圖片在極端窄屏被切邊，鎖死幾何坐標軸
                  className="object-contain"
                  unoptimized
                />
              </motion.div>
            </AnimatePresence>

            {/* 🟢 CSS 幾何跳動小箭頭：100% 鎖死 Gemini 實體按鈕位 */}
            <div
              className={`absolute z-30 pointer-events-none transition-all duration-300 ${currentSlide.arrowStyle}`}
            >
              <div className="animate-bounce flex flex-col items-center">
                {/* 奢華金色三角指針 */}
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                >
                  <path
                    d="M12 2L22 14H14V22H10V14H2L12 2Z"
                    fill="#d4a574"
                    stroke="#1A1612"
                    strokeWidth="1.5"
                  />
                </svg>
                {/* 物理指引雷達發光底座 */}
                <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_10px_#d4a574] -mt-1 block animate-pulse" />
              </div>
            </div>
          </div>

          {/* 銳利文字排版區 */}
          <div className="space-y-1.5 min-h-[76px] px-1 text-center sm:text-left">
            <div className="flex items-center justify-between">
              <h4 className="font-sans font-extrabold text-[14px] text-brand">
                {currentSlide.title}
              </h4>
              <span className="font-mono text-[10px] text-[#8A8680] font-bold">
                STAGE 0{currentStep + 1} / 03
              </span>
            </div>
            <p className="font-sans text-[12.5px] text-[#d4c4b7] leading-relaxed">
              {currentSlide.desc}
            </p>
          </div>

          {/* 進度圓點 Stepper 條 */}
          <div className="flex justify-center gap-1.5 py-1">
            {[0, 1, 2].map((idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${currentStep === idx ? "w-6 bg-brand" : "w-1.5 bg-white/10"}`}
              />
            ))}
          </div>

          {/* 下方雙夾控制按鈕列 */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={handlePrev}
              className="px-3 h-10 border border-white/10 text-[#d4c4b7] font-sans font-bold text-[12px] rounded-xl hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-20 disabled:pointer-events-none focus:outline-none"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 h-10 bg-[#d4a574] hover:bg-[#e8b896] text-[#1A1612] font-sans font-black text-[12.5px] rounded-xl active:scale-[0.98] transition-all cursor-pointer shadow-md focus:outline-none"
            >
              {currentStep === 2 ? "✓ 完成並開始看盤" : "下一步 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const triggerIosPwaModal = () => {
  useUIStore.getState().openIosPwaModal();
};
