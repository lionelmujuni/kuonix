/**
 * GSAP + ScrollTrigger motion system for KUONIX marketing pages.
 */

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isDesktop() {
    return window.innerWidth >= 1025;
}

export function initHeroAnimations() {
    const hero = document.querySelector('.hero-section');
    if (!hero) return;

    const logoFloat = hero.querySelector('.hero-logo-float');
    const logoImg = hero.querySelector('.hero-logo-img');
    const logoGhost = hero.querySelector('.hero-logo-img--ghost');
    const logoBeam = hero.querySelector('.hero-logo-beam');
    const logoEchoes = hero.querySelectorAll('.hero-logo-echo');
    const logoGrid = hero.querySelector('.hero-logo-grid');
    const eyebrow = hero.querySelector('.eyebrow');
    const title = hero.querySelector('.hero-title');
    const subtitle = hero.querySelector('.hero-subtitle');
    const actions = hero.querySelector('.hero-actions');
    const metrics = hero.querySelector('.hero-metrics');
    const dashboard = hero.querySelector('.hero-dashboard');
    const pills = hero.querySelectorAll('.hero-pill');
    const bars = hero.querySelectorAll('.signal-bars span');

    if (prefersReducedMotion()) {
        gsap.set([logoImg, logoGhost, logoBeam, logoEchoes, logoGrid, eyebrow, title, subtitle, actions, metrics, dashboard, pills], {
            opacity: 1,
            y: 0,
            scale: 1,
            clearProps: 'filter',
        });
        return;
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    gsap.set([eyebrow, title, subtitle, actions, metrics, dashboard], { opacity: 0, y: 28 });
    if (logoImg) {
        gsap.set(logoImg, { opacity: 0, scale: 0.86, y: 24, filter: 'blur(10px)' });
    }
    if (logoGhost) {
        gsap.set(logoGhost, { opacity: 0, scale: 1.04 });
    }
    if (logoBeam) {
        gsap.set(logoBeam, { xPercent: -120, opacity: 0 });
    }
    if (logoEchoes.length) {
        gsap.set(logoEchoes, { opacity: 0, scale: 0.9 });
    }
    if (logoGrid) {
        gsap.set(logoGrid, { opacity: 0 });
    }
    if (pills.length) {
        gsap.set(pills, { opacity: 0, y: 16 });
    }

    if (logoEchoes.length) {
        tl.to(
            logoEchoes,
            {
                opacity: 0.55,
                scale: 1,
                duration: 0.9,
                stagger: 0.08,
            }
        );
    }

    if (logoGrid) {
        tl.to(logoGrid, { opacity: 0.24, duration: 0.55 }, '-=0.55');
    }

    if (logoImg) {
        tl.to(logoImg, {
            opacity: 1,
            scale: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 1,
        });
    }

    if (logoGhost) {
        tl.to(
            logoGhost,
            {
                opacity: 0.22,
                scale: 1,
                duration: 0.85,
            },
            '-=0.8'
        );
    }

    if (logoBeam) {
        tl.to(
            logoBeam,
            {
                opacity: 1,
                xPercent: 120,
                duration: 1.15,
                ease: 'power2.inOut',
            },
            '-=0.6'
        );
    }

    tl.to(eyebrow, { opacity: 1, y: 0, duration: 0.55 }, '-=0.55')
        .to(title, { opacity: 1, y: 0, duration: 0.85 }, '-=0.35')
        .to(subtitle, { opacity: 1, y: 0, duration: 0.75 }, '-=0.45')
        .to(actions, { opacity: 1, y: 0, duration: 0.65 }, '-=0.45')
        .to(
            pills,
            {
                opacity: 1,
                y: 0,
                duration: 0.45,
                stagger: 0.08,
            },
            '-=0.35'
        )
        .to(metrics, { opacity: 1, y: 0, duration: 0.7 }, '-=0.25')
        .to(dashboard, { opacity: 1, y: 0, duration: 0.8 }, '-=0.5');

    if (logoFloat) {
        gsap.to(logoFloat, {
            y: 12,
            duration: 3.4,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
        });
    }

    if (logoGhost) {
        gsap.to(logoGhost, {
            x: 12,
            y: -8,
            opacity: 0.28,
            duration: 4.2,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
        });
    }

    if (logoEchoes.length) {
        logoEchoes.forEach((echo, index) => {
            gsap.to(echo, {
                scale: index === 0 ? 0.98 : 1.12,
                opacity: index === 0 ? 0.34 : 0.18,
                duration: 3.8 + index * 0.6,
                ease: 'sine.inOut',
                repeat: -1,
                yoyo: true,
            });
        });
    }

    if (logoBeam) {
        gsap.fromTo(
            logoBeam,
            { xPercent: -120, opacity: 0 },
            {
                xPercent: 120,
                opacity: 0.9,
                duration: 2.6,
                ease: 'none',
                repeat: -1,
                repeatDelay: 1.2,
            }
        );
    }

    if (bars.length) {
        bars.forEach((bar, index) => {
            gsap.fromTo(
                bar,
                { scaleY: 0.18, transformOrigin: 'bottom center' },
                {
                    scaleY: 1,
                    duration: 1,
                    delay: 0.7 + index * 0.08,
                    ease: 'elastic.out(1, 0.65)',
                }
            );
        });
    }

    gsap.to('.hero-bg', {
        yPercent: 16,
        ease: 'none',
        scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
        },
    });

    gsap.to('.hero-dashboard', {
        yPercent: -10,
        ease: 'none',
        scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
        },
    });
}

export function initWorkflowScroll() {
    const workflowSection = document.querySelector('.workflow-section');
    const steps = gsap.utils.toArray('.workflow-section .workflow-step');

    if (!workflowSection || steps.length < 2) return;
    if (prefersReducedMotion() || !isDesktop()) return;

    const containerTween = gsap.to(steps, {
        xPercent: -100 * (steps.length - 1),
        ease: 'none',
        scrollTrigger: {
            trigger: workflowSection,
            pin: true,
            scrub: 1,
            start: 'top top',
            end: () => '+=' + workflowSection.offsetWidth * (steps.length - 0.15),
        },
    });

    steps.forEach((step) => {
        const text = step.querySelector('.step-text');
        const panel = step.querySelector('.step-visual');

        if (text) {
            gsap.from(text.children, {
                y: 28,
                opacity: 0,
                duration: 0.7,
                stagger: 0.08,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: step,
                    start: 'left center',
                    containerAnimation: containerTween,
                },
            });
        }

        if (panel) {
            gsap.from(panel, {
                opacity: 0,
                scale: 0.96,
                duration: 0.8,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: step,
                    start: 'left center',
                    containerAnimation: containerTween,
                },
            });
        }
    });
}

export function initRevealAnimations() {
    const revealBlocks = gsap.utils.toArray('[data-reveal], .reveal-on-scroll');
    if (!revealBlocks.length || prefersReducedMotion()) return;

    revealBlocks.forEach((block) => {
        const direction = block.dataset.reveal === 'up' ? 46 : 32;
        gsap.from(block, {
            y: direction,
            opacity: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: block,
                start: 'top 85%',
                toggleActions: 'play none none none',
            },
        });
    });
}

export function initIssueCards() {
    const cards = gsap.utils.toArray('.issue-card, .feature-card, .bento-card, .algorithm-card');
    if (!cards.length || prefersReducedMotion()) return;

    cards.forEach((card) => {
        gsap.from(card, {
            y: 40,
            opacity: 0,
            duration: 0.75,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: card,
                start: 'top 88%',
                toggleActions: 'play none none none',
            },
        });
    });
}

export function initImageParallax() {
    const images = gsap.utils.toArray('.gallery-img img, .guide-shell__thumbs img, .analysis-grid img');
    if (!images.length || prefersReducedMotion()) return;

    images.forEach((img) => {
        const wrap = img.closest('.gallery-img, .guide-shell, .analysis-board');
        if (!wrap) return;

        gsap.fromTo(
            img,
            { yPercent: -6 },
            {
                yPercent: 6,
                ease: 'none',
                scrollTrigger: {
                    trigger: wrap,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: true,
                },
            }
        );
    });
}

export function initTechPanelMotion() {
    const panels = gsap.utils.toArray('.tech-panel, .mock-console, .guide-shell, .lab-preview');
    if (!panels.length || prefersReducedMotion()) return;

    panels.forEach((panel, index) => {
        gsap.to(panel, {
            y: index % 2 === 0 ? -8 : 8,
            duration: 3 + index * 0.15,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
        });
    });
}

export function initGuideHeroMotion() {
    const guideHero = document.querySelector('.guide-hero');
    if (!guideHero || prefersReducedMotion()) return;

    gsap.from('.guide-hero__content > *', {
        y: 26,
        opacity: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: 'power3.out',
    });

    gsap.from('.guide-hero__panel', {
        opacity: 0,
        y: 32,
        scale: 0.97,
        duration: 0.85,
        ease: 'power3.out',
        delay: 0.25,
    });
}

export function initAllAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
        return;
    }

    gsap.registerPlugin(ScrollTrigger);

    initHeroAnimations();
    initGuideHeroMotion();
    initRevealAnimations();
    initIssueCards();
    initWorkflowScroll();
    initImageParallax();
    initTechPanelMotion();
}
