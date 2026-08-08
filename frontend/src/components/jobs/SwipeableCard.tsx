'use client';

import { type ReactNode, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Bookmark, X } from 'lucide-react';

interface SwipeableCardProps {
  children: ReactNode;
  enabled?: boolean;
  onSave: () => void;
  onDismiss: () => void;
}

const SWIPE_THRESHOLD = 150;
const VELOCITY_THRESHOLD = 500;

export default function SwipeableCard({
  children,
  enabled = true,
  onSave,
  onDismiss,
}: SwipeableCardProps) {
  const x = useMotionValue(0);
  const hasActioned = useRef(false);
  const [isAnimatingBack, setIsAnimatingBack] = useState(false);

  // Background opacity (0 → 1 as drag increases)
  const bgOpacity = useTransform(x, [-200, -80, 0, 80, 200], [0.9, 0.4, 0, 0.4, 0.9]);
  // Icon scale (0.5 → 1.2)
  const iconScale = useTransform(x, [-200, -80, 0, 80, 200], [1.2, 0.7, 0.5, 0.7, 1.2]);
  // Card rotation for visual feedback
  const rotate = useTransform(x, [-300, 0, 300], [-4, 0, 4]);

  // Left background transforms
  const leftOpacity = useTransform(x, [0, 80, 200], [0, 0.4, 0.9]);
  const leftScale = useTransform(x, [0, 80, 200], [0.5, 0.7, 1.2]);
  // Right background transforms
  const rightOpacity = useTransform(x, [-200, -80, 0], [0.9, 0.4, 0]);
  const rightScale = useTransform(x, [-200, -80, 0], [1.2, 0.7, 0.5]);

  if (!enabled) return <>{children}</>;

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (hasActioned.current) return;

    const { offset, velocity } = info;
    const isFullSwipe =
      Math.abs(offset.x) > SWIPE_THRESHOLD || Math.abs(velocity.x) > VELOCITY_THRESHOLD;

    if (isFullSwipe) {
      hasActioned.current = true;
      setIsAnimatingBack(true);
      // Haptic feedback
      navigator.vibrate?.(10);

      if (offset.x > 0) {
        onSave();
      } else {
        onDismiss();
      }
      // Reset after animation
      setTimeout(() => {
        hasActioned.current = false;
        setIsAnimatingBack(false);
      }, 400);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Left background (save — green) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-start rounded-xl bg-emerald-500 pl-6"
        style={{ opacity: leftOpacity }}
      >
        <motion.div style={{ scale: leftScale }}>
          <Bookmark className="h-6 w-6 text-white" />
        </motion.div>
      </motion.div>

      {/* Right background (dismiss — gray) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end rounded-xl bg-slate-400 pr-6"
        style={{ opacity: rightOpacity }}
      >
        <motion.div style={{ scale: rightScale }}>
          <X className="h-6 w-6 text-white" />
        </motion.div>
      </motion.div>

      {/* Draggable card */}
      <motion.div
        style={{ x, rotate }}
        drag="x"
        dragDirectionLock
        dragElastic={0.7}
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={handleDragEnd}
        animate={isAnimatingBack ? { x: 0, opacity: 1 } : undefined}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="relative z-10 touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}
