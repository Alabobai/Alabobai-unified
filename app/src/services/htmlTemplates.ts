/**
 * Production-quality HTML templates for Code Builder
 * All templates are complete, standalone HTML files that render in iframe preview
 */

export const htmlTemplates = {
  // ============================================================================
  // LANDING PAGE - SaaS Style
  // ============================================================================
  landingPage: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SaaS Landing Page</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes pulse-glow { 0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); } 50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); } }
    .float { animation: float 3s ease-in-out infinite; }
    .pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
    .gradient-text { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  </style>
</head>
<body class="bg-slate-950 text-white antialiased">
  <!-- Navigation -->
  <nav class="fixed w-full z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
    <div class="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
      <div class="text-2xl font-bold gradient-text">LaunchPad</div>
      <div class="hidden md:flex items-center gap-8">
        <a href="#features" class="text-slate-400 hover:text-white transition">Features</a>
        <a href="#pricing" class="text-slate-400 hover:text-white transition">Pricing</a>
        <a href="#testimonials" class="text-slate-400 hover:text-white transition">Testimonials</a>
        <button class="px-5 py-2 bg-violet-600 rounded-lg hover:bg-violet-500 transition font-medium">Get Started</button>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <section class="pt-32 pb-20 px-6">
    <div class="max-w-7xl mx-auto text-center">
      <div class="inline-block px-4 py-2 bg-violet-500/10 rounded-full text-violet-400 text-sm font-medium mb-6">
        Introducing LaunchPad 2.0
      </div>
      <h1 class="text-5xl md:text-7xl font-bold mb-6 leading-tight">
        Build products<br><span class="gradient-text">10x faster</span>
      </h1>
      <p class="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
        The all-in-one platform for modern teams. Ship faster, collaborate better, and scale with confidence.
      </p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button class="px-8 py-4 bg-violet-600 rounded-xl text-lg font-semibold hover:bg-violet-500 transition pulse-glow">
          Start Free Trial
        </button>
        <button class="px-8 py-4 border border-slate-700 rounded-xl text-lg font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/></svg>
          Watch Demo
        </button>
      </div>
      <!-- Stats -->
      <div class="mt-20 grid grid-cols-3 gap-8 max-w-3xl mx-auto">
        <div class="text-center">
          <div class="text-4xl font-bold text-white">50K+</div>
          <div class="text-slate-500">Active Users</div>
        </div>
        <div class="text-center">
          <div class="text-4xl font-bold text-white">99.9%</div>
          <div class="text-slate-500">Uptime</div>
        </div>
        <div class="text-center">
          <div class="text-4xl font-bold text-white">4.9</div>
          <div class="text-slate-500">Rating</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section id="features" class="py-20 px-6 bg-slate-900/50">
    <div class="max-w-7xl mx-auto">
      <h2 class="text-4xl font-bold text-center mb-4">Powerful Features</h2>
      <p class="text-slate-400 text-center mb-16 max-w-2xl mx-auto">Everything you need to build, ship, and scale your product.</p>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="bg-slate-800/50 p-8 rounded-2xl border border-slate-700 hover:border-violet-500 transition group">
          <div class="w-14 h-14 bg-violet-600/20 rounded-xl flex items-center justify-center mb-6 group-hover:bg-violet-600 transition">
            <svg class="w-7 h-7 text-violet-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <h3 class="text-xl font-bold mb-3">Lightning Fast</h3>
          <p class="text-slate-400">Optimized for speed with edge computing and smart caching.</p>
        </div>
        <div class="bg-slate-800/50 p-8 rounded-2xl border border-slate-700 hover:border-violet-500 transition group">
          <div class="w-14 h-14 bg-violet-600/20 rounded-xl flex items-center justify-center mb-6 group-hover:bg-violet-600 transition">
            <svg class="w-7 h-7 text-violet-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </div>
          <h3 class="text-xl font-bold mb-3">Enterprise Security</h3>
          <p class="text-slate-400">SOC 2 compliant with end-to-end encryption.</p>
        </div>
        <div class="bg-slate-800/50 p-8 rounded-2xl border border-slate-700 hover:border-violet-500 transition group">
          <div class="w-14 h-14 bg-violet-600/20 rounded-xl flex items-center justify-center mb-6 group-hover:bg-violet-600 transition">
            <svg class="w-7 h-7 text-violet-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
          </div>
          <h3 class="text-xl font-bold mb-3">Flexible Integrations</h3>
          <p class="text-slate-400">Connect with 100+ tools you already use.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="py-20 px-6">
    <div class="max-w-4xl mx-auto text-center bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl p-12">
      <h2 class="text-4xl font-bold mb-4">Ready to get started?</h2>
      <p class="text-violet-100 mb-8">Join thousands of teams already using LaunchPad.</p>
      <button class="px-8 py-4 bg-white text-violet-600 rounded-xl text-lg font-semibold hover:bg-violet-50 transition">
        Start Your Free Trial
      </button>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-12 px-6 border-t border-slate-800">
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
      <div class="text-2xl font-bold gradient-text">LaunchPad</div>
      <div class="text-slate-500">© 2024 LaunchPad. All rights reserved.</div>
    </div>
  </footer>
</body>
</html>`,

  // ============================================================================
  // DASHBOARD WITH CHARTS
  // ============================================================================
  dashboard: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analytics Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-slate-950 text-white min-h-screen">
  <div class="flex">
    <!-- Sidebar -->
    <aside class="w-64 bg-slate-900 min-h-screen p-6 border-r border-slate-800 fixed">
      <div class="text-2xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent mb-10">Dashboard</div>
      <nav class="space-y-2">
        <a href="#" class="flex items-center gap-3 px-4 py-3 bg-violet-600 rounded-xl text-white font-medium">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          Overview
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 rounded-xl transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
          Analytics
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 rounded-xl transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          Users
        </a>
        <a href="#" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800 rounded-xl transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          Settings
        </a>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 ml-64 p-8">
      <!-- Header -->
      <div class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-3xl font-bold">Welcome back, Alex</h1>
          <p class="text-slate-400">Here's what's happening with your business today.</p>
        </div>
        <button class="px-4 py-2 bg-violet-600 rounded-lg hover:bg-violet-500 transition flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Report
        </button>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-4 gap-6 mb-8">
        <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div class="flex items-center justify-between mb-4">
            <span class="text-slate-400 text-sm">Total Revenue</span>
            <span class="text-emerald-400 text-sm font-medium">+12.5%</span>
          </div>
          <div class="text-3xl font-bold">$84,232</div>
          <div class="mt-2 text-slate-500 text-sm">vs $74,901 last month</div>
        </div>
        <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div class="flex items-center justify-between mb-4">
            <span class="text-slate-400 text-sm">Active Users</span>
            <span class="text-emerald-400 text-sm font-medium">+8.1%</span>
          </div>
          <div class="text-3xl font-bold">12,847</div>
          <div class="mt-2 text-slate-500 text-sm">vs 11,882 last month</div>
        </div>
        <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div class="flex items-center justify-between mb-4">
            <span class="text-slate-400 text-sm">Conversion</span>
            <span class="text-rose-400 text-sm font-medium">-2.3%</span>
          </div>
          <div class="text-3xl font-bold">4.28%</div>
          <div class="mt-2 text-slate-500 text-sm">vs 4.38% last month</div>
        </div>
        <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <div class="flex items-center justify-between mb-4">
            <span class="text-slate-400 text-sm">Avg. Session</span>
            <span class="text-emerald-400 text-sm font-medium">+5.2%</span>
          </div>
          <div class="text-3xl font-bold">4m 32s</div>
          <div class="mt-2 text-slate-500 text-sm">vs 4m 18s last month</div>
        </div>
      </div>

      <!-- Charts -->
      <div class="grid grid-cols-2 gap-6 mb-8">
        <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h3 class="text-lg font-semibold mb-6">Revenue Overview</h3>
          <canvas id="revenueChart" height="200"></canvas>
        </div>
        <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <h3 class="text-lg font-semibold mb-6">Traffic Sources</h3>
          <canvas id="trafficChart" height="200"></canvas>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <h3 class="text-lg font-semibold mb-6">Recent Activity</h3>
        <div class="space-y-4">
          <div class="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl">
            <div class="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div class="flex-1">
              <div class="font-medium">New subscription</div>
              <div class="text-slate-400 text-sm">John Doe upgraded to Pro plan</div>
            </div>
            <div class="text-slate-500 text-sm">2 min ago</div>
          </div>
          <div class="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl">
            <div class="w-10 h-10 bg-violet-500/20 rounded-full flex items-center justify-center">
              <svg class="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
            </div>
            <div class="flex-1">
              <div class="font-medium">New team member</div>
              <div class="text-slate-400 text-sm">Sarah joined the marketing team</div>
            </div>
            <div class="text-slate-500 text-sm">15 min ago</div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script>
    // Revenue Chart
    new Chart(document.getElementById('revenueChart'), {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Revenue',
          data: [30000, 45000, 42000, 50000, 75000, 84232],
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8' } },
          x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
        }
      }
    });

    // Traffic Chart
    new Chart(document.getElementById('trafficChart'), {
      type: 'doughnut',
      data: {
        labels: ['Direct', 'Organic', 'Referral', 'Social'],
        datasets: [{
          data: [35, 30, 20, 15],
          backgroundColor: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
      }
    });
  </script>
</body>
</html>`,

  // ============================================================================
  // CONTACT FORM WITH VALIDATION
  // ============================================================================
  contactForm: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact Us</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .input-focus { transition: all 0.3s ease; }
    .input-focus:focus { transform: translateY(-2px); box-shadow: 0 10px 40px rgba(139, 92, 246, 0.2); }
    .shake { animation: shake 0.5s ease-in-out; }
    @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
    .success-check { animation: checkmark 0.5s ease-in-out; }
    @keyframes checkmark { 0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
  </style>
</head>
<body class="bg-slate-950 min-h-screen flex items-center justify-center p-6">
  <div class="w-full max-w-lg">
    <!-- Form Card -->
    <div id="formCard" class="bg-slate-900 rounded-3xl p-10 border border-slate-800 shadow-2xl">
      <div class="text-center mb-10">
        <h1 class="text-4xl font-bold text-white mb-3">Get in Touch</h1>
        <p class="text-slate-400">We'd love to hear from you. Send us a message!</p>
      </div>

      <form id="contactForm" class="space-y-6">
        <!-- Name Field -->
        <div>
          <label class="block text-slate-300 text-sm font-medium mb-2">Full Name</label>
          <input type="text" id="name" placeholder="John Doe"
            class="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 input-focus focus:outline-none focus:border-violet-500">
          <p id="nameError" class="text-rose-400 text-sm mt-2 hidden">Please enter your name</p>
        </div>

        <!-- Email Field -->
        <div>
          <label class="block text-slate-300 text-sm font-medium mb-2">Email Address</label>
          <input type="email" id="email" placeholder="john@example.com"
            class="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 input-focus focus:outline-none focus:border-violet-500">
          <p id="emailError" class="text-rose-400 text-sm mt-2 hidden">Please enter a valid email</p>
        </div>

        <!-- Subject Field -->
        <div>
          <label class="block text-slate-300 text-sm font-medium mb-2">Subject</label>
          <select id="subject"
            class="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white input-focus focus:outline-none focus:border-violet-500">
            <option value="">Select a subject</option>
            <option value="general">General Inquiry</option>
            <option value="support">Technical Support</option>
            <option value="sales">Sales Question</option>
            <option value="feedback">Feedback</option>
          </select>
          <p id="subjectError" class="text-rose-400 text-sm mt-2 hidden">Please select a subject</p>
        </div>

        <!-- Message Field -->
        <div>
          <label class="block text-slate-300 text-sm font-medium mb-2">Message</label>
          <textarea id="message" rows="5" placeholder="Tell us what's on your mind..."
            class="w-full px-5 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 input-focus focus:outline-none focus:border-violet-500 resize-none"></textarea>
          <p id="messageError" class="text-rose-400 text-sm mt-2 hidden">Please enter your message</p>
        </div>

        <!-- Submit Button -->
        <button type="submit" id="submitBtn"
          class="w-full py-4 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-500 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]">
          Send Message
        </button>
      </form>
    </div>

    <!-- Success Message (Hidden by default) -->
    <div id="successCard" class="hidden bg-slate-900 rounded-3xl p-10 border border-slate-800 shadow-2xl text-center">
      <div class="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 success-check">
        <svg class="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <h2 class="text-3xl font-bold text-white mb-3">Message Sent!</h2>
      <p class="text-slate-400 mb-8">Thank you for reaching out. We'll get back to you within 24 hours.</p>
      <button onclick="resetForm()" class="px-8 py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition">
        Send Another Message
      </button>
    </div>
  </div>

  <script>
    const form = document.getElementById('contactForm');
    const formCard = document.getElementById('formCard');
    const successCard = document.getElementById('successCard');

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      let isValid = true;

      // Validate Name
      const name = document.getElementById('name');
      const nameError = document.getElementById('nameError');
      if (name.value.trim() === '') {
        nameError.classList.remove('hidden');
        name.classList.add('shake', 'border-rose-500');
        isValid = false;
      } else {
        nameError.classList.add('hidden');
        name.classList.remove('border-rose-500');
      }

      // Validate Email
      const email = document.getElementById('email');
      const emailError = document.getElementById('emailError');
      const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
      if (!emailRegex.test(email.value)) {
        emailError.classList.remove('hidden');
        email.classList.add('shake', 'border-rose-500');
        isValid = false;
      } else {
        emailError.classList.add('hidden');
        email.classList.remove('border-rose-500');
      }

      // Validate Subject
      const subject = document.getElementById('subject');
      const subjectError = document.getElementById('subjectError');
      if (subject.value === '') {
        subjectError.classList.remove('hidden');
        subject.classList.add('shake', 'border-rose-500');
        isValid = false;
      } else {
        subjectError.classList.add('hidden');
        subject.classList.remove('border-rose-500');
      }

      // Validate Message
      const message = document.getElementById('message');
      const messageError = document.getElementById('messageError');
      if (message.value.trim() === '') {
        messageError.classList.remove('hidden');
        message.classList.add('shake', 'border-rose-500');
        isValid = false;
      } else {
        messageError.classList.add('hidden');
        message.classList.remove('border-rose-500');
      }

      // Remove shake class after animation
      setTimeout(() => {
        document.querySelectorAll('.shake').forEach(el => el.classList.remove('shake'));
      }, 500);

      // Show success if valid
      if (isValid) {
        formCard.classList.add('hidden');
        successCard.classList.remove('hidden');
      }
    });

    function resetForm() {
      form.reset();
      formCard.classList.remove('hidden');
      successCard.classList.add('hidden');
    }
  </script>
</body>
</html>`,

  // ============================================================================
  // PRICING PAGE
  // ============================================================================
  pricingPage: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pricing Plans</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .card-hover { transition: all 0.3s ease; }
    .card-hover:hover { transform: translateY(-8px); }
    .popular-badge { animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
  </style>
</head>
<body class="bg-slate-950 min-h-screen py-20 px-6">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="text-center mb-16">
      <h1 class="text-5xl font-bold text-white mb-4">Simple, Transparent Pricing</h1>
      <p class="text-xl text-slate-400 mb-8">Choose the plan that works best for you</p>

      <!-- Billing Toggle -->
      <div class="inline-flex items-center gap-4 bg-slate-900 p-2 rounded-xl">
        <button id="monthlyBtn" class="px-6 py-2 rounded-lg bg-violet-600 text-white font-medium transition" onclick="setBilling('monthly')">Monthly</button>
        <button id="yearlyBtn" class="px-6 py-2 rounded-lg text-slate-400 font-medium transition" onclick="setBilling('yearly')">
          Yearly <span class="text-emerald-400 text-sm">Save 20%</span>
        </button>
      </div>
    </div>

    <!-- Pricing Cards -->
    <div class="grid md:grid-cols-3 gap-8">
      <!-- Starter Plan -->
      <div class="bg-slate-900 rounded-3xl p-8 border border-slate-800 card-hover">
        <div class="mb-6">
          <h3 class="text-xl font-bold text-white mb-2">Starter</h3>
          <p class="text-slate-400">Perfect for individuals</p>
        </div>
        <div class="mb-8">
          <span class="text-5xl font-bold text-white" id="starterPrice">$9</span>
          <span class="text-slate-400">/month</span>
        </div>
        <ul class="space-y-4 mb-8">
          <li class="flex items-center gap-3 text-slate-300">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            5 Projects
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            10GB Storage
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Email Support
          </li>
          <li class="flex items-center gap-3 text-slate-500">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            Advanced Analytics
          </li>
        </ul>
        <button class="w-full py-4 border border-slate-700 text-white rounded-xl font-semibold hover:bg-slate-800 transition">
          Get Started
        </button>
      </div>

      <!-- Pro Plan (Popular) -->
      <div class="bg-gradient-to-b from-violet-600 to-purple-700 rounded-3xl p-8 card-hover relative">
        <div class="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-emerald-500 text-white text-sm font-bold rounded-full popular-badge">
          MOST POPULAR
        </div>
        <div class="mb-6">
          <h3 class="text-xl font-bold text-white mb-2">Professional</h3>
          <p class="text-violet-200">For growing teams</p>
        </div>
        <div class="mb-8">
          <span class="text-5xl font-bold text-white" id="proPrice">$29</span>
          <span class="text-violet-200">/month</span>
        </div>
        <ul class="space-y-4 mb-8">
          <li class="flex items-center gap-3 text-white">
            <svg class="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Unlimited Projects
          </li>
          <li class="flex items-center gap-3 text-white">
            <svg class="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            100GB Storage
          </li>
          <li class="flex items-center gap-3 text-white">
            <svg class="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Priority Support
          </li>
          <li class="flex items-center gap-3 text-white">
            <svg class="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Advanced Analytics
          </li>
        </ul>
        <button class="w-full py-4 bg-white text-violet-600 rounded-xl font-semibold hover:bg-violet-50 transition">
          Get Started
        </button>
      </div>

      <!-- Enterprise Plan -->
      <div class="bg-slate-900 rounded-3xl p-8 border border-slate-800 card-hover">
        <div class="mb-6">
          <h3 class="text-xl font-bold text-white mb-2">Enterprise</h3>
          <p class="text-slate-400">For large organizations</p>
        </div>
        <div class="mb-8">
          <span class="text-5xl font-bold text-white" id="enterprisePrice">$99</span>
          <span class="text-slate-400">/month</span>
        </div>
        <ul class="space-y-4 mb-8">
          <li class="flex items-center gap-3 text-slate-300">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Everything in Pro
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Unlimited Storage
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            24/7 Phone Support
          </li>
          <li class="flex items-center gap-3 text-slate-300">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Custom Integrations
          </li>
        </ul>
        <button class="w-full py-4 border border-slate-700 text-white rounded-xl font-semibold hover:bg-slate-800 transition">
          Contact Sales
        </button>
      </div>
    </div>
  </div>

  <script>
    let isYearly = false;
    const prices = { starter: { monthly: 9, yearly: 7 }, pro: { monthly: 29, yearly: 23 }, enterprise: { monthly: 99, yearly: 79 } };

    function setBilling(type) {
      isYearly = type === 'yearly';
      document.getElementById('monthlyBtn').className = isYearly ? 'px-6 py-2 rounded-lg text-slate-400 font-medium transition' : 'px-6 py-2 rounded-lg bg-violet-600 text-white font-medium transition';
      document.getElementById('yearlyBtn').className = isYearly ? 'px-6 py-2 rounded-lg bg-violet-600 text-white font-medium transition' : 'px-6 py-2 rounded-lg text-slate-400 font-medium transition';

      const billing = isYearly ? 'yearly' : 'monthly';
      document.getElementById('starterPrice').textContent = '$' + prices.starter[billing];
      document.getElementById('proPrice').textContent = '$' + prices.pro[billing];
      document.getElementById('enterprisePrice').textContent = '$' + prices.enterprise[billing];
    }
  </script>
</body>
</html>`,

  // ============================================================================
  // E-COMMERCE PRODUCT PAGE
  // ============================================================================
  productPage: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Details</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .thumbnail { transition: all 0.2s ease; }
    .thumbnail:hover, .thumbnail.active { border-color: #8b5cf6; transform: scale(1.05); }
    .size-btn { transition: all 0.2s ease; }
    .size-btn:hover, .size-btn.active { border-color: #8b5cf6; background: rgba(139, 92, 246, 0.1); }
    .color-btn { transition: all 0.2s ease; }
    .color-btn.active { ring: 2px; ring-offset: 2px; }
  </style>
</head>
<body class="bg-slate-950 min-h-screen py-12 px-6">
  <div class="max-w-7xl mx-auto">
    <div class="grid md:grid-cols-2 gap-12">
      <!-- Product Images -->
      <div>
        <div class="bg-slate-900 rounded-3xl p-8 mb-4">
          <img id="mainImage" src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600" alt="Product" class="w-full h-96 object-cover rounded-2xl">
        </div>
        <div class="flex gap-4">
          <button class="thumbnail active w-20 h-20 bg-slate-900 rounded-xl p-2 border-2 border-transparent" onclick="changeImage(0)">
            <img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=100" class="w-full h-full object-cover rounded-lg">
          </button>
          <button class="thumbnail w-20 h-20 bg-slate-900 rounded-xl p-2 border-2 border-transparent" onclick="changeImage(1)">
            <img src="https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=100" class="w-full h-full object-cover rounded-lg">
          </button>
          <button class="thumbnail w-20 h-20 bg-slate-900 rounded-xl p-2 border-2 border-transparent" onclick="changeImage(2)">
            <img src="https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=100" class="w-full h-full object-cover rounded-lg">
          </button>
        </div>
      </div>

      <!-- Product Info -->
      <div>
        <div class="mb-6">
          <span class="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 text-sm font-medium rounded-full mb-4">In Stock</span>
          <h1 class="text-4xl font-bold text-white mb-2">Nike Air Max 2024</h1>
          <div class="flex items-center gap-2 mb-4">
            <div class="flex text-yellow-400">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
            </div>
            <span class="text-slate-400">(128 reviews)</span>
          </div>
          <div class="flex items-baseline gap-4">
            <span class="text-4xl font-bold text-white">$199</span>
            <span class="text-xl text-slate-500 line-through">$249</span>
            <span class="text-emerald-400 font-medium">20% OFF</span>
          </div>
        </div>

        <p class="text-slate-400 mb-8">Experience ultimate comfort with the new Air Max 2024. Featuring revolutionary cushioning technology and a sleek design.</p>

        <!-- Color Selection -->
        <div class="mb-8">
          <h3 class="text-white font-semibold mb-4">Color</h3>
          <div class="flex gap-3">
            <button class="color-btn active w-10 h-10 rounded-full bg-red-500 ring-2 ring-offset-2 ring-offset-slate-950 ring-violet-500" onclick="selectColor(this)"></button>
            <button class="color-btn w-10 h-10 rounded-full bg-blue-500" onclick="selectColor(this)"></button>
            <button class="color-btn w-10 h-10 rounded-full bg-black border border-slate-700" onclick="selectColor(this)"></button>
            <button class="color-btn w-10 h-10 rounded-full bg-white" onclick="selectColor(this)"></button>
          </div>
        </div>

        <!-- Size Selection -->
        <div class="mb-8">
          <h3 class="text-white font-semibold mb-4">Size</h3>
          <div class="flex flex-wrap gap-3">
            <button class="size-btn px-5 py-3 border border-slate-700 rounded-xl text-white" onclick="selectSize(this)">US 7</button>
            <button class="size-btn px-5 py-3 border border-slate-700 rounded-xl text-white" onclick="selectSize(this)">US 8</button>
            <button class="size-btn active px-5 py-3 border border-violet-500 bg-violet-500/10 rounded-xl text-white" onclick="selectSize(this)">US 9</button>
            <button class="size-btn px-5 py-3 border border-slate-700 rounded-xl text-white" onclick="selectSize(this)">US 10</button>
            <button class="size-btn px-5 py-3 border border-slate-700 rounded-xl text-white" onclick="selectSize(this)">US 11</button>
          </div>
        </div>

        <!-- Quantity -->
        <div class="mb-8">
          <h3 class="text-white font-semibold mb-4">Quantity</h3>
          <div class="flex items-center gap-4">
            <button onclick="updateQty(-1)" class="w-12 h-12 bg-slate-800 rounded-xl text-white text-2xl hover:bg-slate-700 transition">-</button>
            <span id="quantity" class="text-2xl font-bold text-white w-12 text-center">1</span>
            <button onclick="updateQty(1)" class="w-12 h-12 bg-slate-800 rounded-xl text-white text-2xl hover:bg-slate-700 transition">+</button>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-4">
          <button class="flex-1 py-4 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-500 transition flex items-center justify-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            Add to Cart
          </button>
          <button class="p-4 border border-slate-700 rounded-xl hover:bg-slate-800 transition">
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const images = [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600',
      'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600'
    ];

    function changeImage(index) {
      document.getElementById('mainImage').src = images[index];
      document.querySelectorAll('.thumbnail').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
      });
    }

    function selectSize(btn) {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active', 'border-violet-500', 'bg-violet-500/10'));
      btn.classList.add('active', 'border-violet-500', 'bg-violet-500/10');
    }

    function selectColor(btn) {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active', 'ring-2', 'ring-offset-2', 'ring-offset-slate-950', 'ring-violet-500'));
      btn.classList.add('active', 'ring-2', 'ring-offset-2', 'ring-offset-slate-950', 'ring-violet-500');
    }

    let qty = 1;
    function updateQty(delta) {
      qty = Math.max(1, qty + delta);
      document.getElementById('quantity').textContent = qty;
    }
  </script>
</body>
</html>`,

  // ============================================================================
  // LOGIN FORM
  // ============================================================================
  loginForm: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .gradient-bg { background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%); }
    .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); }
  </style>
</head>
<body class="gradient-bg min-h-screen flex items-center justify-center p-6">
  <div class="w-full max-w-md">
    <div class="glass rounded-3xl p-10 border border-white/10 shadow-2xl">
      <!-- Logo -->
      <div class="text-center mb-10">
        <div class="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <h1 class="text-3xl font-bold text-white">Welcome Back</h1>
        <p class="text-white/60 mt-2">Sign in to continue to your account</p>
      </div>

      <form id="loginForm" class="space-y-6">
        <!-- Email -->
        <div>
          <label class="block text-white/80 text-sm font-medium mb-2">Email</label>
          <input type="email" id="email" placeholder="you@example.com"
            class="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/50 transition">
        </div>

        <!-- Password -->
        <div>
          <label class="block text-white/80 text-sm font-medium mb-2">Password</label>
          <div class="relative">
            <input type="password" id="password" placeholder="Enter your password"
              class="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/50 transition">
            <button type="button" onclick="togglePassword()" class="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
              <svg id="eyeIcon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
          </div>
        </div>

        <!-- Remember & Forgot -->
        <div class="flex justify-between items-center">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" class="w-4 h-4 rounded border-white/30 bg-white/10 text-violet-500 focus:ring-0">
            <span class="text-white/70 text-sm">Remember me</span>
          </label>
          <a href="#" class="text-white/70 text-sm hover:text-white transition">Forgot password?</a>
        </div>

        <!-- Submit -->
        <button type="submit" class="w-full py-4 bg-white text-violet-600 font-bold rounded-xl hover:bg-white/90 transition transform hover:scale-[1.02] active:scale-[0.98]">
          Sign In
        </button>

        <!-- Divider -->
        <div class="flex items-center gap-4">
          <div class="flex-1 h-px bg-white/20"></div>
          <span class="text-white/50 text-sm">or continue with</span>
          <div class="flex-1 h-px bg-white/20"></div>
        </div>

        <!-- Social Login -->
        <div class="grid grid-cols-2 gap-4">
          <button type="button" class="py-3 px-4 bg-white/10 border border-white/20 rounded-xl text-white flex items-center justify-center gap-2 hover:bg-white/20 transition">
            <svg class="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google
          </button>
          <button type="button" class="py-3 px-4 bg-white/10 border border-white/20 rounded-xl text-white flex items-center justify-center gap-2 hover:bg-white/20 transition">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </button>
        </div>
      </form>

      <!-- Sign Up Link -->
      <p class="text-center text-white/60 mt-8">
        Don't have an account? <a href="#" class="text-white font-semibold hover:underline">Sign up</a>
      </p>
    </div>
  </div>

  <script>
    function togglePassword() {
      const input = document.getElementById('password');
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      alert('Login functionality would be implemented here!');
    });
  </script>
</body>
</html>`,

  // ============================================================================
  // BLOG LAYOUT
  // ============================================================================
  blogLayout: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-white min-h-screen">
  <!-- Header -->
  <header class="border-b border-slate-800">
    <div class="max-w-6xl mx-auto px-6 py-6 flex justify-between items-center">
      <div class="text-2xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">TechBlog</div>
      <nav class="hidden md:flex items-center gap-8">
        <a href="#" class="text-white font-medium">Home</a>
        <a href="#" class="text-slate-400 hover:text-white transition">Articles</a>
        <a href="#" class="text-slate-400 hover:text-white transition">Categories</a>
        <a href="#" class="text-slate-400 hover:text-white transition">About</a>
        <button class="px-4 py-2 bg-violet-600 rounded-lg hover:bg-violet-500 transition">Subscribe</button>
      </nav>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 py-12">
    <!-- Featured Post -->
    <article class="mb-16">
      <div class="relative rounded-3xl overflow-hidden mb-6">
        <img src="https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1200" class="w-full h-96 object-cover">
        <div class="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent"></div>
        <div class="absolute bottom-0 left-0 p-8">
          <span class="inline-block px-3 py-1 bg-violet-600 text-white text-sm font-medium rounded-full mb-4">Featured</span>
          <h1 class="text-4xl font-bold text-white mb-3">The Future of AI in Software Development</h1>
          <p class="text-slate-300 max-w-2xl mb-4">Exploring how artificial intelligence is transforming the way we write, test, and deploy code in modern applications.</p>
          <div class="flex items-center gap-4">
            <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=50" class="w-10 h-10 rounded-full">
            <div>
              <div class="text-white font-medium">Alex Chen</div>
              <div class="text-slate-400 text-sm">Jan 15, 2024 · 8 min read</div>
            </div>
          </div>
        </div>
      </div>
    </article>

    <!-- Posts Grid -->
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
      <!-- Post Card 1 -->
      <article class="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 hover:border-violet-500 transition group">
        <img src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400" class="w-full h-48 object-cover group-hover:scale-105 transition duration-300">
        <div class="p-6">
          <span class="text-violet-400 text-sm font-medium">Development</span>
          <h2 class="text-xl font-bold text-white mt-2 mb-3 group-hover:text-violet-400 transition">Building Scalable React Applications</h2>
          <p class="text-slate-400 text-sm mb-4">Best practices and patterns for building large-scale React apps that are maintainable and performant.</p>
          <div class="flex items-center gap-3">
            <img src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=50" class="w-8 h-8 rounded-full">
            <div class="text-slate-400 text-sm">Sarah Kim · 5 min read</div>
          </div>
        </div>
      </article>

      <!-- Post Card 2 -->
      <article class="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 hover:border-violet-500 transition group">
        <img src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400" class="w-full h-48 object-cover group-hover:scale-105 transition duration-300">
        <div class="p-6">
          <span class="text-emerald-400 text-sm font-medium">Cloud</span>
          <h2 class="text-xl font-bold text-white mt-2 mb-3 group-hover:text-violet-400 transition">Serverless Architecture Guide</h2>
          <p class="text-slate-400 text-sm mb-4">A comprehensive guide to building serverless applications with AWS Lambda and API Gateway.</p>
          <div class="flex items-center gap-3">
            <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=50" class="w-8 h-8 rounded-full">
            <div class="text-slate-400 text-sm">Mike Johnson · 7 min read</div>
          </div>
        </div>
      </article>

      <!-- Post Card 3 -->
      <article class="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 hover:border-violet-500 transition group">
        <img src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400" class="w-full h-48 object-cover group-hover:scale-105 transition duration-300">
        <div class="p-6">
          <span class="text-rose-400 text-sm font-medium">Security</span>
          <h2 class="text-xl font-bold text-white mt-2 mb-3 group-hover:text-violet-400 transition">Web Security Best Practices</h2>
          <p class="text-slate-400 text-sm mb-4">Essential security measures every web developer should implement in their applications.</p>
          <div class="flex items-center gap-3">
            <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=50" class="w-8 h-8 rounded-full">
            <div class="text-slate-400 text-sm">Emily Davis · 6 min read</div>
          </div>
        </div>
      </article>
    </div>

    <!-- Newsletter -->
    <div class="mt-16 bg-gradient-to-r from-violet-600 to-purple-600 rounded-3xl p-10 text-center">
      <h2 class="text-3xl font-bold text-white mb-3">Stay Updated</h2>
      <p class="text-violet-100 mb-6">Get the latest articles and insights delivered to your inbox.</p>
      <form class="flex gap-4 max-w-md mx-auto">
        <input type="email" placeholder="Enter your email" class="flex-1 px-5 py-3 bg-white/20 border border-white/30 rounded-xl text-white placeholder-white/60 focus:outline-none focus:border-white">
        <button class="px-6 py-3 bg-white text-violet-600 font-semibold rounded-xl hover:bg-violet-50 transition">Subscribe</button>
      </form>
    </div>
  </main>
</body>
</html>`
}

/**
 * Get HTML template based on user request
 */
export function getTemplateForRequest(input: string): { template: string; description: string } | null {
  const lower = input.toLowerCase()

  if (lower.includes('dashboard') || lower.includes('admin') || lower.includes('analytics') || lower.includes('chart')) {
    return {
      template: htmlTemplates.dashboard,
      description: `Here's a professional analytics dashboard with interactive charts:

- Sidebar navigation with active states
- Stats cards showing key metrics with trends
- Revenue line chart using Chart.js
- Traffic sources doughnut chart
- Recent activity feed
- Fully responsive design`
    }
  }

  if (lower.includes('contact') || lower.includes('form') && lower.includes('contact')) {
    return {
      template: htmlTemplates.contactForm,
      description: `Here's a beautiful contact form with validation:

- Smooth input animations
- Real-time form validation
- Error states with shake animation
- Success confirmation screen
- Responsive layout
- Professional styling`
    }
  }

  if (lower.includes('pricing') || lower.includes('plan') || lower.includes('subscription')) {
    return {
      template: htmlTemplates.pricingPage,
      description: `Here's a modern pricing page with toggle:

- Monthly/yearly billing toggle with discount
- Three tier pricing cards
- Popular plan highlighting
- Feature comparison lists
- Hover animations
- Responsive grid layout`
    }
  }

  if (lower.includes('product') || lower.includes('e-commerce') || lower.includes('ecommerce') || lower.includes('shop') || lower.includes('store')) {
    return {
      template: htmlTemplates.productPage,
      description: `Here's a polished e-commerce product page:

- Image gallery with thumbnails
- Color and size selectors
- Quantity controls
- Add to cart and wishlist buttons
- Star ratings and reviews
- Price with discount display`
    }
  }

  if (lower.includes('login') || lower.includes('signin') || lower.includes('sign in') || lower.includes('auth')) {
    return {
      template: htmlTemplates.loginForm,
      description: `Here's an elegant login form:

- Beautiful gradient background
- Glassmorphism card effect
- Password visibility toggle
- Remember me checkbox
- Social login buttons
- Sign up link`
    }
  }

  if (lower.includes('signup') || lower.includes('sign up') || lower.includes('register')) {
    return {
      template: htmlTemplates.loginForm.replace('Welcome Back', 'Create Account').replace('Sign in to continue', 'Sign up to get started').replace('Sign In', 'Create Account').replace("Don't have an account?", 'Already have an account?').replace('Sign up', 'Sign in'),
      description: `Here's a signup form:

- Beautiful gradient background
- Glassmorphism card effect
- Form validation
- Social signup options
- Clean, modern design`
    }
  }

  if (lower.includes('blog') || lower.includes('article') || lower.includes('post') || lower.includes('news')) {
    return {
      template: htmlTemplates.blogLayout,
      description: `Here's a professional blog layout:

- Featured post hero section
- Article cards grid
- Category tags
- Author avatars and dates
- Newsletter subscription
- Responsive design`
    }
  }

  if (lower.includes('landing') || lower.includes('website') || lower.includes('homepage') || lower.includes('saas') || lower.includes('startup')) {
    return {
      template: htmlTemplates.landingPage,
      description: `Here's a modern SaaS landing page:

- Fixed navigation with blur effect
- Hero section with animated CTA
- Stats counters
- Feature cards with hover effects
- CTA banner section
- Professional footer`
    }
  }

  return null
}
