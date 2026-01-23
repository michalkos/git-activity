import { useState, useEffect } from "react";
import { useStdout } from "ink";

export function useTerminalDimensions(): [number, number] {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState<[number, number]>([
    stdout.columns || 80,
    stdout.rows || 24,
  ]);

  useEffect(() => {
    const handler = () => {
      setDimensions([stdout.columns || 80, stdout.rows || 24]);
    };

    stdout.on("resize", handler);
    return () => {
      stdout.off("resize", handler);
    };
  }, [stdout]);

  return dimensions;
}
