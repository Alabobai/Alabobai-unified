/**
 * Project Store
 * Manages project persistence, file trees, and collaborative features
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// ============================================================================
// Types
// ============================================================================

export interface ProjectFile {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  content?: string
  language?: string
  children?: ProjectFile[]
  createdAt: Date
  modifiedAt: Date
  size?: number
}

export interface ProjectMetadata {
  id: string
  name: string
  description: string
  template: ProjectTemplate
  createdAt: Date
  modifiedAt: Date
  lastOpenedAt: Date
  thumbnail?: string
  tags: string[]
  starred: boolean
  version: string
}

export interface Project {
  metadata: ProjectMetadata
  files: ProjectFile[]
  settings: ProjectSettings
}

export interface ProjectSettings {
  autoSave: boolean
  autoSaveInterval: number // in seconds
  previewMode: 'split' | 'tab' | 'external'
  theme: string
  linting: boolean
  formatting: boolean
}

export type ProjectTemplate =
  | 'blank'
  | 'landing-page'
  | 'dashboard'
  | 'portfolio'
  | 'blog'
  | 'e-commerce'
  | 'documentation'

export type SortOption = 'name' | 'date-created' | 'date-modified' | 'date-opened'
export type SortDirection = 'asc' | 'desc'

interface ProjectState {
  // Projects
  projects: Project[]
  activeProjectId: string | null
  recentProjectIds: string[]

  // UI State
  isLoading: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  lastSavedAt: Date | null
  searchQuery: string
  sortBy: SortOption
  sortDirection: SortDirection
  filterByTemplate: ProjectTemplate | null
  filterByStarred: boolean

  // Auto-save
  autoSaveEnabled: boolean
  autoSaveIntervalId: number | null

  // Actions - Project CRUD
  createProject: (name: string, template?: ProjectTemplate, description?: string) => Project
  updateProject: (projectId: string, updates: Partial<ProjectMetadata>) => void
  deleteProject: (projectId: string) => void
  duplicateProject: (projectId: string, newName?: string) => Project | null

  // Actions - Project Selection
  setActiveProject: (projectId: string | null) => void
  getActiveProject: () => Project | null
  addToRecent: (projectId: string) => void

  // Actions - File Management
  addFile: (projectId: string, parentPath: string, file: Omit<ProjectFile, 'id' | 'createdAt' | 'modifiedAt'>) => void
  updateFile: (projectId: string, fileId: string, updates: Partial<ProjectFile>) => void
  deleteFile: (projectId: string, fileId: string) => void
  renameFile: (projectId: string, fileId: string, newName: string) => void
  moveFile: (projectId: string, fileId: string, newParentPath: string) => void
  updateFileContent: (projectId: string, filePath: string, content: string) => void

  // Actions - File Tree
  getFileTree: (projectId: string) => ProjectFile[]
  getFileByPath: (projectId: string, path: string) => ProjectFile | null
  getFileById: (projectId: string, fileId: string) => ProjectFile | null

  // Actions - Save State
  setHasUnsavedChanges: (value: boolean) => void
  setIsSaving: (value: boolean) => void
  markAsSaved: () => void

  // Actions - Search & Filter
  setSearchQuery: (query: string) => void
  setSortBy: (sort: SortOption) => void
  setSortDirection: (direction: SortDirection) => void
  setFilterByTemplate: (template: ProjectTemplate | null) => void
  setFilterByStarred: (starred: boolean) => void
  toggleStarred: (projectId: string) => void

  // Actions - Auto-save
  startAutoSave: (intervalSeconds?: number) => void
  stopAutoSave: () => void
  setAutoSaveEnabled: (enabled: boolean) => void

  // Getters
  getFilteredProjects: () => Project[]
  getRecentProjects: (limit?: number) => Project[]
  getStarredProjects: () => Project[]
  getProjectsByTemplate: (template: ProjectTemplate) => Project[]
}

// ============================================================================
// Default Project Settings
// ============================================================================

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  autoSave: true,
  autoSaveInterval: 30,
  previewMode: 'split',
  theme: 'dark',
  linting: true,
  formatting: true,
}

// ============================================================================
// Project Templates
// ============================================================================

export const PROJECT_TEMPLATES: Record<ProjectTemplate, { name: string; description: string; icon: string; files: Omit<ProjectFile, 'id' | 'createdAt' | 'modifiedAt'>[] }> = {
  blank: {
    name: 'Blank Project',
    description: 'Start from scratch with an empty project',
    icon: 'FileText',
    files: [
      { name: 'index.html', path: '/index.html', type: 'file', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My Project</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <h1>Hello World</h1>\n  <script src="script.js"></script>\n</body>\n</html>', language: 'html' },
      { name: 'styles.css', path: '/styles.css', type: 'file', content: '* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: system-ui, -apple-system, sans-serif;\n  min-height: 100vh;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);\n  color: white;\n}\n\nh1 {\n  font-size: 3rem;\n  background: linear-gradient(90deg, #d4a574, #c4956a);\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n  background-clip: text;\n}', language: 'css' },
      { name: 'script.js', path: '/script.js', type: 'file', content: '// Your JavaScript code here\nconsole.log("Hello from JavaScript!");\n\ndocument.addEventListener("DOMContentLoaded", () => {\n  console.log("DOM loaded");\n});', language: 'javascript' },
    ],
  },
  'landing-page': {
    name: 'Landing Page',
    description: 'Modern landing page with hero, features, and CTA sections',
    icon: 'Globe',
    files: [
      { name: 'index.html', path: '/index.html', type: 'file', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Landing Page</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <nav class="navbar">
    <div class="logo">Brand</div>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#contact">Contact</a>
      <button class="cta-btn">Get Started</button>
    </div>
  </nav>

  <section class="hero">
    <h1>Build Something Amazing</h1>
    <p>Create stunning web experiences with our powerful platform</p>
    <div class="hero-buttons">
      <button class="primary-btn">Start Free Trial</button>
      <button class="secondary-btn">Watch Demo</button>
    </div>
  </section>

  <section id="features" class="features">
    <h2>Features</h2>
    <div class="feature-grid">
      <div class="feature-card">
        <div class="feature-icon">1</div>
        <h3>Fast Performance</h3>
        <p>Lightning-fast load times and optimized rendering</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">2</div>
        <h3>Easy to Use</h3>
        <p>Intuitive interface designed for everyone</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon">3</div>
        <h3>Secure</h3>
        <p>Enterprise-grade security built-in</p>
      </div>
    </div>
  </section>

  <section id="pricing" class="pricing">
    <h2>Simple Pricing</h2>
    <div class="pricing-cards">
      <div class="pricing-card">
        <h3>Starter</h3>
        <div class="price">$9/mo</div>
        <ul>
          <li>5 Projects</li>
          <li>Basic Support</li>
          <li>1GB Storage</li>
        </ul>
        <button>Choose Plan</button>
      </div>
      <div class="pricing-card featured">
        <h3>Pro</h3>
        <div class="price">$29/mo</div>
        <ul>
          <li>Unlimited Projects</li>
          <li>Priority Support</li>
          <li>10GB Storage</li>
        </ul>
        <button>Choose Plan</button>
      </div>
    </div>
  </section>

  <footer id="contact">
    <p>2024 Brand. All rights reserved.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>`, language: 'html' },
      { name: 'styles.css', path: '/styles.css', type: 'file', content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
  color: white;
  min-height: 100vh;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 5%;
  position: fixed;
  width: 100%;
  top: 0;
  background: rgba(15, 15, 35, 0.9);
  backdrop-filter: blur(10px);
  z-index: 100;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  background: linear-gradient(90deg, #d4a574, #c4956a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.nav-links a {
  color: white;
  text-decoration: none;
  opacity: 0.8;
  transition: opacity 0.3s;
}

.nav-links a:hover {
  opacity: 1;
}

.cta-btn {
  background: linear-gradient(90deg, #d4a574, #c4956a);
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  color: #0f0f23;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.cta-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(212, 165, 116, 0.3);
}

.hero {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 5%;
}

.hero h1 {
  font-size: 4rem;
  margin-bottom: 1.5rem;
  background: linear-gradient(90deg, #fff, #d4a574);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero p {
  font-size: 1.25rem;
  opacity: 0.8;
  margin-bottom: 2rem;
  max-width: 600px;
}

.hero-buttons {
  display: flex;
  gap: 1rem;
}

.primary-btn {
  background: linear-gradient(90deg, #d4a574, #c4956a);
  border: none;
  padding: 1rem 2rem;
  border-radius: 8px;
  color: #0f0f23;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
}

.secondary-btn {
  background: transparent;
  border: 2px solid #d4a574;
  padding: 1rem 2rem;
  border-radius: 8px;
  color: #d4a574;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
}

.features, .pricing {
  padding: 5rem 5%;
  text-align: center;
}

.features h2, .pricing h2 {
  font-size: 2.5rem;
  margin-bottom: 3rem;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-card {
  background: rgba(255, 255, 255, 0.05);
  padding: 2rem;
  border-radius: 16px;
  border: 1px solid rgba(212, 165, 116, 0.2);
  transition: transform 0.3s, border-color 0.3s;
}

.feature-card:hover {
  transform: translateY(-5px);
  border-color: rgba(212, 165, 116, 0.5);
}

.feature-icon {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #d4a574, #c4956a);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  color: #0f0f23;
  margin: 0 auto 1.5rem;
}

.feature-card h3 {
  margin-bottom: 1rem;
}

.pricing-cards {
  display: flex;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.pricing-card {
  background: rgba(255, 255, 255, 0.05);
  padding: 2.5rem;
  border-radius: 16px;
  border: 1px solid rgba(212, 165, 116, 0.2);
  width: 300px;
}

.pricing-card.featured {
  border-color: #d4a574;
  transform: scale(1.05);
}

.pricing-card h3 {
  margin-bottom: 1rem;
}

.price {
  font-size: 2.5rem;
  font-weight: bold;
  color: #d4a574;
  margin-bottom: 1.5rem;
}

.pricing-card ul {
  list-style: none;
  margin-bottom: 2rem;
}

.pricing-card li {
  padding: 0.5rem 0;
  opacity: 0.8;
}

.pricing-card button {
  width: 100%;
  padding: 1rem;
  border: none;
  border-radius: 8px;
  background: linear-gradient(90deg, #d4a574, #c4956a);
  color: #0f0f23;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

footer {
  text-align: center;
  padding: 2rem;
  opacity: 0.6;
}

@media (max-width: 768px) {
  .hero h1 {
    font-size: 2.5rem;
  }

  .nav-links {
    display: none;
  }
}`, language: 'css' },
      { name: 'script.js', path: '/script.js', type: 'file', content: `// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelector(this.getAttribute('href')).scrollIntoView({
      behavior: 'smooth'
    });
  });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.navbar');
  if (window.scrollY > 50) {
    navbar.style.background = 'rgba(15, 15, 35, 0.98)';
  } else {
    navbar.style.background = 'rgba(15, 15, 35, 0.9)';
  }
});

// Animate elements on scroll
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.feature-card, .pricing-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});`, language: 'javascript' },
    ],
  },
  dashboard: {
    name: 'Dashboard',
    description: 'Admin dashboard with sidebar, charts, and data tables',
    icon: 'LayoutDashboard',
    files: [
      { name: 'index.html', path: '/index.html', type: 'file', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="dashboard">
    <aside class="sidebar">
      <div class="logo">Dashboard</div>
      <nav>
        <a href="#" class="nav-item active">Overview</a>
        <a href="#" class="nav-item">Analytics</a>
        <a href="#" class="nav-item">Users</a>
        <a href="#" class="nav-item">Settings</a>
      </nav>
    </aside>

    <main class="main-content">
      <header class="header">
        <h1>Welcome back, User</h1>
        <div class="header-actions">
          <input type="search" placeholder="Search..." class="search-input">
          <div class="avatar">U</div>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue">U</div>
          <div class="stat-info">
            <span class="stat-value">2,543</span>
            <span class="stat-label">Total Users</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">$</div>
          <div class="stat-info">
            <span class="stat-value">$45,234</span>
            <span class="stat-label">Revenue</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon orange">O</div>
          <div class="stat-info">
            <span class="stat-value">1,234</span>
            <span class="stat-label">Orders</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">%</div>
          <div class="stat-info">
            <span class="stat-value">87.2%</span>
            <span class="stat-label">Conversion</span>
          </div>
        </div>
      </div>

      <div class="content-grid">
        <div class="chart-card">
          <h3>Revenue Overview</h3>
          <div class="chart-placeholder">
            <div class="bar" style="height: 60%"></div>
            <div class="bar" style="height: 80%"></div>
            <div class="bar" style="height: 45%"></div>
            <div class="bar" style="height: 90%"></div>
            <div class="bar" style="height: 70%"></div>
            <div class="bar" style="height: 85%"></div>
            <div class="bar" style="height: 55%"></div>
          </div>
        </div>

        <div class="table-card">
          <h3>Recent Activity</h3>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>John Doe</td>
                <td>Purchased Plan</td>
                <td>Today</td>
              </tr>
              <tr>
                <td>Jane Smith</td>
                <td>Signed Up</td>
                <td>Yesterday</td>
              </tr>
              <tr>
                <td>Bob Wilson</td>
                <td>Upgraded</td>
                <td>2 days ago</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
  <script src="script.js"></script>
</body>
</html>`, language: 'html' },
      { name: 'styles.css', path: '/styles.css', type: 'file', content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f0f23;
  color: white;
  min-height: 100vh;
}

.dashboard {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 250px;
  background: rgba(255, 255, 255, 0.03);
  border-right: 1px solid rgba(212, 165, 116, 0.1);
  padding: 1.5rem;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: #d4a574;
  margin-bottom: 2rem;
}

.nav-item {
  display: block;
  padding: 0.875rem 1rem;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  border-radius: 8px;
  margin-bottom: 0.5rem;
  transition: all 0.3s;
}

.nav-item:hover {
  background: rgba(212, 165, 116, 0.1);
  color: white;
}

.nav-item.active {
  background: linear-gradient(90deg, rgba(212, 165, 116, 0.2), rgba(196, 149, 106, 0.1));
  color: #d4a574;
  border-left: 3px solid #d4a574;
}

.main-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.header h1 {
  font-size: 1.75rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.search-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 165, 116, 0.2);
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: white;
  width: 250px;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.avatar {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #d4a574, #c4956a);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: #0f0f23;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(212, 165, 116, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-icon {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.25rem;
}

.stat-icon.blue { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
.stat-icon.green { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.stat-icon.orange { background: rgba(249, 115, 22, 0.2); color: #f97316; }
.stat-icon.purple { background: rgba(168, 85, 247, 0.2); color: #a855f7; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
}

.stat-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.875rem;
}

.content-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
}

.chart-card, .table-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(212, 165, 116, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
}

.chart-card h3, .table-card h3 {
  margin-bottom: 1.5rem;
  font-size: 1.125rem;
}

.chart-placeholder {
  height: 200px;
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  padding: 1rem;
}

.bar {
  width: 30px;
  background: linear-gradient(180deg, #d4a574, #c4956a);
  border-radius: 4px 4px 0 0;
  transition: height 0.3s;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 0.875rem;
  text-align: left;
  border-bottom: 1px solid rgba(212, 165, 116, 0.1);
}

th {
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  font-size: 0.875rem;
}

@media (max-width: 1024px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
}`, language: 'css' },
      { name: 'script.js', path: '/script.js', type: 'file', content: `// Dashboard interactivity
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
  });
});

// Animate stat cards on load
document.querySelectorAll('.stat-card').forEach((card, index) => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(20px)';
  setTimeout(() => {
    card.style.transition = 'all 0.5s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
  }, index * 100);
});

// Animate chart bars
document.querySelectorAll('.bar').forEach((bar, index) => {
  const height = bar.style.height;
  bar.style.height = '0';
  setTimeout(() => {
    bar.style.height = height;
  }, 500 + index * 100);
});`, language: 'javascript' },
    ],
  },
  portfolio: {
    name: 'Portfolio',
    description: 'Personal portfolio with projects showcase and contact form',
    icon: 'User',
    files: [
      { name: 'index.html', path: '/index.html', type: 'file', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portfolio</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <nav class="nav">
    <span class="nav-logo">JD</span>
    <div class="nav-links">
      <a href="#about">About</a>
      <a href="#projects">Projects</a>
      <a href="#contact">Contact</a>
    </div>
  </nav>

  <section class="hero">
    <div class="hero-content">
      <span class="greeting">Hello, I'm</span>
      <h1>John Doe</h1>
      <p class="tagline">Full Stack Developer & Designer</p>
      <p class="bio">I build beautiful, functional web experiences that make a difference.</p>
      <div class="social-links">
        <a href="#" class="social-link">GitHub</a>
        <a href="#" class="social-link">LinkedIn</a>
        <a href="#" class="social-link">Twitter</a>
      </div>
    </div>
  </section>

  <section id="about" class="about">
    <h2>About Me</h2>
    <div class="about-content">
      <div class="about-text">
        <p>I'm a passionate developer with 5+ years of experience building web applications. I specialize in React, Node.js, and modern web technologies.</p>
        <div class="skills">
          <span class="skill">React</span>
          <span class="skill">TypeScript</span>
          <span class="skill">Node.js</span>
          <span class="skill">Python</span>
          <span class="skill">AWS</span>
          <span class="skill">Docker</span>
        </div>
      </div>
    </div>
  </section>

  <section id="projects" class="projects">
    <h2>Featured Projects</h2>
    <div class="project-grid">
      <article class="project-card">
        <div class="project-image">Project 1</div>
        <h3>E-Commerce Platform</h3>
        <p>Full-stack e-commerce solution with payment integration</p>
        <div class="project-links">
          <a href="#">Live Demo</a>
          <a href="#">GitHub</a>
        </div>
      </article>
      <article class="project-card">
        <div class="project-image">Project 2</div>
        <h3>Task Manager App</h3>
        <p>Collaborative task management with real-time updates</p>
        <div class="project-links">
          <a href="#">Live Demo</a>
          <a href="#">GitHub</a>
        </div>
      </article>
      <article class="project-card">
        <div class="project-image">Project 3</div>
        <h3>AI Chat Interface</h3>
        <p>Modern chat interface with AI integration</p>
        <div class="project-links">
          <a href="#">Live Demo</a>
          <a href="#">GitHub</a>
        </div>
      </article>
    </div>
  </section>

  <section id="contact" class="contact">
    <h2>Get In Touch</h2>
    <form class="contact-form">
      <input type="text" placeholder="Your Name" required>
      <input type="email" placeholder="Your Email" required>
      <textarea placeholder="Your Message" rows="5" required></textarea>
      <button type="submit">Send Message</button>
    </form>
  </section>

  <footer>
    <p>2024 John Doe. Built with care.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>`, language: 'html' },
      { name: 'styles.css', path: '/styles.css', type: 'file', content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: linear-gradient(180deg, #0a0a1a 0%, #0f0f23 100%);
  color: white;
  line-height: 1.6;
}

.nav {
  position: fixed;
  top: 0;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 5%;
  background: rgba(10, 10, 26, 0.9);
  backdrop-filter: blur(10px);
  z-index: 100;
}

.nav-logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: #d4a574;
}

.nav-links {
  display: flex;
  gap: 2rem;
}

.nav-links a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  transition: color 0.3s;
}

.nav-links a:hover {
  color: #d4a574;
}

.hero {
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 0 5%;
}

.hero-content {
  max-width: 700px;
}

.greeting {
  color: #d4a574;
  font-size: 1.125rem;
  margin-bottom: 0.5rem;
  display: block;
}

.hero h1 {
  font-size: 4.5rem;
  margin-bottom: 1rem;
  background: linear-gradient(90deg, #fff, #d4a574);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.tagline {
  font-size: 1.5rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 1.5rem;
}

.bio {
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 2rem;
  max-width: 500px;
}

.social-links {
  display: flex;
  gap: 1rem;
}

.social-link {
  padding: 0.75rem 1.5rem;
  background: rgba(212, 165, 116, 0.1);
  border: 1px solid rgba(212, 165, 116, 0.3);
  border-radius: 8px;
  color: #d4a574;
  text-decoration: none;
  transition: all 0.3s;
}

.social-link:hover {
  background: rgba(212, 165, 116, 0.2);
  transform: translateY(-2px);
}

section {
  padding: 5rem 5%;
}

h2 {
  font-size: 2.5rem;
  margin-bottom: 3rem;
  text-align: center;
}

.about-content {
  max-width: 800px;
  margin: 0 auto;
}

.about-text p {
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 2rem;
}

.skills {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.skill {
  padding: 0.5rem 1rem;
  background: rgba(212, 165, 116, 0.1);
  border: 1px solid rgba(212, 165, 116, 0.2);
  border-radius: 20px;
  font-size: 0.875rem;
  color: #d4a574;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.project-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(212, 165, 116, 0.1);
  border-radius: 16px;
  padding: 1.5rem;
  transition: all 0.3s;
}

.project-card:hover {
  transform: translateY(-5px);
  border-color: rgba(212, 165, 116, 0.3);
}

.project-image {
  height: 180px;
  background: linear-gradient(135deg, rgba(212, 165, 116, 0.2), rgba(212, 165, 116, 0.05));
  border-radius: 12px;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
}

.project-card h3 {
  margin-bottom: 0.5rem;
}

.project-card p {
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 1rem;
}

.project-links {
  display: flex;
  gap: 1rem;
}

.project-links a {
  color: #d4a574;
  text-decoration: none;
  font-size: 0.875rem;
}

.contact {
  background: rgba(212, 165, 116, 0.03);
}

.contact-form {
  max-width: 500px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.contact-form input,
.contact-form textarea {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 165, 116, 0.2);
  border-radius: 8px;
  color: white;
  font-family: inherit;
}

.contact-form input::placeholder,
.contact-form textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.contact-form button {
  padding: 1rem;
  background: linear-gradient(90deg, #d4a574, #c4956a);
  border: none;
  border-radius: 8px;
  color: #0a0a1a;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.contact-form button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(212, 165, 116, 0.3);
}

footer {
  text-align: center;
  padding: 2rem;
  color: rgba(255, 255, 255, 0.4);
}

@media (max-width: 768px) {
  .hero h1 {
    font-size: 2.5rem;
  }

  .tagline {
    font-size: 1.25rem;
  }
}`, language: 'css' },
      { name: 'script.js', path: '/script.js', type: 'file', content: `// Smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelector(this.getAttribute('href')).scrollIntoView({
      behavior: 'smooth'
    });
  });
});

// Form submission
document.querySelector('.contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Thanks for your message! I will get back to you soon.');
  e.target.reset();
});

// Animate elements on scroll
const observerOptions = {
  threshold: 0.1
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.project-card, .skill').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'all 0.6s ease';
  observer.observe(el);
});`, language: 'javascript' },
    ],
  },
  blog: {
    name: 'Blog',
    description: 'Clean blog layout with article cards and reading view',
    icon: 'BookOpen',
    files: [
      { name: 'index.html', path: '/index.html', type: 'file', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="header">
    <nav class="nav">
      <a href="/" class="logo">Blog</a>
      <div class="nav-links">
        <a href="#articles">Articles</a>
        <a href="#about">About</a>
        <a href="#newsletter">Newsletter</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="hero">
      <h1>Thoughts on Code & Design</h1>
      <p>Exploring the intersection of technology and creativity</p>
    </section>

    <section id="articles" class="articles">
      <div class="article-grid">
        <article class="article-card featured">
          <div class="article-image">Featured</div>
          <div class="article-content">
            <span class="article-tag">Development</span>
            <h2>Building Modern Web Applications</h2>
            <p>A deep dive into the latest techniques and best practices for creating performant, accessible web apps.</p>
            <div class="article-meta">
              <span>Jan 15, 2024</span>
              <span>8 min read</span>
            </div>
          </div>
        </article>

        <article class="article-card">
          <div class="article-image small">Design</div>
          <div class="article-content">
            <span class="article-tag">Design</span>
            <h3>The Future of UI Design</h3>
            <p>Exploring emerging trends in user interface design.</p>
            <div class="article-meta">
              <span>Jan 10, 2024</span>
              <span>5 min read</span>
            </div>
          </div>
        </article>

        <article class="article-card">
          <div class="article-image small">Code</div>
          <div class="article-content">
            <span class="article-tag">Tutorial</span>
            <h3>Getting Started with TypeScript</h3>
            <p>A beginner's guide to adding type safety to JavaScript.</p>
            <div class="article-meta">
              <span>Jan 5, 2024</span>
              <span>10 min read</span>
            </div>
          </div>
        </article>

        <article class="article-card">
          <div class="article-image small">Tools</div>
          <div class="article-content">
            <span class="article-tag">Productivity</span>
            <h3>Developer Tools I Love</h3>
            <p>My favorite tools for staying productive as a developer.</p>
            <div class="article-meta">
              <span>Dec 28, 2023</span>
              <span>6 min read</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section id="newsletter" class="newsletter">
      <h2>Subscribe to my newsletter</h2>
      <p>Get the latest articles delivered straight to your inbox.</p>
      <form class="newsletter-form">
        <input type="email" placeholder="Enter your email">
        <button type="submit">Subscribe</button>
      </form>
    </section>
  </main>

  <footer>
    <p>2024 Blog. All rights reserved.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>`, language: 'html' },
      { name: 'styles.css', path: '/styles.css', type: 'file', content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Georgia', serif;
  background: #0a0a1a;
  color: #e0e0e0;
  line-height: 1.7;
}

.header {
  position: fixed;
  top: 0;
  width: 100%;
  background: rgba(10, 10, 26, 0.95);
  backdrop-filter: blur(10px);
  z-index: 100;
}

.nav {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: #d4a574;
  text-decoration: none;
}

.nav-links {
  display: flex;
  gap: 2rem;
}

.nav-links a {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  font-family: system-ui, sans-serif;
  font-size: 0.9rem;
  transition: color 0.3s;
}

.nav-links a:hover {
  color: #d4a574;
}

.hero {
  padding: 10rem 2rem 5rem;
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
}

.hero h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
  color: white;
}

.hero p {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.6);
}

.articles {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.article-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
}

.article-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(212, 165, 116, 0.1);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s;
  cursor: pointer;
}

.article-card:hover {
  transform: translateY(-5px);
  border-color: rgba(212, 165, 116, 0.3);
}

.article-card.featured {
  grid-column: span 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.article-image {
  height: 250px;
  background: linear-gradient(135deg, rgba(212, 165, 116, 0.2), rgba(212, 165, 116, 0.05));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  font-size: 1.5rem;
}

.article-image.small {
  height: 150px;
}

.article-content {
  padding: 1.5rem;
}

.article-tag {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(212, 165, 116, 0.1);
  color: #d4a574;
  border-radius: 20px;
  font-size: 0.75rem;
  font-family: system-ui, sans-serif;
  margin-bottom: 1rem;
}

.article-card h2 {
  font-size: 1.75rem;
  margin-bottom: 1rem;
  color: white;
}

.article-card h3 {
  font-size: 1.25rem;
  margin-bottom: 0.75rem;
  color: white;
}

.article-card p {
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 1rem;
}

.article-meta {
  display: flex;
  gap: 1.5rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.85rem;
  font-family: system-ui, sans-serif;
}

.newsletter {
  background: rgba(212, 165, 116, 0.05);
  padding: 5rem 2rem;
  text-align: center;
}

.newsletter h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
  color: white;
}

.newsletter p {
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 2rem;
}

.newsletter-form {
  display: flex;
  gap: 1rem;
  justify-content: center;
  max-width: 500px;
  margin: 0 auto;
}

.newsletter-form input {
  flex: 1;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(212, 165, 116, 0.2);
  border-radius: 8px;
  color: white;
  font-family: system-ui, sans-serif;
}

.newsletter-form button {
  padding: 1rem 2rem;
  background: linear-gradient(90deg, #d4a574, #c4956a);
  border: none;
  border-radius: 8px;
  color: #0a0a1a;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.newsletter-form button:hover {
  transform: translateY(-2px);
}

footer {
  text-align: center;
  padding: 3rem;
  color: rgba(255, 255, 255, 0.3);
  font-family: system-ui, sans-serif;
}

@media (max-width: 768px) {
  .article-grid {
    grid-template-columns: 1fr;
  }

  .article-card.featured {
    grid-column: span 1;
    display: block;
  }

  .hero h1 {
    font-size: 2rem;
  }

  .newsletter-form {
    flex-direction: column;
  }
}`, language: 'css' },
      { name: 'script.js', path: '/script.js', type: 'file', content: `// Newsletter form
document.querySelector('.newsletter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = e.target.querySelector('input').value;
  alert(\`Thanks for subscribing with \${email}!\`);
  e.target.reset();
});

// Article click handlers
document.querySelectorAll('.article-card').forEach(card => {
  card.addEventListener('click', () => {
    alert('Article page would open here');
  });
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelector(this.getAttribute('href')).scrollIntoView({
      behavior: 'smooth'
    });
  });
});`, language: 'javascript' },
    ],
  },
  'e-commerce': {
    name: 'E-Commerce',
    description: 'Product catalog with shopping cart functionality',
    icon: 'ShoppingBag',
    files: [
      { name: 'index.html', path: '/index.html', type: 'file', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shop</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="header">
    <div class="logo">SHOP</div>
    <nav class="nav">
      <a href="#products">Products</a>
      <a href="#categories">Categories</a>
      <a href="#about">About</a>
    </nav>
    <button class="cart-btn" id="cartBtn">
      Cart (<span id="cartCount">0</span>)
    </button>
  </header>

  <main>
    <section class="hero">
      <h1>New Collection</h1>
      <p>Discover our latest arrivals</p>
      <button class="shop-btn">Shop Now</button>
    </section>

    <section id="products" class="products">
      <h2>Featured Products</h2>
      <div class="product-grid" id="productGrid">
        <!-- Products will be inserted by JS -->
      </div>
    </section>
  </main>

  <div class="cart-modal" id="cartModal">
    <div class="cart-content">
      <div class="cart-header">
        <h3>Your Cart</h3>
        <button class="close-btn" id="closeCart">X</button>
      </div>
      <div class="cart-items" id="cartItems">
        <!-- Cart items will be inserted by JS -->
      </div>
      <div class="cart-footer">
        <div class="cart-total">
          <span>Total:</span>
          <span id="cartTotal">$0.00</span>
        </div>
        <button class="checkout-btn">Checkout</button>
      </div>
    </div>
  </div>

  <footer>
    <p>2024 Shop. All rights reserved.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>`, language: 'html' },
      { name: 'styles.css', path: '/styles.css', type: 'file', content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0a0a1a;
  color: white;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 5%;
  position: fixed;
  width: 100%;
  background: rgba(10, 10, 26, 0.95);
  backdrop-filter: blur(10px);
  z-index: 100;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: #d4a574;
  letter-spacing: 3px;
}

.nav {
  display: flex;
  gap: 2rem;
}

.nav a {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: color 0.3s;
}

.nav a:hover {
  color: #d4a574;
}

.cart-btn {
  background: transparent;
  border: 1px solid #d4a574;
  color: #d4a574;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
}

.cart-btn:hover {
  background: #d4a574;
  color: #0a0a1a;
}

.hero {
  height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(rgba(10, 10, 26, 0.7), rgba(10, 10, 26, 0.9)),
              linear-gradient(135deg, rgba(212, 165, 116, 0.2), transparent);
}

.hero h1 {
  font-size: 4rem;
  margin-bottom: 1rem;
  color: white;
}

.hero p {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 2rem;
}

.shop-btn {
  background: #d4a574;
  color: #0a0a1a;
  border: none;
  padding: 1rem 3rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.shop-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(212, 165, 116, 0.3);
}

.products {
  padding: 5rem 5%;
}

.products h2 {
  text-align: center;
  font-size: 2rem;
  margin-bottom: 3rem;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.product-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(212, 165, 116, 0.1);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s;
}

.product-card:hover {
  transform: translateY(-5px);
  border-color: rgba(212, 165, 116, 0.3);
}

.product-image {
  height: 250px;
  background: linear-gradient(135deg, rgba(212, 165, 116, 0.2), rgba(212, 165, 116, 0.05));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  font-size: 2rem;
}

.product-info {
  padding: 1.5rem;
}

.product-name {
  font-size: 1.125rem;
  margin-bottom: 0.5rem;
}

.product-price {
  color: #d4a574;
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.add-to-cart {
  width: 100%;
  background: transparent;
  border: 1px solid #d4a574;
  color: #d4a574;
  padding: 0.75rem;
  cursor: pointer;
  transition: all 0.3s;
}

.add-to-cart:hover {
  background: #d4a574;
  color: #0a0a1a;
}

.cart-modal {
  position: fixed;
  top: 0;
  right: -400px;
  width: 400px;
  height: 100%;
  background: #0f0f23;
  border-left: 1px solid rgba(212, 165, 116, 0.2);
  z-index: 200;
  transition: right 0.3s;
}

.cart-modal.open {
  right: 0;
}

.cart-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(212, 165, 116, 0.1);
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.25rem;
  cursor: pointer;
}

.cart-items {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.cart-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid rgba(212, 165, 116, 0.1);
}

.cart-item-image {
  width: 60px;
  height: 60px;
  background: rgba(212, 165, 116, 0.1);
  border-radius: 4px;
}

.cart-item-info {
  flex: 1;
}

.cart-item-name {
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.cart-item-price {
  color: #d4a574;
}

.remove-item {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.cart-footer {
  padding: 1.5rem;
  border-top: 1px solid rgba(212, 165, 116, 0.1);
}

.cart-total {
  display: flex;
  justify-content: space-between;
  font-size: 1.25rem;
  margin-bottom: 1rem;
}

.checkout-btn {
  width: 100%;
  background: #d4a574;
  color: #0a0a1a;
  border: none;
  padding: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.checkout-btn:hover {
  background: #c4956a;
}

footer {
  text-align: center;
  padding: 3rem;
  color: rgba(255, 255, 255, 0.3);
}

@media (max-width: 768px) {
  .nav {
    display: none;
  }

  .hero h1 {
    font-size: 2.5rem;
  }

  .cart-modal {
    width: 100%;
    right: -100%;
  }
}`, language: 'css' },
      { name: 'script.js', path: '/script.js', type: 'file', content: `// Product data
const products = [
  { id: 1, name: 'Classic White Tee', price: 29.99 },
  { id: 2, name: 'Leather Jacket', price: 199.99 },
  { id: 3, name: 'Denim Jeans', price: 79.99 },
  { id: 4, name: 'Sneakers', price: 129.99 },
  { id: 5, name: 'Wool Sweater', price: 89.99 },
  { id: 6, name: 'Canvas Bag', price: 49.99 },
];

let cart = [];

// Render products
function renderProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = products.map(product => \`
    <div class="product-card">
      <div class="product-image">\${product.name.charAt(0)}</div>
      <div class="product-info">
        <h3 class="product-name">\${product.name}</h3>
        <div class="product-price">$\${product.price.toFixed(2)}</div>
        <button class="add-to-cart" onclick="addToCart(\${product.id})">Add to Cart</button>
      </div>
    </div>
  \`).join('');
}

// Add to cart
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  const existingItem = cart.find(item => item.id === productId);

  if (existingItem) {
    existingItem.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  updateCart();
}

// Remove from cart
function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  updateCart();
}

// Update cart UI
function updateCart() {
  const cartCount = document.getElementById('cartCount');
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  cartCount.textContent = totalItems;
  cartTotal.textContent = '$' + totalPrice.toFixed(2);

  cartItems.innerHTML = cart.map(item => \`
    <div class="cart-item">
      <div class="cart-item-image"></div>
      <div class="cart-item-info">
        <div class="cart-item-name">\${item.name} x\${item.quantity}</div>
        <div class="cart-item-price">$\${(item.price * item.quantity).toFixed(2)}</div>
      </div>
      <button class="remove-item" onclick="removeFromCart(\${item.id})">X</button>
    </div>
  \`).join('');
}

// Cart modal
const cartBtn = document.getElementById('cartBtn');
const closeCart = document.getElementById('closeCart');
const cartModal = document.getElementById('cartModal');

cartBtn.addEventListener('click', () => cartModal.classList.add('open'));
closeCart.addEventListener('click', () => cartModal.classList.remove('open'));

// Initialize
renderProducts();`, language: 'javascript' },
    ],
  },
  documentation: {
    name: 'Documentation',
    description: 'Technical documentation with sidebar navigation',
    icon: 'FileCode',
    files: [
      { name: 'index.html', path: '/index.html', type: 'file', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="docs-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>Docs</h2>
        <span class="version">v1.0.0</span>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">
          <h3>Getting Started</h3>
          <a href="#intro" class="nav-link active">Introduction</a>
          <a href="#install" class="nav-link">Installation</a>
          <a href="#quickstart" class="nav-link">Quick Start</a>
        </div>
        <div class="nav-section">
          <h3>Core Concepts</h3>
          <a href="#basics" class="nav-link">Basics</a>
          <a href="#components" class="nav-link">Components</a>
          <a href="#api" class="nav-link">API Reference</a>
        </div>
        <div class="nav-section">
          <h3>Advanced</h3>
          <a href="#config" class="nav-link">Configuration</a>
          <a href="#plugins" class="nav-link">Plugins</a>
        </div>
      </nav>
    </aside>

    <main class="content">
      <article id="intro">
        <h1>Introduction</h1>
        <p class="lead">Welcome to the documentation. This guide will help you get started with our platform.</p>

        <h2>What is this?</h2>
        <p>This is a comprehensive solution for building modern web applications. It provides a set of tools and components that make development faster and more enjoyable.</p>

        <div class="callout info">
          <strong>Note:</strong> This documentation is for version 1.0.0 and above.
        </div>
      </article>

      <article id="install">
        <h1>Installation</h1>
        <p>Install the package using your preferred package manager:</p>

        <div class="code-block">
          <div class="code-header">npm</div>
          <pre><code>npm install @example/package</code></pre>
        </div>

        <div class="code-block">
          <div class="code-header">yarn</div>
          <pre><code>yarn add @example/package</code></pre>
        </div>
      </article>

      <article id="quickstart">
        <h1>Quick Start</h1>
        <p>Get up and running in minutes with this quick start guide.</p>

        <h2>Step 1: Create a project</h2>
        <div class="code-block">
          <pre><code>npx create-app my-project
cd my-project</code></pre>
        </div>

        <h2>Step 2: Start development</h2>
        <div class="code-block">
          <pre><code>npm run dev</code></pre>
        </div>

        <p>Your app is now running at <code>http://localhost:3000</code></p>
      </article>
    </main>
  </div>

  <script src="script.js"></script>
</body>
</html>`, language: 'html' },
      { name: 'styles.css', path: '/styles.css', type: 'file', content: `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #0a0a1a;
  color: #e0e0e0;
  line-height: 1.7;
}

.docs-layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 280px;
  background: rgba(255, 255, 255, 0.02);
  border-right: 1px solid rgba(212, 165, 116, 0.1);
  padding: 2rem;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.sidebar-header h2 {
  color: #d4a574;
  font-size: 1.5rem;
}

.version {
  background: rgba(212, 165, 116, 0.1);
  color: #d4a574;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.nav-section {
  margin-bottom: 1.5rem;
}

.nav-section h3 {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 0.75rem;
}

.nav-link {
  display: block;
  padding: 0.5rem 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  border-radius: 4px;
  margin-bottom: 0.25rem;
  transition: all 0.2s;
}

.nav-link:hover {
  background: rgba(212, 165, 116, 0.1);
  color: white;
}

.nav-link.active {
  background: rgba(212, 165, 116, 0.15);
  color: #d4a574;
  border-left: 2px solid #d4a574;
}

.content {
  flex: 1;
  margin-left: 280px;
  padding: 3rem 4rem;
  max-width: 900px;
}

article {
  margin-bottom: 4rem;
  padding-bottom: 4rem;
  border-bottom: 1px solid rgba(212, 165, 116, 0.1);
}

article:last-child {
  border-bottom: none;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1.5rem;
  color: white;
}

h2 {
  font-size: 1.5rem;
  margin: 2rem 0 1rem;
  color: white;
}

p {
  margin-bottom: 1rem;
  color: rgba(255, 255, 255, 0.8);
}

.lead {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.6);
}

.callout {
  padding: 1rem 1.5rem;
  border-radius: 8px;
  margin: 1.5rem 0;
}

.callout.info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #93c5fd;
}

.code-block {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(212, 165, 116, 0.1);
  border-radius: 8px;
  margin: 1rem 0;
  overflow: hidden;
}

.code-header {
  background: rgba(212, 165, 116, 0.1);
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: #d4a574;
}

pre {
  padding: 1rem;
  overflow-x: auto;
}

code {
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
  color: #d4a574;
}

p code {
  background: rgba(212, 165, 116, 0.1);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }

  .content {
    margin-left: 0;
    padding: 2rem;
  }
}`, language: 'css' },
      { name: 'script.js', path: '/script.js', type: 'file', content: `// Highlight active nav link based on scroll position
const sections = document.querySelectorAll('article');
const navLinks = document.querySelectorAll('.nav-link');

function updateActiveLink() {
  let current = '';

  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    if (scrollY >= sectionTop - 100) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) {
      link.classList.add('active');
    }
  });
}

window.addEventListener('scroll', updateActiveLink);

// Smooth scrolling
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = link.getAttribute('href');
    document.querySelector(targetId).scrollIntoView({
      behavior: 'smooth'
    });
  });
});

// Copy code button (could be added)
document.querySelectorAll('.code-block').forEach(block => {
  block.addEventListener('click', () => {
    const code = block.querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      // Could show a toast notification here
      console.log('Code copied!');
    });
  });
});`, language: 'javascript' },
    ],
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateFileId(): string {
  return crypto.randomUUID()
}

function generateProjectId(): string {
  return crypto.randomUUID()
}

function findFileById(files: ProjectFile[], fileId: string): ProjectFile | null {
  for (const file of files) {
    if (file.id === fileId) return file
    if (file.children) {
      const found = findFileById(file.children, fileId)
      if (found) return found
    }
  }
  return null
}

function findFileByPath(files: ProjectFile[], path: string): ProjectFile | null {
  for (const file of files) {
    if (file.path === path) return file
    if (file.children) {
      const found = findFileByPath(file.children, path)
      if (found) return found
    }
  }
  return null
}

function removeFileById(files: ProjectFile[], fileId: string): ProjectFile[] {
  return files.filter(file => {
    if (file.id === fileId) return false
    if (file.children) {
      file.children = removeFileById(file.children, fileId)
    }
    return true
  })
}

function createFilesFromTemplate(
  templateFiles: Omit<ProjectFile, 'id' | 'createdAt' | 'modifiedAt'>[]
): ProjectFile[] {
  const now = new Date()
  return templateFiles.map(file => ({
    ...file,
    id: generateFileId(),
    createdAt: now,
    modifiedAt: now,
    children: file.children ? createFilesFromTemplate(file.children as Omit<ProjectFile, 'id' | 'createdAt' | 'modifiedAt'>[]) : undefined,
  }))
}

// ============================================================================
// Store
// ============================================================================

export const useProjectStore = create<ProjectState>()(
  persist(
    immer((set, get) => ({
      // Initial State
      projects: [],
      activeProjectId: null,
      recentProjectIds: [],

      isLoading: false,
      isSaving: false,
      hasUnsavedChanges: false,
      lastSavedAt: null,
      searchQuery: '',
      sortBy: 'date-modified',
      sortDirection: 'desc',
      filterByTemplate: null,
      filterByStarred: false,

      autoSaveEnabled: true,
      autoSaveIntervalId: null,

      // Project CRUD
      createProject: (name, template = 'blank', description = '') => {
        const now = new Date()
        const projectId = generateProjectId()
        const templateConfig = PROJECT_TEMPLATES[template]

        const newProject: Project = {
          metadata: {
            id: projectId,
            name,
            description: description || templateConfig.description,
            template,
            createdAt: now,
            modifiedAt: now,
            lastOpenedAt: now,
            tags: [],
            starred: false,
            version: '1.0.0',
          },
          files: createFilesFromTemplate(templateConfig.files),
          settings: { ...DEFAULT_PROJECT_SETTINGS },
        }

        set(state => {
          state.projects.unshift(newProject)
          state.activeProjectId = projectId
          state.recentProjectIds = [projectId, ...state.recentProjectIds.filter(id => id !== projectId)].slice(0, 10)
        })

        return newProject
      },

      updateProject: (projectId, updates) => {
        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            Object.assign(project.metadata, updates)
            project.metadata.modifiedAt = new Date()
            state.hasUnsavedChanges = true
          }
        })
      },

      deleteProject: (projectId) => {
        set(state => {
          state.projects = state.projects.filter(p => p.metadata.id !== projectId)
          state.recentProjectIds = state.recentProjectIds.filter(id => id !== projectId)
          if (state.activeProjectId === projectId) {
            state.activeProjectId = state.projects[0]?.metadata.id || null
          }
        })
      },

      duplicateProject: (projectId, newName) => {
        const project = get().projects.find(p => p.metadata.id === projectId)
        if (!project) return null

        const now = new Date()
        const newProjectId = generateProjectId()

        const duplicatedProject: Project = {
          metadata: {
            ...project.metadata,
            id: newProjectId,
            name: newName || `${project.metadata.name} (Copy)`,
            createdAt: now,
            modifiedAt: now,
            lastOpenedAt: now,
          },
          files: JSON.parse(JSON.stringify(project.files)),
          settings: { ...project.settings },
        }

        // Generate new IDs for all files
        const updateFileIds = (files: ProjectFile[]): ProjectFile[] => {
          return files.map(file => ({
            ...file,
            id: generateFileId(),
            children: file.children ? updateFileIds(file.children) : undefined,
          }))
        }
        duplicatedProject.files = updateFileIds(duplicatedProject.files)

        set(state => {
          state.projects.unshift(duplicatedProject)
        })

        return duplicatedProject
      },

      // Project Selection
      setActiveProject: (projectId) => {
        set(state => {
          state.activeProjectId = projectId
          if (projectId) {
            const project = state.projects.find(p => p.metadata.id === projectId)
            if (project) {
              project.metadata.lastOpenedAt = new Date()
            }
            state.recentProjectIds = [projectId, ...state.recentProjectIds.filter(id => id !== projectId)].slice(0, 10)
          }
        })
      },

      getActiveProject: () => {
        const { projects, activeProjectId } = get()
        return projects.find(p => p.metadata.id === activeProjectId) || null
      },

      addToRecent: (projectId) => {
        set(state => {
          state.recentProjectIds = [projectId, ...state.recentProjectIds.filter(id => id !== projectId)].slice(0, 10)
        })
      },

      // File Management
      addFile: (projectId, parentPath, file) => {
        const now = new Date()
        const newFile: ProjectFile = {
          ...file,
          id: generateFileId(),
          createdAt: now,
          modifiedAt: now,
        }

        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            if (parentPath === '/') {
              project.files.push(newFile)
            } else {
              const parent = findFileByPath(project.files, parentPath)
              if (parent && parent.type === 'folder') {
                parent.children = parent.children || []
                parent.children.push(newFile)
              }
            }
            project.metadata.modifiedAt = now
            state.hasUnsavedChanges = true
          }
        })
      },

      updateFile: (projectId, fileId, updates) => {
        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            const file = findFileById(project.files, fileId)
            if (file) {
              Object.assign(file, updates)
              file.modifiedAt = new Date()
              project.metadata.modifiedAt = new Date()
              state.hasUnsavedChanges = true
            }
          }
        })
      },

      deleteFile: (projectId, fileId) => {
        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            project.files = removeFileById(project.files, fileId)
            project.metadata.modifiedAt = new Date()
            state.hasUnsavedChanges = true
          }
        })
      },

      renameFile: (projectId, fileId, newName) => {
        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            const file = findFileById(project.files, fileId)
            if (file) {
              const oldPath = file.path
              const pathParts = oldPath.split('/')
              pathParts[pathParts.length - 1] = newName
              file.name = newName
              file.path = pathParts.join('/')
              file.modifiedAt = new Date()
              project.metadata.modifiedAt = new Date()
              state.hasUnsavedChanges = true
            }
          }
        })
      },

      moveFile: (projectId, fileId, newParentPath) => {
        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            const file = findFileById(project.files, fileId)
            if (file) {
              // Remove from current location
              project.files = removeFileById(project.files, fileId)

              // Update path
              file.path = newParentPath === '/' ? `/${file.name}` : `${newParentPath}/${file.name}`

              // Add to new location
              if (newParentPath === '/') {
                project.files.push(file)
              } else {
                const newParent = findFileByPath(project.files, newParentPath)
                if (newParent && newParent.type === 'folder') {
                  newParent.children = newParent.children || []
                  newParent.children.push(file)
                }
              }

              file.modifiedAt = new Date()
              project.metadata.modifiedAt = new Date()
              state.hasUnsavedChanges = true
            }
          }
        })
      },

      updateFileContent: (projectId, filePath, content) => {
        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            const file = findFileByPath(project.files, filePath)
            if (file) {
              file.content = content
              file.modifiedAt = new Date()
              file.size = new Blob([content]).size
              project.metadata.modifiedAt = new Date()
              state.hasUnsavedChanges = true
            }
          }
        })
      },

      // File Tree
      getFileTree: (projectId) => {
        const project = get().projects.find(p => p.metadata.id === projectId)
        return project?.files || []
      },

      getFileByPath: (projectId, path) => {
        const project = get().projects.find(p => p.metadata.id === projectId)
        if (!project) return null
        return findFileByPath(project.files, path)
      },

      getFileById: (projectId, fileId) => {
        const project = get().projects.find(p => p.metadata.id === projectId)
        if (!project) return null
        return findFileById(project.files, fileId)
      },

      // Save State
      setHasUnsavedChanges: (value) => {
        set(state => { state.hasUnsavedChanges = value })
      },

      setIsSaving: (value) => {
        set(state => { state.isSaving = value })
      },

      markAsSaved: () => {
        set(state => {
          state.hasUnsavedChanges = false
          state.lastSavedAt = new Date()
          state.isSaving = false
        })
      },

      // Search & Filter
      setSearchQuery: (query) => {
        set(state => { state.searchQuery = query })
      },

      setSortBy: (sort) => {
        set(state => { state.sortBy = sort })
      },

      setSortDirection: (direction) => {
        set(state => { state.sortDirection = direction })
      },

      setFilterByTemplate: (template) => {
        set(state => { state.filterByTemplate = template })
      },

      setFilterByStarred: (starred) => {
        set(state => { state.filterByStarred = starred })
      },

      toggleStarred: (projectId) => {
        set(state => {
          const project = state.projects.find(p => p.metadata.id === projectId)
          if (project) {
            project.metadata.starred = !project.metadata.starred
          }
        })
      },

      // Auto-save
      startAutoSave: (intervalSeconds = 30) => {
        const { autoSaveEnabled, autoSaveIntervalId } = get()
        if (!autoSaveEnabled || autoSaveIntervalId !== null) return

        const intervalId = window.setInterval(() => {
          const { hasUnsavedChanges, isSaving } = get()
          if (hasUnsavedChanges && !isSaving) {
            get().markAsSaved()
          }
        }, intervalSeconds * 1000)

        set(state => { state.autoSaveIntervalId = intervalId })
      },

      stopAutoSave: () => {
        const { autoSaveIntervalId } = get()
        if (autoSaveIntervalId !== null) {
          clearInterval(autoSaveIntervalId)
          set(state => { state.autoSaveIntervalId = null })
        }
      },

      setAutoSaveEnabled: (enabled) => {
        set(state => { state.autoSaveEnabled = enabled })
        if (enabled) {
          get().startAutoSave()
        } else {
          get().stopAutoSave()
        }
      },

      // Getters
      getFilteredProjects: () => {
        const { projects, searchQuery, sortBy, sortDirection, filterByTemplate, filterByStarred } = get()

        let filtered = [...projects]

        // Filter by search query
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          filtered = filtered.filter(p =>
            p.metadata.name.toLowerCase().includes(query) ||
            p.metadata.description.toLowerCase().includes(query) ||
            p.metadata.tags.some(tag => tag.toLowerCase().includes(query))
          )
        }

        // Filter by template
        if (filterByTemplate) {
          filtered = filtered.filter(p => p.metadata.template === filterByTemplate)
        }

        // Filter by starred
        if (filterByStarred) {
          filtered = filtered.filter(p => p.metadata.starred)
        }

        // Sort
        filtered.sort((a, b) => {
          let comparison = 0
          switch (sortBy) {
            case 'name':
              comparison = a.metadata.name.localeCompare(b.metadata.name)
              break
            case 'date-created':
              comparison = new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime()
              break
            case 'date-modified':
              comparison = new Date(b.metadata.modifiedAt).getTime() - new Date(a.metadata.modifiedAt).getTime()
              break
            case 'date-opened':
              comparison = new Date(b.metadata.lastOpenedAt).getTime() - new Date(a.metadata.lastOpenedAt).getTime()
              break
          }
          return sortDirection === 'asc' ? -comparison : comparison
        })

        return filtered
      },

      getRecentProjects: (limit = 5) => {
        const { projects, recentProjectIds } = get()
        return recentProjectIds
          .map(id => projects.find(p => p.metadata.id === id))
          .filter((p): p is Project => p !== undefined)
          .slice(0, limit)
      },

      getStarredProjects: () => {
        return get().projects.filter(p => p.metadata.starred)
      },

      getProjectsByTemplate: (template) => {
        return get().projects.filter(p => p.metadata.template === template)
      },
    })),
    {
      name: 'alabobai-projects',
      partialize: (state) => ({
        projects: state.projects,
        recentProjectIds: state.recentProjectIds,
        autoSaveEnabled: state.autoSaveEnabled,
      }),
    }
  )
)

// Export singleton-like access for use outside React components
export const projectStore = {
  createProject: (name: string, template?: ProjectTemplate, description?: string) =>
    useProjectStore.getState().createProject(name, template, description),
  getActiveProject: () => useProjectStore.getState().getActiveProject(),
  setActiveProject: (id: string | null) => useProjectStore.getState().setActiveProject(id),
  updateFileContent: (projectId: string, filePath: string, content: string) =>
    useProjectStore.getState().updateFileContent(projectId, filePath, content),
  markAsSaved: () => useProjectStore.getState().markAsSaved(),
}

export default useProjectStore
