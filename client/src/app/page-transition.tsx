import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import gsap from "gsap";

export type PageTransitionProps = {
  readonly children: ReactNode;
};

export function PageTransition({ children }: PageTransitionProps): ReactNode {
  const location = useLocation();
  const elementRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (elementRef.current === null) {
      return;
    }
    gsap.fromTo(
      elementRef.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.18, ease: "power1.out" },
    );
  }, [location.pathname]);

  return (
    <div
      key={location.pathname}
      ref={elementRef}
      className="animate__animated animate__fadeIn animate__faster"
    >
      {children}
    </div>
  );
}
