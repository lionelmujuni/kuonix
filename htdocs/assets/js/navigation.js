/**
 * Navigation Module
 * Handles navigation interactions and scroll effects
 */

export function initNavigation() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    
    // Active page highlighting
    highlightCurrentPage();
    
    // Scroll effects
    handleScrollEffects(nav);
    
    // Smooth scroll for anchor links
    setupAnchorLinks();
    
    console.log('✓ Navigation initialized');
}

function highlightCurrentPage() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    
    document.querySelectorAll('.nav-link').forEach(link => {
        const linkPath = link.getAttribute('href');
        
        if (linkPath === currentPath) {
            link.classList.add('current-page');
            link.setAttribute('aria-current', 'page');
        }
    });
}

function handleScrollEffects(nav) {
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        // Add scrolled class after 100px
        if (currentScroll > 100) {
            nav.classList.add('scrolled');
            nav.classList.remove('blend-mode');
        } else {
            nav.classList.remove('scrolled');
            // Re-add blend mode for home page hero
            if (document.querySelector('.hero-section')) {
                nav.classList.add('blend-mode');
            }
        }
        
        lastScroll = currentScroll;
    }, { passive: true });
}

function setupAnchorLinks() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            
            // Ignore empty hash
            if (href === '#' || href === '#download') return;
            
            e.preventDefault();
            
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                const offsetTop = targetElement.offsetTop - 100;
                
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
                
                // Update URL without jumping
                history.pushState(null, null, href);
            }
        });
    });
}
