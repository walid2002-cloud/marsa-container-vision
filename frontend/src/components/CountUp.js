import { useEffect, useState } from 'react';

/**
 * Animation count-up purement visuelle (UI).
 */
function CountUp({ value, duration = 900, decimals = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = Number(value);
    if (Number.isNaN(target)) {
      setDisplay(value);
      return undefined;
    }

    let start = 0;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - progress) ** 3;
      const current = start + (target - start) * eased;
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(tick);
    };

    const frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  if (typeof value === 'string' && Number.isNaN(Number(value))) {
    return <>{value}</>;
  }

  const num = Number(display);
  const formatted = decimals > 0 ? num.toFixed(decimals) : Math.round(num).toString();
  return (
    <>
      {formatted}
      {suffix}
    </>
  );
}

export default CountUp;
