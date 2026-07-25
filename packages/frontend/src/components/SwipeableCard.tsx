import { useRef, useState, useCallback } from 'react';

interface Props {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  children: React.ReactNode;
}

export default function SwipeableCard({ onSwipeLeft, onSwipeRight, children }: Props) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);

  const THRESHOLD = 70;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
    swiping.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    currentX.current = e.touches[0].clientX;
    const delta = currentX.current - startX.current;
    // Add resistance beyond threshold
    if (Math.abs(delta) > THRESHOLD * 1.5) {
      setOffsetX(delta > 0 ? THRESHOLD * 1.5 : -THRESHOLD * 1.5);
    } else {
      setOffsetX(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    swiping.current = false;
    if (offsetX < -THRESHOLD) {
      // Left swipe → delete
      setOffsetX(0);
      onSwipeLeft();
    } else if (offsetX > THRESHOLD) {
      // Right swipe → edit
      setOffsetX(0);
      onSwipeRight();
    } else {
      setOffsetX(0);
    }
  }, [offsetX, onSwipeLeft, onSwipeRight]);

  const isDeleteActive = offsetX < -THRESHOLD * 0.5;
  const isEditActive = offsetX > THRESHOLD * 0.5;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Background actions */}
      <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
        {/* Left → delete */}
        <div className={`flex items-center gap-1 transition-opacity ${isDeleteActive ? 'opacity-100' : 'opacity-30'}`}>
          <span className="text-white text-sm font-medium">删除</span>
        </div>
        {/* Right → edit */}
        <div className={`flex items-center gap-1 transition-opacity ${isEditActive ? 'opacity-100' : 'opacity-30'}`}>
          <span className="text-white text-sm font-medium">编辑</span>
        </div>
      </div>

      {/* Card content */}
      <div
        className={`relative bg-white shadow-sm transition-colors ${isDeleteActive ? 'bg-red-50' : isEditActive ? 'bg-blue-50' : ''}`}
        style={{ transform: `translateX(${offsetX}px)`, transition: swiping.current ? 'none' : 'transform 0.25s ease-out' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
