/**
 * ============================================================================
 * ALABOBAI ULTRA AGENT V4.0 - Dynamic Background System
 * Warm Rose Gold Gradient Glow - Apple Futuristic Design
 * ============================================================================
 */

class AlabobaiBG {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.time = 0;
    this.animationId = null;

    // Color palette - Warm Rose Gold theme
    this.colors = {
      roseGold: { r: 217, g: 160, b: 122 },
      roseGoldLight: { r: 236, g: 212, b: 192 },
      copper: { r: 201, g: 149, b: 108 },
      bronze: { r: 166, g: 124, b: 82 },
      roseGoldDark: { r: 184, g: 132, b: 92 },
      warmBlack: { r: 10, g: 8, b: 6 }
    };

    // Effect instances - ONLY gradient glow effects (no particles/stars)
    this.gradientMesh = null;
    this.floatingOrbs = []; // Disabled - kept for API compatibility
    this.particles = []; // Disabled - no stars/particles
    this.gridLines = null; // Disabled for cleaner look
    this.aurora = null;

    // Performance - lower FPS for subtle animation
    this.lastFrame = 0;
    this.targetFPS = 30; // Slower for subtle, elegant movement
    this.frameInterval = 1000 / this.targetFPS;

    this.init();
  }

  init() {
    this.createCanvas();
    this.createNoiseOverlay();
    this.setupEventListeners();
    this.initEffects();
    this.animate();
  }

  createCanvas() {
    // Main canvas for effects
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'alabobai-bg-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    `;
    document.body.insertBefore(this.canvas, document.body.firstChild);
    this.ctx = this.canvas.getContext('2d');
    this.resize();
  }

  createNoiseOverlay() {
    // Create noise texture canvas
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = 256;
    noiseCanvas.height = 256;
    const noiseCtx = noiseCanvas.getContext('2d');

    const imageData = noiseCtx.createImageData(256, 256);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const value = Math.random() * 255;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 15; // Very subtle opacity
    }

    noiseCtx.putImageData(imageData, 0, 0);

    // Create noise overlay div
    const noiseOverlay = document.createElement('div');
    noiseOverlay.id = 'noise-overlay';
    noiseOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      pointer-events: none;
      background-image: url(${noiseCanvas.toDataURL()});
      opacity: 0.4;
      mix-blend-mode: overlay;
    `;
    document.body.insertBefore(noiseOverlay, this.canvas.nextSibling);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.resize());

    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    // Touch support
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.mouseX = e.touches[0].clientX;
        this.mouseY = e.touches[0].clientY;
      }
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Reinitialize effects on resize
    if (this.gridLines) {
      this.initGridLines();
    }
  }

  initEffects() {
    // Only initialize gradient glow effects - no particles or stars
    this.initGradientMesh();
    this.initAurora();
    // Particles, orbs, and grid lines DISABLED for clean rose gold glow
    // this.initFloatingOrbs();
    // this.initParticles();
    // this.initGridLines();
  }

  // ============================================================================
  // 1. ANIMATED GRADIENT MESH - Warm Rose Gold Glow
  // ============================================================================

  initGradientMesh() {
    // Large, slow-moving warm glow zones - Apple futuristic elegance
    this.gradientMesh = {
      blobs: [
        // Central primary rose gold glow
        { x: 0.5, y: 0.45, vx: 0.00003, vy: 0.00004, radius: 0.7, color: this.colors.roseGold, intensity: 0.18 },
        // Upper warm accent
        { x: 0.4, y: 0.25, vx: 0.00004, vy: 0.00003, radius: 0.5, color: this.colors.roseGoldLight, intensity: 0.1 },
        // Lower copper warmth
        { x: 0.6, y: 0.7, vx: -0.00003, vy: 0.00002, radius: 0.55, color: this.colors.copper, intensity: 0.12 },
        // Left bronze accent
        { x: 0.25, y: 0.5, vx: 0.00002, vy: -0.00003, radius: 0.4, color: this.colors.bronze, intensity: 0.08 },
        // Right rose gold dark
        { x: 0.75, y: 0.4, vx: -0.00002, vy: 0.00003, radius: 0.45, color: this.colors.roseGoldDark, intensity: 0.1 }
      ],
      // Breathing pulse for subtle life
      pulsePhase: 0
    };
  }

  drawGradientMesh() {
    const { blobs, pulsePhase } = this.gradientMesh;

    // Update breathing pulse - very slow
    this.gradientMesh.pulsePhase += 0.0008;
    const breathe = 1 + Math.sin(this.gradientMesh.pulsePhase) * 0.08;

    blobs.forEach((blob, i) => {
      // Update position with extremely gentle movement - imperceptible drift
      blob.x += blob.vx + Math.sin(this.time * 0.00008 + i * 1.5) * 0.00001;
      blob.y += blob.vy + Math.cos(this.time * 0.00008 + i * 0.8) * 0.00001;

      // Soft bounce off edges with padding
      if (blob.x < 0.15 || blob.x > 0.85) blob.vx *= -1;
      if (blob.y < 0.15 || blob.y > 0.85) blob.vy *= -1;

      // Clamp positions
      blob.x = Math.max(0.1, Math.min(0.9, blob.x));
      blob.y = Math.max(0.1, Math.min(0.9, blob.y));

      // Draw warm gradient blob with breathing effect
      const x = blob.x * this.width;
      const y = blob.y * this.height;
      const baseRadius = blob.radius * Math.min(this.width, this.height);
      const radius = baseRadius * breathe;

      // Multi-layer gradient for depth
      const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${blob.color.r}, ${blob.color.g}, ${blob.color.b}, ${blob.intensity * breathe})`);
      gradient.addColorStop(0.3, `rgba(${blob.color.r}, ${blob.color.g}, ${blob.color.b}, ${blob.intensity * 0.6})`);
      gradient.addColorStop(0.6, `rgba(${blob.color.r}, ${blob.color.g}, ${blob.color.b}, ${blob.intensity * 0.25})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, this.width, this.height);
    });

    // Draw central emanating glow - the "heart" of the warmth
    this.drawCentralGlow(breathe);
  }

  // Central rose gold glow emanating from center
  drawCentralGlow(breathe) {
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.45;
    const maxRadius = Math.max(this.width, this.height) * 0.6;

    const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius * breathe);
    gradient.addColorStop(0, `rgba(217, 160, 122, ${0.12 * breathe})`);
    gradient.addColorStop(0.2, `rgba(217, 160, 122, ${0.08 * breathe})`);
    gradient.addColorStop(0.4, `rgba(201, 149, 108, ${0.05 * breathe})`);
    gradient.addColorStop(0.6, `rgba(184, 132, 92, ${0.03 * breathe})`);
    gradient.addColorStop(0.8, `rgba(166, 124, 82, ${0.01 * breathe})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  // ============================================================================
  // 2. FLOATING ORBS
  // ============================================================================

  initFloatingOrbs() {
    this.floatingOrbs = [];
    const orbCount = Math.min(8, Math.floor(this.width / 200));

    for (let i = 0; i < orbCount; i++) {
      this.floatingOrbs.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: 20 + Math.random() * 60,
        // Much slower orb velocities - graceful floating
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        color: Object.values(this.colors)[Math.floor(Math.random() * 5)],
        phase: Math.random() * Math.PI * 2,
        // Slower pulse for breathing effect
        pulseSpeed: 0.0003 + Math.random() * 0.0006
      });
    }
  }

  drawFloatingOrbs() {
    this.floatingOrbs.forEach((orb, i) => {
      // Organic movement - slower, more deliberate floating
      orb.x += orb.vx + Math.sin(this.time * 0.00015 + orb.phase) * 0.15;
      orb.y += orb.vy + Math.cos(this.time * 0.0002 + orb.phase) * 0.1;

      // Wrap around edges
      if (orb.x < -orb.radius) orb.x = this.width + orb.radius;
      if (orb.x > this.width + orb.radius) orb.x = -orb.radius;
      if (orb.y < -orb.radius) orb.y = this.height + orb.radius;
      if (orb.y > this.height + orb.radius) orb.y = -orb.radius;

      // Pulse effect
      const pulse = 1 + Math.sin(this.time * orb.pulseSpeed) * 0.1;
      const currentRadius = orb.radius * pulse;

      // Draw glowing orb with multiple layers
      for (let layer = 3; layer >= 0; layer--) {
        const layerRadius = currentRadius * (1 + layer * 0.5);
        const alpha = 0.03 - layer * 0.008;

        const gradient = this.ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, layerRadius
        );
        gradient.addColorStop(0, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, ${alpha})`);
        gradient.addColorStop(0.6, `rgba(${orb.color.r}, ${orb.color.g}, ${orb.color.b}, ${alpha * 0.5})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(orb.x, orb.y, layerRadius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Core bright center
      const coreGradient = this.ctx.createRadialGradient(
        orb.x, orb.y, 0,
        orb.x, orb.y, currentRadius * 0.3
      );
      coreGradient.addColorStop(0, `rgba(${orb.color.r + 30}, ${orb.color.g + 30}, ${orb.color.b + 30}, 0.15)`);
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      this.ctx.fillStyle = coreGradient;
      this.ctx.beginPath();
      this.ctx.arc(orb.x, orb.y, currentRadius * 0.3, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  // ============================================================================
  // 3. PARTICLE SYSTEM WITH CONSTELLATION EFFECT
  // ============================================================================

  initParticles() {
    this.particles = [];
    const particleCount = Math.min(80, Math.floor((this.width * this.height) / 15000));

    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        // Much slower particle drift - like dust motes in sunlight
        vx: (Math.random() - 0.5) * 0.06,
        vy: -0.03 - Math.random() * 0.08, // Gentle upward drift
        radius: 1 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.4,
        color: Object.values(this.colors)[Math.floor(Math.random() * 5)]
      });
    }
  }

  drawParticles() {
    const connectionDistance = 150;
    const mouseInfluence = 100;

    this.particles.forEach((particle, i) => {
      // Mouse interaction - gentle attraction
      const dx = this.mouseX - particle.x;
      const dy = this.mouseY - particle.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < mouseInfluence && dist > 0) {
        // Gentler mouse attraction - subtle, not aggressive
        const force = (mouseInfluence - dist) / mouseInfluence * 0.006;
        particle.vx += (dx / dist) * force;
        particle.vy += (dy / dist) * force;
      }

      // Apply velocity with damping
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vx *= 0.99;
      particle.vy *= 0.99;

      // Reset particle when it goes off screen
      if (particle.y < -10) {
        particle.y = this.height + 10;
        particle.x = Math.random() * this.width;
      }
      if (particle.x < -10) particle.x = this.width + 10;
      if (particle.x > this.width + 10) particle.x = -10;

      // Draw particle
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${particle.alpha})`;
      this.ctx.fill();

      // Draw connections (constellation effect)
      for (let j = i + 1; j < this.particles.length; j++) {
        const other = this.particles[j];
        const pdx = particle.x - other.x;
        const pdy = particle.y - other.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

        if (pdist < connectionDistance) {
          const opacity = (1 - pdist / connectionDistance) * 0.15;
          this.ctx.beginPath();
          this.ctx.moveTo(particle.x, particle.y);
          this.ctx.lineTo(other.x, other.y);
          this.ctx.strokeStyle = `rgba(217, 160, 122, ${opacity})`;
          this.ctx.lineWidth = 0.5;
          this.ctx.stroke();
        }
      }
    });
  }

  // ============================================================================
  // 4. PERSPECTIVE GRID LINES
  // ============================================================================

  initGridLines() {
    this.gridLines = {
      horizontalCount: 20,
      verticalCount: 30,
      vanishingPointY: this.height * 0.4,
      pulsePhase: 0
    };
  }

  drawGridLines() {
    const grid = this.gridLines;
    const horizon = grid.vanishingPointY;
    const bottomY = this.height + 100;

    // Only draw grid in bottom portion of screen
    if (this.height < 500) return;

    this.ctx.save();

    // Pulse effect - slower breathing
    grid.pulsePhase += 0.0015;
    const pulseIntensity = 0.3 + Math.sin(grid.pulsePhase) * 0.15;

    // Draw horizontal lines (perspective)
    for (let i = 0; i < grid.horizontalCount; i++) {
      const t = i / grid.horizontalCount;
      const y = horizon + (bottomY - horizon) * Math.pow(t, 1.5);
      const alpha = t * pulseIntensity * 0.3;

      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.strokeStyle = `rgba(217, 160, 122, ${alpha})`;
      this.ctx.lineWidth = 0.5;
      this.ctx.stroke();
    }

    // Draw vertical lines (converging to vanishing point)
    const centerX = this.width / 2;
    for (let i = 0; i < grid.verticalCount; i++) {
      const t = (i - grid.verticalCount / 2) / (grid.verticalCount / 2);
      const bottomX = centerX + t * this.width * 0.8;
      const alpha = (1 - Math.abs(t)) * pulseIntensity * 0.2;

      this.ctx.beginPath();
      this.ctx.moveTo(centerX, horizon);
      this.ctx.lineTo(bottomX, bottomY);
      this.ctx.strokeStyle = `rgba(217, 160, 122, ${alpha})`;
      this.ctx.lineWidth = 0.5;
      this.ctx.stroke();
    }

    // Add glow at horizon
    const horizonGlow = this.ctx.createLinearGradient(0, horizon - 50, 0, horizon + 100);
    horizonGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    horizonGlow.addColorStop(0.5, `rgba(217, 160, 122, ${pulseIntensity * 0.05})`);
    horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    this.ctx.fillStyle = horizonGlow;
    this.ctx.fillRect(0, horizon - 50, this.width, 150);

    this.ctx.restore();
  }

  // ============================================================================
  // 5. VIGNETTE EFFECT - Darker edges for depth
  // ============================================================================

  initAurora() {
    // Repurposed as subtle warm atmospheric haze
    this.aurora = {
      // Very subtle warm haze layers
      hazePhase: 0
    };
  }

  drawAurora() {
    // Draw vignette effect - darker edges, warm center
    this.drawVignette();
    // Draw subtle warm atmospheric haze at top
    this.drawWarmHaze();
  }

  drawVignette() {
    // Create vignette that darkens edges while keeping warm center
    const gradient = this.ctx.createRadialGradient(
      this.width * 0.5, this.height * 0.45, 0,
      this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.8
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.75, 'rgba(8, 6, 4, 0.3)');
    gradient.addColorStop(0.9, 'rgba(5, 4, 3, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  drawWarmHaze() {
    // Subtle warm atmospheric haze at top portion
    this.aurora.hazePhase += 0.0003;
    const hazeBreathe = 1 + Math.sin(this.aurora.hazePhase) * 0.05;

    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height * 0.4);
    gradient.addColorStop(0, `rgba(217, 160, 122, ${0.04 * hazeBreathe})`);
    gradient.addColorStop(0.5, `rgba(201, 149, 108, ${0.02 * hazeBreathe})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height * 0.4);
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================

  animate(currentTime = 0) {
    this.animationId = requestAnimationFrame((t) => this.animate(t));

    // Frame rate limiting for performance
    const elapsed = currentTime - this.lastFrame;
    if (elapsed < this.frameInterval) return;
    this.lastFrame = currentTime - (elapsed % this.frameInterval);

    this.time = currentTime;

    // Clear canvas with warm black base
    this.ctx.fillStyle = 'rgba(10, 8, 6, 1)';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw effects in order (back to front) - ONLY gradient glow effects
    this.drawGradientMesh();
    this.drawAurora(); // Now draws vignette and warm haze
    // Particles, orbs, and grid DISABLED for clean rose gold glow
    // this.drawGridLines();
    // this.drawFloatingOrbs();
    // this.drawParticles();
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    const noiseOverlay = document.getElementById('noise-overlay');
    if (noiseOverlay && noiseOverlay.parentNode) {
      noiseOverlay.parentNode.removeChild(noiseOverlay);
    }
  }

  // Toggle individual effects
  toggleEffect(effect, enabled) {
    switch(effect) {
      case 'mesh':
        this.gradientMesh = enabled ? this.initGradientMesh() : null;
        break;
      case 'orbs':
        this.floatingOrbs = enabled ? this.initFloatingOrbs() : [];
        break;
      case 'particles':
        this.particles = enabled ? this.initParticles() : [];
        break;
      case 'grid':
        this.gridLines = enabled ? this.initGridLines() : null;
        break;
      case 'aurora':
        this.aurora = enabled ? this.initAurora() : null;
        break;
    }
  }

  // Adjust intensity (0-1)
  setIntensity(intensity) {
    // Adjust particle count
    const targetParticles = Math.floor(80 * intensity);
    while (this.particles.length > targetParticles) {
      this.particles.pop();
    }
    while (this.particles.length < targetParticles) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        // Slower particle velocities for intensity adjustment
        vx: (Math.random() - 0.5) * 0.06,
        vy: -0.03 - Math.random() * 0.08,
        radius: 1 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.4,
        color: Object.values(this.colors)[Math.floor(Math.random() * 5)]
      });
    }

    // Adjust orb count
    const targetOrbs = Math.floor(8 * intensity);
    while (this.floatingOrbs.length > targetOrbs) {
      this.floatingOrbs.pop();
    }
  }
}

// ============================================================================
// SCROLL-AWARE PARALLAX ENHANCEMENT
// ============================================================================

class ParallaxEnhancer {
  constructor(bgInstance) {
    this.bg = bgInstance;
    this.scrollY = 0;
    this.init();
  }

  init() {
    window.addEventListener('scroll', () => {
      this.scrollY = window.scrollY;
      this.updateParallax();
    }, { passive: true });
  }

  updateParallax() {
    // Move orbs slightly based on scroll
    if (this.bg.floatingOrbs) {
      this.bg.floatingOrbs.forEach((orb, i) => {
        orb.y += (this.scrollY * 0.0001 * (i % 3 + 1));
      });
    }

    // Adjust grid vanishing point based on scroll
    if (this.bg.gridLines) {
      this.bg.gridLines.vanishingPointY = this.bg.height * 0.4 - this.scrollY * 0.1;
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let alabobaiBG = null;
let parallaxEnhancer = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion) {
    alabobaiBG = new AlabobaiBG();
    parallaxEnhancer = new ParallaxEnhancer(alabobaiBG);

    // Expose globally for debugging/customization
    window.AlabobaiBG = alabobaiBG;
  }
});

// Handle page visibility for performance
document.addEventListener('visibilitychange', () => {
  if (alabobaiBG) {
    if (document.hidden) {
      cancelAnimationFrame(alabobaiBG.animationId);
    } else {
      alabobaiBG.animate();
    }
  }
});
