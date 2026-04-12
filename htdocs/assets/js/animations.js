/**
 * GSAP Animation Module
 * All page animations using GSAP and ScrollTrigger
 */

// Hero section animations
export function initHeroAnimations() {
    if (!document.querySelector('.hero-section')) return;
    
    const tlHero = gsap.timeline();
    
    tlHero
        .to(".hero-title", {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: "power3.out"
        })
        .to(".hero-subtitle", {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: "power3.out"
        }, "-=0.6");
    
    // Parallax effect on hero background
    gsap.to(".hero-bg", {
        yPercent: 20,
        ease: "none",
        scrollTrigger: {
            trigger: ".hero-section",
            start: "top top",
            end: "bottom top",
            scrub: true
        }
    });
    
    console.log('✓ Hero animations initialized');
}

// Horizontal workflow scroll with screenshot scale animation
export function initWorkflowScroll() {
    const sections = gsap.utils.toArray(".workflow-step");
    const workflowSection = document.querySelector(".workflow-section");
    
    if (sections.length === 0 || !workflowSection) return;
    
    // Horizontal scroll animation
    gsap.to(sections, {
        xPercent: -100 * (sections.length - 1),
        ease: "none",
        scrollTrigger: {
            trigger: ".workflow-section",
            pin: true,
            scrub: 1,
            start: "top top",
            end: () => "+=" + (workflowSection.offsetWidth * sections.length)
        }
    });
    
    // Screenshot scale animation - scales up as image reaches center, down as it exits
    const screenshots = gsap.utils.toArray(".workflow-screenshot");
    screenshots.forEach((screenshot) => {
        gsap.fromTo(screenshot,
            {
                scale: 1.0
            },
            {
                scale: 1.15,
                ease: "none",
                scrollTrigger: {
                    trigger: ".workflow-section",
                    start: "top top",
                    end: () => "+=" + (window.innerWidth * sections.length),
                    scrub: 1,
                    onUpdate: (self) => {
                        // Calculate distance from viewport center
                        const rect = screenshot.getBoundingClientRect();
                        const centerX = window.innerWidth / 2;
                        const elementCenterX = rect.left + rect.width / 2;
                        const distanceFromCenter = Math.abs(centerX - elementCenterX);
                        const maxDistance = window.innerWidth / 2;
                        
                        // Scale based on distance (closer to center = larger scale)
                        const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1);
                        const scale = 1.15 - (normalizedDistance * 0.15); // Range: 1.0 to 1.15
                        
                        gsap.set(screenshot, { scale: scale });
                    }
                }
            }
        );
    });
    
    console.log('✓ Workflow scroll with screenshot animation initialized');
}

// Bento cards and issue cards stagger animation
export function initBentoCards() {
    const cards = gsap.utils.toArray(".bento-card, .issue-card");
    
    if (cards.length === 0) return;
    
    cards.forEach((card) => {
        gsap.from(card, {
            y: 100,
            opacity: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
                trigger: card,
                start: "top 85%",
                toggleActions: "play none none none"
            }
        });
    });
    
    console.log('✓ Bento cards and issue cards animation initialized');
}

// Gallery parallax effect
export function initGalleryParallax() {
    const images = gsap.utils.toArray(".gallery-img");
    
    if (images.length === 0) return;
    
    images.forEach(imgWrapper => {
        const img = imgWrapper.querySelector("img");
        if (!img) return;
        
        gsap.fromTo(img,
            { scale: 1.2 },
            {
                scale: 1,
                scrollTrigger: {
                    trigger: imgWrapper,
                    start: "top bottom",
                    end: "bottom top",
                    scrub: true
                }
            }
        );
    });
    
    console.log('✓ Gallery parallax initialized');
}

// Initialize all animations
export function initAllAnimations() {
    if (typeof gsap === 'undefined') {
        console.warn('GSAP not loaded');
        return;
    }
    
    gsap.registerPlugin(ScrollTrigger);
    
    initHeroAnimations();
    initWorkflowScroll();
    initBentoCards();
    initGalleryParallax();
    
    console.log('✓ All animations initialized');
}
