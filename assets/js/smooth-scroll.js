/**
 * Smooth Scroll Module
 * Initializes Lenis smooth scrolling
 */

export function initSmoothScroll() {
    if (typeof Lenis === 'undefined') {
        console.warn('Lenis library not loaded');
        return null;
    }

    const lenis = new Lenis({
        duration: 1.0,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        direction: 'vertical',
        gestureDirection: 'vertical',
        smooth: true,
        smoothTouch: false,
        wheelMultiplier: 1.0,
        touchMultiplier: 2.0,
        infinite: false,
    });

    function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
    }
    
    requestAnimationFrame(raf);
    
    console.log('✓ Smooth scroll initialized');
    return lenis;
}
