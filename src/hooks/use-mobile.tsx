
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Default to false (desktop-like behavior) to match server-side rendering
  // where window is not available.
  const [isMobile, setIsMobile] = React.useState(false);
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true); // Mark that the component has mounted on the client

    const checkDevice = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Perform the initial check once mounted
    checkDevice();

    // Add event listener for resize
    window.addEventListener('resize', checkDevice);

    // Cleanup event listener on unmount
    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount

  // During SSR and the initial client render (before useEffect runs), hasMounted is false.
  // In this case, return the initial state (false) to ensure consistency with the server.
  // After mounting, return the actual client-side determined isMobile state.
  if (!hasMounted) {
    return false; 
  }

  return isMobile;
}
