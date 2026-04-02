/**
 * Initializes all modules based on page context
 */

import { initNavigation } from './navigation.js';
import { initAllAnimations } from './animations.js';
import { initGuideNavigation } from './guide-nav.js';

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();

    const isGuidePage = document.querySelector('.guide-sidebar');

    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        initAllAnimations();
    }

    if (isGuidePage) {
        initGuideNavigation();
    }
});

let resizeTimeout;
window.addEventListener(
    'resize',
    () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (typeof ScrollTrigger !== 'undefined') {
                ScrollTrigger.refresh();
            }
        }, 250);
    },
    { passive: true }
);
