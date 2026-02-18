/**
 * KUONIX Main Entry Point
 * Initializes all modules based on page context
 */

import { initSmoothScroll } from './smooth-scroll.js';
import { initNavigation } from './navigation.js';
import { initAllAnimations } from './animations.js';
import { initGuideNavigation } from './guide-nav.js';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing KUONIX website...');
    
    // Initialize navigation (all pages)
    initNavigation();
    
    // Initialize smooth scrolling (all pages) - DISABLED for native scroll feel
    // initSmoothScroll();
    
    // Page-specific initialization
    const isHomePage = document.querySelector('.hero-section');
    const isGuidePage = document.querySelector('.guide-sidebar');
    
    if (isHomePage) {
        console.log('📍 Home page detected');
        // Wait for GSAP to load
        if (typeof gsap !== 'undefined') {
            initAllAnimations();
        } else {
            console.warn('GSAP not loaded, animations disabled');
        }
    }
    
    if (isGuidePage) {
        console.log('📖 Guide page detected');
        initGuideNavigation();
    }
    
    console.log('✅ Initialization complete');
});

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // Refresh ScrollTrigger on resize
        if (typeof ScrollTrigger !== 'undefined') {
            ScrollTrigger.refresh();
        }
    }, 250);
}, { passive: true });
