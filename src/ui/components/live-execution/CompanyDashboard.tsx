/**
 * ============================================================================
 * COMPANY DASHBOARD LAYOUT COMPONENT
 * Main layout with header, sidebar, and content areas
 * ============================================================================
 */

import React, { useState } from 'react';
import type { AgentInfo, CompanyDashboardProps } from './execution-preview-spec.js';
import { Icons } from './execution-preview-spec.js';

// ============================================================================
// SIDEBAR SECTION TYPES
// ============================================================================

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface SidebarSection {
  title?: string;
  items: SidebarItem[];
}

// ============================================================================
// METRIC CARD SUBCOMPONENT
// ============================================================================

interface MetricCardProps {
  icon: React.ReactNode;
  iconBg: string;
  value: string | number;
  label: string;
  change?: {
    value: string;
    isPositive: boolean;
  };
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  iconBg,
  value,
  label,
  change,
}) => {
  return (
    <div className="exec-dashboard__metric">
      <div
        className="exec-dashboard__metric-icon"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="exec-dashboard__metric-value">{value}</div>
      <div className="exec-dashboard__metric-label">{label}</div>
      {change && (
        <div className={`exec-dashboard__metric-change exec-dashboard__metric-change--${change.isPositive ? 'positive' : 'negative'}`}>
          {change.isPositive ? '+' : ''}{change.value}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ASSETS SECTION SUBCOMPONENT
// ============================================================================

interface Asset {
  id: string;
  name: string;
  type: 'image' | 'document' | 'code' | 'other';
  preview?: string;
}

interface AssetsSectionProps {
  title: string;
  assets: Asset[];
  onAssetClick?: (assetId: string) => void;
  onViewAll?: () => void;
}

export const AssetsSection: React.FC<AssetsSectionProps> = ({
  title,
  assets,
  onAssetClick,
  onViewAll,
}) => {
  const getAssetIcon = (type: Asset['type']) => {
    switch (type) {
      case 'image':
        return '[]'; // Image placeholder
      case 'document':
        return <Icons.FileCode />;
      case 'code':
        return <Icons.Terminal />;
      default:
        return <Icons.FileCode />;
    }
  };

  return (
    <div className="exec-dashboard__assets">
      <div className="exec-dashboard__assets-header">
        <span className="exec-dashboard__assets-title">{title}</span>
        {onViewAll && (
          <button
            className="exec-controls__btn exec-controls__btn--skip"
            onClick={onViewAll}
            style={{ padding: '4px 12px', fontSize: '11px' }}
          >
            View All
          </button>
        )}
      </div>
      <div className="exec-dashboard__assets-grid">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="exec-dashboard__asset"
            onClick={() => onAssetClick?.(asset.id)}
          >
            <div className="exec-dashboard__asset-preview">
              {asset.preview ? (
                <img src={asset.preview} alt={asset.name} />
              ) : (
                getAssetIcon(asset.type)
              )}
            </div>
            <div className="exec-dashboard__asset-name">{asset.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPANY DASHBOARD COMPONENT
// ============================================================================

export const CompanyDashboard: React.FC<CompanyDashboardProps> = ({
  companyName,
  companyPlan,
  agents,
  activeSection = 'dashboard',
  onSectionChange,
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notificationCount] = useState(3);

  // Get company logo initials
  const logoInitials = companyName
    .split(' ')
    .map((word: string) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Define sidebar sections
  const sidebarSections: SidebarSection[] = [
    {
      title: 'Main',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <Icons.Globe /> },
        { id: 'executions', label: 'Executions', icon: <Icons.Zap />, badge: '2' },
        { id: 'agents', label: 'AI Agents', icon: <Icons.Users />, badge: String(agents.length) },
      ],
    },
    {
      title: 'Workspace',
      items: [
        { id: 'files', label: 'Files', icon: <Icons.FileCode /> },
        { id: 'browser', label: 'Browser', icon: <Icons.Browser /> },
        { id: 'terminal', label: 'Terminal', icon: <Icons.Terminal /> },
      ],
    },
    {
      title: 'Settings',
      items: [
        { id: 'settings', label: 'Settings', icon: <Icons.Settings /> },
      ],
    },
  ];

  // Calculate active agents
  const activeAgentCount = agents.filter((a: AgentInfo) => a.status === 'working').length;

  return (
    <div className="exec-dashboard">
      {/* Header */}
      <header className="exec-dashboard__header">
        <div className="exec-dashboard__brand">
          <div className="exec-dashboard__logo">{logoInitials}</div>
          <div className="exec-dashboard__company-info">
            <span className="exec-dashboard__company-name">{companyName}</span>
            <span className="exec-dashboard__company-plan">{companyPlan}</span>
          </div>
        </div>

        <div className="exec-dashboard__header-actions">
          <button
            className="exec-dashboard__header-btn exec-dashboard__header-btn--notification"
            title="Notifications"
          >
            <Icons.Bell />
            {notificationCount > 0 && (
              <span className="exec-dashboard__notification-badge">
                {notificationCount}
              </span>
            )}
          </button>
          <button
            className="exec-dashboard__header-btn"
            title="Settings"
          >
            <Icons.Settings />
          </button>
          <button
            className="exec-dashboard__header-btn exec-dashboard__sidebar-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <Icons.Menu />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="exec-dashboard__body">
        {/* Sidebar */}
        <aside className={`exec-dashboard__sidebar ${isSidebarOpen ? 'exec-dashboard__sidebar--open' : ''}`}>
          {sidebarSections.map((section, index) => (
            <div key={index} className="exec-dashboard__sidebar-section">
              {section.title && (
                <div className="exec-dashboard__sidebar-title">{section.title}</div>
              )}
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className={`exec-dashboard__sidebar-item ${activeSection === item.id ? 'exec-dashboard__sidebar-item--active' : ''}`}
                  onClick={() => {
                    onSectionChange?.(item.id);
                    setIsSidebarOpen(false);
                  }}
                >
                  <span className="exec-dashboard__sidebar-icon">{item.icon}</span>
                  <span className="exec-dashboard__sidebar-label">{item.label}</span>
                  {item.badge && (
                    <span className="exec-dashboard__sidebar-badge">{item.badge}</span>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Agent Quick Status */}
          <div className="exec-dashboard__sidebar-section" style={{ marginTop: 'auto' }}>
            <div className="exec-dashboard__sidebar-title">Quick Status</div>
            <div
              className="exec-dashboard__sidebar-item"
              style={{ cursor: 'default' }}
            >
              <span
                className="exec-dashboard__sidebar-icon"
                style={{ color: activeAgentCount > 0 ? 'var(--exec-status-working)' : 'var(--exec-status-idle)' }}
              >
                <Icons.Zap />
              </span>
              <span className="exec-dashboard__sidebar-label">
                {activeAgentCount} agent{activeAgentCount !== 1 ? 's' : ''} active
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="exec-dashboard__main">
          {children}
        </main>
      </div>
    </div>
  );
};

// ============================================================================
// DASHBOARD PAGE CONTENT WRAPPER
// ============================================================================

export interface DashboardContentProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardContent: React.FC<DashboardContentProps> = ({
  title,
  subtitle,
  actions,
  children,
}) => {
  return (
    <>
      <div className="exec-dashboard__main-header">
        <div>
          <h1 className="exec-dashboard__main-title">{title}</h1>
          {subtitle && <p className="exec-dashboard__main-subtitle">{subtitle}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
      {children}
    </>
  );
};

// ============================================================================
// METRICS GRID COMPONENT
// ============================================================================

export interface MetricsGridProps {
  metrics: MetricCardProps[];
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({ metrics }) => {
  return (
    <div className="exec-dashboard__metrics">
      {metrics.map((metric, index) => (
        <MetricCard key={index} {...metric} />
      ))}
    </div>
  );
};

export default CompanyDashboard;
