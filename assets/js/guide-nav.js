/**
 * Guide Page Navigation Module
 * Handles sidebar navigation and scroll highlighting
 */

export function initGuideNavigation() {
    if (!document.querySelector('.guide-sidebar')) return;
    
    setupSidebarLinks();
    highlightActiveSection();
    
    console.log('✓ Guide navigation initialized');
}

function setupSidebarLinks() {
    const sidebarLinks = document.querySelectorAll('.sidebar-links a');
    
    sidebarLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href || !href.startsWith('#')) return;
            
            e.preventDefault();
            
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 100,
                    behavior: 'smooth'
                });
                
                // Update active state
                sidebarLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            }
        });
    });
}

function highlightActiveSection() {
    const sections = document.querySelectorAll('.content-section, .subsection');
    const sidebarLinks = document.querySelectorAll('.sidebar-links a');
    
    if (sections.length === 0) return;
    
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    
                    sidebarLinks.forEach(link => {
                        link.classList.remove('active');
                        
                        if (link.getAttribute('href') === `#${id}`) {
                            link.classList.add('active');
                        }
                    });
                }
            });
        },
        {
            threshold: 0.3,
            rootMargin: '-100px 0px -50% 0px'
        }
    );
    
    sections.forEach(section => observer.observe(section));
}
