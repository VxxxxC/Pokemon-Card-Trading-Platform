"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import { SECTION_TITLE_CLASS } from "@/lib/ui/section-title-ui";

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  zIndex?: number;
}

export function SlideOver({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  zIndex = 300,
}: SlideOverProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 overflow-hidden"
          style={{ zIndex }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="w-screen max-w-md bg-[#2e2925] border-l border-[rgba(237,232,224,0.12)] shadow-[0_0_40px_rgba(0,0,0,0.85)] flex flex-col justify-between"
            >
              <div className="px-4 py-3.5 border-b border-[rgba(237,232,224,0.08)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {Icon ? (
                    <Icon className="size-4 shrink-0 text-brand" strokeWidth={2.25} />
                  ) : null}
                  <div className="min-w-0">
                    <h2 className={`${SECTION_TITLE_CLASS} truncate`}>
                      {title}
                    </h2>
                    {subtitle ? (
                      <p className="font-mono text-[10px] text-[#8A8680] mt-0.5 uppercase tracking-wider truncate">
                        {subtitle}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 shrink-0 rounded-lg bg-[#17130f] hover:bg-[#39342f] flex items-center justify-center transition-colors cursor-pointer text-[#8A8680] hover:text-brand focus:outline-none"
                  aria-label="關閉面板"
                >
                  <X className="size-4" strokeWidth={2.25} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 scrollbar-none space-y-5 bg-[#231e1a]/40">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
