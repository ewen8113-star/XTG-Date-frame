import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { dinoLoaderMotion } from "../../lib/dino-loader-motion";
import "./DinoLoader.css";

type DinoLoaderProps = {
  className?: string;
  label?: string;
  progress?: number;
};

/**
 * 独立的像素风加载动画；恐龙会依次跳过原始像素仙人掌障碍物，尚未接入业务页面。
 */
export function DinoLoader({ className = "", label = "正在加载", progress = 0 }: DinoLoaderProps) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(600);
  const percentage = Math.max(0, Math.min(100, Math.round(progress)));

  useEffect(() => {
    const loader = loaderRef.current;
    if (!loader) return;
    const updateWidth = () => {
      const nextWidth = Math.max(280, Math.round(loader.getBoundingClientRect().width));
      setTrackWidth((current) => current === nextWidth ? current : nextWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(loader);
    return () => observer.disconnect();
  }, []);

  const motion = useMemo(() => dinoLoaderMotion(trackWidth), [trackWidth]);

  const loaderStyle = {
    "--dino-jump-duration": `${motion.jumpDuration}s`,
    "--dino-travel-distance": `${motion.travelDistance}px`
  } as CSSProperties;

  return (
    <div
      aria-label={`${label}，${percentage}%`}
      aria-live="polite"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percentage}
      className={`design-dino-loader ${className}`}
      ref={loaderRef}
      role="progressbar"
      style={loaderStyle}
    >
      <span className="design-dino-runner" />
      {motion.delays.map((delay, obstacle) => (
        <span
          className="design-dino-obstacle"
          key={obstacle}
          style={{ animationDelay: `${delay}s`, animationDuration: `${motion.trackDuration}s` }}
        />
      ))}
      <span className="design-dino-ground" />
      <span className="design-dino-loading-label">
        <strong className="design-dino-percentage">{percentage}%</strong>
        <span>{label}</span>
      </span>
    </div>
  );
}
