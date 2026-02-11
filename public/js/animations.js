/**
 * ============================================================================
 * ALABOBAI ULTRA ANIMATION SYSTEM
 * World-class 3D animations with Apple-quality design
 * For Ultra Agent V4.0 with Rose Gold palette
 * ============================================================================
 */

(function() {
  'use strict';

  // Rose Gold Color Palette
  const COLORS = {
    roseGold: '#d9a07a',
    roseGoldLight: '#ecd4c0',
    roseGoldBright: '#f0e0d0',
    roseGoldDark: '#b8845c',
    roseGoldDeep: '#8b6442',
    glowRose: 'rgba(217, 160, 122, 0.6)',
    glowSoft: 'rgba(217, 160, 122, 0.3)'
  };

  // Global animation state
  const state = {
    mouseX: 0,
    mouseY: 0,
    scrollY: 0,
    isMobile: window.innerWidth < 768,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  // Utility: Linear interpolation
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  // Utility: Map value from one range to another
  function mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  // Utility: Clamp value between min and max
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // Utility: Debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ============================================================================
  // 1. 3D ROTATING CPU LOGO
  // ============================================================================

  class CPULogo {
    constructor(container) {
      this.container = container;
      this.wrapper = container.querySelector('.cpu-logo-wrapper') || container;
      this.rotationX = 0;
      this.rotationY = 0;
      this.targetRotationX = 0;
      this.targetRotationY = 0;
      this.autoRotate = true;
      this.autoRotationY = 0;

      this.init();
    }

    init() {
      // Add mouse tracking for 3D rotation
      this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.container.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
      this.container.addEventListener('mouseenter', () => {
        this.autoRotate = false;
      });

      // Start animation loop
      this.animate();
    }

    handleMouseMove(e) {
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;

      // Calculate rotation based on mouse position (max 25 degrees)
      this.targetRotationY = mapRange(mouseX, -rect.width / 2, rect.width / 2, -25, 25);
      this.targetRotationX = mapRange(mouseY, -rect.height / 2, rect.height / 2, 25, -25);
    }

    handleMouseLeave() {
      this.targetRotationX = 0;
      this.targetRotationY = 0;
      this.autoRotate = true;
    }

    animate() {
      if (state.reducedMotion) return;

      // Smooth interpolation for rotation - slower, more deliberate (Apple-like)
      this.rotationX = lerp(this.rotationX, this.targetRotationX, 0.04);
      this.rotationY = lerp(this.rotationY, this.targetRotationY + this.autoRotationY, 0.04);

      // Auto rotation when not hovering - much slower, floating feel
      if (this.autoRotate) {
        this.autoRotationY += 0.08;
      }

      // Apply transform
      this.wrapper.style.transform = `
        rotateX(${this.rotationX}deg)
        rotateY(${this.rotationY}deg)
      `;

      requestAnimationFrame(() => this.animate());
    }
  }

  // Create CPU Logo HTML dynamically
  function createCPULogoHTML() {
    return `
      <div class="cpu-logo-wrapper">
        <div class="cpu-logo">
          <div class="cpu-glow"></div>
          <div class="cpu-core"></div>
          <div class="cpu-pins top">
            ${Array(5).fill('<div class="cpu-pin"></div>').join('')}
          </div>
          <div class="cpu-pins bottom">
            ${Array(5).fill('<div class="cpu-pin"></div>').join('')}
          </div>
          <div class="cpu-pins left">
            ${Array(5).fill('<div class="cpu-pin"></div>').join('')}
          </div>
          <div class="cpu-pins right">
            ${Array(5).fill('<div class="cpu-pin"></div>').join('')}
          </div>
          <div class="cpu-reflection"></div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // 2. MAGNETIC CURSOR EFFECT
  // ============================================================================

  class MagneticElement {
    constructor(element) {
      this.element = element;
      this.inner = element.querySelector('.magnetic-inner') || element;
      this.strength = parseFloat(element.dataset.magneticStrength) || 0.3;
      this.innerStrength = parseFloat(element.dataset.magneticInner) || 0.5;
      this.bound = 100;
      this.x = 0;
      this.y = 0;
      this.innerX = 0;
      this.innerY = 0;

      this.init();
    }

    init() {
      this.element.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.element.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
      this.animate();
    }

    handleMouseMove(e) {
      const rect = this.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distanceX = e.clientX - centerX;
      const distanceY = e.clientY - centerY;

      const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

      if (distance < this.bound) {
        this.element.classList.add('active');
        this.x = distanceX * this.strength;
        this.y = distanceY * this.strength;
        this.innerX = distanceX * this.innerStrength;
        this.innerY = distanceY * this.innerStrength;
      }
    }

    handleMouseLeave() {
      this.element.classList.remove('active');
      this.x = 0;
      this.y = 0;
      this.innerX = 0;
      this.innerY = 0;
    }

    animate() {
      if (state.reducedMotion || state.isMobile) return;

      const currentX = parseFloat(this.element.style.getPropertyValue('--mag-x') || 0);
      const currentY = parseFloat(this.element.style.getPropertyValue('--mag-y') || 0);

      // Slower magnetic response - Apple-like fluidity
      const newX = lerp(currentX, this.x, 0.06);
      const newY = lerp(currentY, this.y, 0.06);

      this.element.style.setProperty('--mag-x', newX + 'px');
      this.element.style.setProperty('--mag-y', newY + 'px');
      this.element.style.transform = `translate(${newX}px, ${newY}px)`;

      // Inner element has stronger movement - also slowed down
      const innerCurrentX = parseFloat(this.inner.style.getPropertyValue('--inner-x') || 0);
      const innerCurrentY = parseFloat(this.inner.style.getPropertyValue('--inner-y') || 0);

      const innerNewX = lerp(innerCurrentX, this.innerX, 0.06);
      const innerNewY = lerp(innerCurrentY, this.innerY, 0.06);

      if (this.inner !== this.element) {
        this.inner.style.transform = `translate(${innerNewX}px, ${innerNewY}px)`;
      }

      requestAnimationFrame(() => this.animate());
    }
  }

  // ============================================================================
  // 3. LIQUID MORPHING BUTTONS
  // ============================================================================

  class LiquidButton {
    constructor(element) {
      this.element = element;
      this.bg = element.querySelector('.liquid-btn-bg');
      this.init();
    }

    init() {
      // Create SVG filter if it doesn't exist
      if (!document.getElementById('goo-filter')) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('style', 'position: absolute; width: 0; height: 0;');
        svg.innerHTML = `
          <defs>
            <filter id="goo-filter">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feColorMatrix in="blur" mode="matrix"
                values="1 0 0 0 0
                        0 1 0 0 0
                        0 0 1 0 0
                        0 0 0 19 -9" result="goo" />
              <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
            </filter>
          </defs>
        `;
        document.body.appendChild(svg);
      }

      // Add morph animation on hover
      this.element.addEventListener('mouseenter', () => this.morph());
      this.element.addEventListener('mouseleave', () => this.unmorph());
    }

    morph() {
      if (!this.bg || state.reducedMotion) return;
      this.element.classList.add('morphing');
    }

    unmorph() {
      if (!this.bg || state.reducedMotion) return;
      this.element.classList.remove('morphing');
    }
  }

  // ============================================================================
  // 4. PARALLAX DEPTH LAYERS
  // ============================================================================

  class ParallaxManager {
    constructor() {
      this.layers = [];
      this.init();
    }

    init() {
      document.querySelectorAll('.parallax-layer').forEach(layer => {
        this.layers.push({
          element: layer,
          depth: parseFloat(layer.dataset.depth) || 0.5
        });
      });

      if (this.layers.length > 0) {
        window.addEventListener('scroll', debounce(() => this.update(), 10));
        this.update();
      }
    }

    update() {
      if (state.reducedMotion || state.isMobile) return;

      const scrollY = window.scrollY;

      this.layers.forEach(({ element, depth }) => {
        const yPos = -(scrollY * depth);
        element.style.transform = `translate3d(0, ${yPos}px, 0)`;
      });
    }
  }

  // Mouse parallax for hero sections
  class MouseParallax {
    constructor(container) {
      this.container = container;
      this.layers = [];
      this.init();
    }

    init() {
      this.container.querySelectorAll('[data-parallax-mouse]').forEach(layer => {
        this.layers.push({
          element: layer,
          speed: parseFloat(layer.dataset.parallaxMouse) || 0.05
        });
      });

      if (this.layers.length > 0) {
        this.container.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.animate();
      }
    }

    handleMouseMove(e) {
      const rect = this.container.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left - rect.width / 2) / rect.width;
      this.mouseY = (e.clientY - rect.top - rect.height / 2) / rect.height;
    }

    animate() {
      if (state.reducedMotion || state.isMobile) return;

      this.layers.forEach(({ element, speed }) => {
        const x = (this.mouseX || 0) * speed * 100;
        const y = (this.mouseY || 0) * speed * 100;
        element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });

      requestAnimationFrame(() => this.animate());
    }
  }

  // ============================================================================
  // 5. CARD TILT EFFECT - DISABLED: Cards should be static
  // ============================================================================

  /* DISABLED: TiltCard class removed for static cards
  class TiltCard {
    constructor(element) {
      this.element = element;
      this.inner = element.querySelector('.tilt-card-inner') || element;
      this.shine = element.querySelector('.tilt-card-shine');
      this.maxTilt = parseFloat(element.dataset.tiltMax) || 15;
      this.perspective = parseFloat(element.dataset.tiltPerspective) || 1000;
      this.scale = parseFloat(element.dataset.tiltScale) || 1.02;
      this.speed = parseFloat(element.dataset.tiltSpeed) || 800;

      this.rotateX = 0;
      this.rotateY = 0;
      this.targetRotateX = 0;
      this.targetRotateY = 0;

      this.init();
    }

    init() {
      this.element.style.perspective = `${this.perspective}px`;

      this.element.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
      this.element.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.element.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

      this.animate();
    }

    handleMouseEnter() {
      this.isHovering = true;
      this.element.style.transition = `transform ${this.speed}ms ease-out`;
    }

    handleMouseMove(e) {
      const rect = this.element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;

      this.targetRotateY = mapRange(mouseX, -rect.width / 2, rect.width / 2, -this.maxTilt, this.maxTilt);
      this.targetRotateX = mapRange(mouseY, -rect.height / 2, rect.height / 2, this.maxTilt, -this.maxTilt);

      if (this.shine) {
        const shineX = mapRange(mouseX, -rect.width / 2, rect.width / 2, 0, 100);
        const shineY = mapRange(mouseY, -rect.height / 2, rect.height / 2, 0, 100);
        this.shine.style.background = `
          radial-gradient(
            circle at ${shineX}% ${shineY}%,
            rgba(255, 255, 255, 0.15) 0%,
            rgba(255, 255, 255, 0.05) 40%,
            transparent 60%
          )
        `;
      }
    }

    handleMouseLeave() {
      this.isHovering = false;
      this.targetRotateX = 0;
      this.targetRotateY = 0;

      this.element.style.transition = `transform ${this.speed}ms ease-out`;
      this.inner.style.transform = `rotateX(0deg) rotateY(0deg) scale(1)`;

      if (this.shine) {
        this.shine.style.opacity = '0';
      }
    }

    animate() {
      if (state.reducedMotion || state.isMobile) return;

      this.rotateX = lerp(this.rotateX, this.targetRotateX, 0.04);
      this.rotateY = lerp(this.rotateY, this.targetRotateY, 0.04);

      if (this.isHovering) {
        this.inner.style.transform = `
          rotateX(${this.rotateX}deg)
          rotateY(${this.rotateY}deg)
          scale(${this.scale})
        `;
      }

      requestAnimationFrame(() => this.animate());
    }
  }
  */

  // No-op TiltCard class - does nothing (cards are static)
  class TiltCard {
    constructor(element) {
      // No tilt effect - cards are static
    }
  }

  // ============================================================================
  // 6. TEXT REVEAL ANIMATIONS
  // ============================================================================

  class TextReveal {
    constructor(element, options = {}) {
      this.element = element;
      this.type = options.type || element.dataset.textReveal || 'char';
      // Slower text reveal - more deliberate, Apple-like pacing
      this.delay = parseFloat(options.delay || element.dataset.textDelay) || 0.08;
      this.threshold = parseFloat(options.threshold || element.dataset.textThreshold) || 0.2;
      this.hasRevealed = false;

      this.init();
    }

    init() {
      // Prepare text based on type
      switch (this.type) {
        case 'char':
          this.prepareChars();
          break;
        case 'word':
          this.prepareWords();
          break;
        case 'line':
          this.prepareLines();
          break;
        case 'glow':
          this.element.classList.add('text-reveal-glow');
          break;
      }

      // Setup intersection observer
      this.setupObserver();
    }

    prepareChars() {
      const text = this.element.textContent;
      this.element.innerHTML = '';
      this.element.classList.add('text-reveal-char');

      text.split('').forEach((char, i) => {
        const span = document.createElement('span');
        span.classList.add('char');
        span.textContent = char === ' ' ? '\u00A0' : char;
        span.style.transitionDelay = `${i * this.delay}s`;
        this.element.appendChild(span);
      });
    }

    prepareWords() {
      const words = this.element.textContent.split(' ');
      this.element.innerHTML = '';
      this.element.classList.add('text-reveal-word');

      words.forEach((word, i) => {
        const wrapper = document.createElement('span');
        wrapper.style.display = 'inline-block';
        wrapper.style.overflow = 'hidden';
        wrapper.style.marginRight = '0.3em';

        const span = document.createElement('span');
        span.classList.add('word');
        span.textContent = word;
        // Slower word reveal with breathing pauses between words
        span.style.transitionDelay = `${i * this.delay * 4}s`;

        wrapper.appendChild(span);
        this.element.appendChild(wrapper);
      });
    }

    prepareLines() {
      const html = this.element.innerHTML;
      this.element.innerHTML = `<span class="line">${html}</span>`;
      this.element.classList.add('text-reveal-line');
    }

    setupObserver() {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting && !this.hasRevealed) {
              this.reveal();
              this.hasRevealed = true;
            }
          });
        },
        { threshold: this.threshold }
      );

      observer.observe(this.element);
    }

    reveal() {
      this.element.classList.add('revealed');
    }
  }

  // ============================================================================
  // 7. SCROLL REVEAL
  // ============================================================================

  class ScrollReveal {
    constructor() {
      this.elements = [];
      this.init();
    }

    init() {
      document.querySelectorAll('.scroll-reveal').forEach(element => {
        this.elements.push(element);
      });

      if (this.elements.length > 0) {
        this.setupObserver();
      }
    }

    setupObserver() {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const delay = entry.target.dataset.scrollDelay || 0;
              setTimeout(() => {
                entry.target.classList.add('revealed');
              }, delay * 1000);
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
      );

      this.elements.forEach(element => observer.observe(element));
    }
  }

  // ============================================================================
  // 8. PARTICLE SYSTEM
  // ============================================================================

  class ParticleSystem {
    constructor(container) {
      this.container = container;
      this.particles = [];
      this.maxParticles = 30;
      this.init();
    }

    init() {
      if (state.reducedMotion || state.isMobile) return;

      // Create initial particles
      for (let i = 0; i < this.maxParticles; i++) {
        this.createParticle();
      }
    }

    createParticle() {
      const particle = document.createElement('div');
      particle.classList.add('particle');

      // Random position
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = Math.random() * 100 + '%';

      // Random size
      const size = Math.random() * 4 + 2;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';

      // Random animation properties
      const tx = (Math.random() - 0.5) * 200;
      const ty = -(Math.random() * 100 + 50);
      particle.style.setProperty('--tx', tx + 'px');
      particle.style.setProperty('--ty', ty + 'vh');

      // Slower animation duration - particles float gracefully
      particle.style.animationDuration = (Math.random() * 20 + 25) + 's';
      particle.style.animationDelay = Math.random() * 15 + 's';

      this.container.appendChild(particle);
      this.particles.push(particle);
    }
  }

  // ============================================================================
  // 9. CURSOR TRAIL (Optional - for extra magic)
  // ============================================================================

  class CursorTrail {
    constructor() {
      if (state.isMobile || state.reducedMotion) return;

      this.trail = null;
      this.dot = null;
      this.init();
    }

    init() {
      // Create cursor elements
      this.trail = document.createElement('div');
      this.trail.classList.add('cursor-trail');

      this.dot = document.createElement('div');
      this.dot.classList.add('cursor-trail-dot');

      document.body.appendChild(this.trail);
      document.body.appendChild(this.dot);

      document.addEventListener('mousemove', this.handleMouseMove.bind(this));

      // Hide default cursor on magnetic elements (tilt-card removed - static)
      document.querySelectorAll('.magnetic, .liquid-btn').forEach(el => {
        el.style.cursor = 'none';
      });

      this.animate();
    }

    handleMouseMove(e) {
      this.targetX = e.clientX;
      this.targetY = e.clientY;
    }

    animate() {
      if (!this.trail || !this.dot) return;

      const currentX = parseFloat(this.trail.style.left) || this.targetX;
      const currentY = parseFloat(this.trail.style.top) || this.targetY;

      // Slower cursor trail - smooth, flowing movement
      const newX = lerp(currentX, this.targetX || 0, 0.06);
      const newY = lerp(currentY, this.targetY || 0, 0.06);

      this.trail.style.left = newX + 'px';
      this.trail.style.top = newY + 'px';
      this.trail.style.transform = `translate(-50%, -50%)`;

      this.dot.style.left = this.targetX + 'px';
      this.dot.style.top = this.targetY + 'px';

      requestAnimationFrame(() => this.animate());
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function initAnimations() {
    // Update mobile state
    state.isMobile = window.innerWidth < 768;
    state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Initialize CPU Logos
    document.querySelectorAll('.cpu-logo-container').forEach(container => {
      // If container is empty, add HTML
      if (!container.querySelector('.cpu-logo')) {
        container.innerHTML = createCPULogoHTML();
      }
      new CPULogo(container);
    });

    // 2. Initialize Magnetic Elements
    document.querySelectorAll('.magnetic').forEach(element => {
      new MagneticElement(element);
    });

    // 3. Initialize Liquid Buttons
    document.querySelectorAll('.liquid-btn, .liquid-btn-gooey').forEach(button => {
      new LiquidButton(button);
    });

    // 4. Initialize Parallax
    new ParallaxManager();
    document.querySelectorAll('[data-mouse-parallax]').forEach(container => {
      new MouseParallax(container);
    });

    // 5. Initialize Tilt Cards - DISABLED: Cards should be static
    // document.querySelectorAll('.tilt-card').forEach(card => {
    //   new TiltCard(card);
    // });

    // 6. Initialize Text Reveals
    document.querySelectorAll('[data-text-reveal]').forEach(element => {
      new TextReveal(element);
    });

    // 7. Initialize Scroll Reveal
    new ScrollReveal();

    // 8. Initialize Particle System
    const particleContainer = document.querySelector('.particle-container');
    if (particleContainer) {
      new ParticleSystem(particleContainer);
    }

    // 9. Initialize Cursor Trail (optional - uncomment if desired)
    // new CursorTrail();

    console.log('Alabobai Ultra Animation System initialized');
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnimations);
  } else {
    initAnimations();
  }

  // Re-initialize on resize (debounced)
  window.addEventListener('resize', debounce(() => {
    state.isMobile = window.innerWidth < 768;
  }, 250));

  // Export for manual initialization
  window.AlabobaiAnimations = {
    init: initAnimations,
    CPULogo,
    MagneticElement,
    LiquidButton,
    TiltCard,
    TextReveal,
    ScrollReveal,
    ParticleSystem,
    CursorTrail,
    createCPULogoHTML,
    COLORS
  };

})();
