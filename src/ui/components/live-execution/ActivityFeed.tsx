/**
 * ============================================================================
 * ACTIVITY FEED COMPONENT
 * Real-time event log showing agent actions with filtering
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import type {
  ExecutionEvent,
  EventType,
  AgentInfo,
  ActivityFeedProps,
} from './execution-preview-spec.js';
import { Icons } from './execution-preview-spec.js';

// ============================================================================
// EVENT ICON MAPPING
// ============================================================================

const getEventIcon = (type: EventType): React.ReactNode => {
  switch (type) {
    case 'action':
      return <Icons.Zap />;
    case 'navigation':
      return <Icons.Globe />;
    case 'file':
      return <Icons.FileCode />;
    case 'command':
      return <Icons.Terminal />;
    case 'api':
      return <Icons.Zap />;
    case 'decision':
      return <Icons.AlertTriangle />;
    case 'complete':
      return <Icons.Check />;
    default:
      return <Icons.Zap />;
  }
};

// ============================================================================
// EVENT ITEM SUBCOMPONENT
// ============================================================================

interface EventItemProps {
  event: ExecutionEvent;
  isExpanded: boolean;
  onToggle: () => void;
  agentColor: string;
}

const EventItem: React.FC<EventItemProps> = ({
  event,
  isExpanded,
  onToggle,
  agentColor,
}) => {
  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDetails = (details: Record<string, unknown>): React.ReactNode[] => {
    return Object.entries(details).map(([key, value]) => (
      <div key={key} className="exec-event__detail-row">
        <span className="exec-event__detail-key">{key}</span>
        <span className="exec-event__detail-value">
          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
        </span>
      </div>
    ));
  };

  return (
    <div
      className={`exec-event ${isExpanded ? 'exec-event--expanded' : ''}`}
      onClick={onToggle}
    >
      <div className={`exec-event__icon exec-event__icon--${event.type}`}>
        {getEventIcon(event.type)}
      </div>

      <div className="exec-event__content">
        <div className="exec-event__header">
          <div className="exec-event__agent">
            <span
              className="exec-event__agent-dot"
              style={{ backgroundColor: agentColor }}
            />
            <span>{event.agentName}</span>
          </div>
          <span className="exec-event__timestamp">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>

        <div className="exec-event__title">{event.title}</div>
        <div className="exec-event__description">{event.description}</div>

        {isExpanded && event.details && Object.keys(event.details).length > 0 && (
          <div className="exec-event__details">
            {formatDetails(event.details)}
          </div>
        )}
      </div>

      <div className="exec-event__expand">
        <Icons.ChevronDown />
      </div>
    </div>
  );
};

// ============================================================================
// FILTER CHIP SUBCOMPONENT
// ============================================================================

interface FilterChipProps {
  type: EventType;
  label: string;
  isActive: boolean;
  onToggle: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({
  type,
  label,
  isActive,
  onToggle,
}) => {
  const colorMap: Record<EventType, string> = {
    action: 'var(--exec-event-action)',
    navigation: 'var(--exec-event-navigation)',
    file: 'var(--exec-event-file)',
    command: 'var(--exec-event-command)',
    api: 'var(--exec-event-api)',
    decision: 'var(--exec-event-decision)',
    complete: 'var(--exec-event-complete)',
  };

  return (
    <button
      className={`exec-activity__filter ${isActive ? 'exec-activity__filter--active' : ''}`}
      onClick={onToggle}
    >
      <span
        className="exec-activity__filter-dot"
        style={{ backgroundColor: colorMap[type] }}
      />
      <span>{label}</span>
    </button>
  );
};

// ============================================================================
// MAIN ACTIVITY FEED COMPONENT
// ============================================================================

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  events,
  isLive = true,
  onEventClick,
  activeFilters = [],
  onFilterChange,
  agents,
}) => {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [localFilters, setLocalFilters] = useState<EventType[]>(activeFilters);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (listRef.current && isLive) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events, isLive]);

  // Get agent color by ID
  const getAgentColor = (agentId: string): string => {
    const agent = agents.find((a: AgentInfo) => a.id === agentId);
    return agent?.color || '#d9a07a';
  };

  // Toggle event expansion
  const handleEventToggle = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
    onEventClick?.(events.find((e: ExecutionEvent) => e.id === eventId)!);
  };

  // Toggle filter
  const handleFilterToggle = (type: EventType) => {
    const newFilters = localFilters.includes(type)
      ? localFilters.filter((f: EventType) => f !== type)
      : [...localFilters, type];
    setLocalFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  // Filter events
  const filteredEvents = localFilters.length > 0
    ? events.filter((e: ExecutionEvent) => localFilters.includes(e.type))
    : events;

  // Filter types with labels
  const filterTypes: { type: EventType; label: string }[] = [
    { type: 'action', label: 'Actions' },
    { type: 'navigation', label: 'Navigation' },
    { type: 'file', label: 'Files' },
    { type: 'command', label: 'Commands' },
    { type: 'api', label: 'API' },
    { type: 'decision', label: 'Decisions' },
  ];

  return (
    <div className="exec-activity">
      {/* Header */}
      <div className="exec-activity__header">
        <span className="exec-activity__title">Activity Feed</span>
        {isLive && (
          <span className="exec-activity__live-indicator">
            <span className="exec-activity__live-dot" />
            <span>Live</span>
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="exec-activity__filters">
        {filterTypes.map((filter) => (
          <FilterChip
            key={filter.type}
            type={filter.type}
            label={filter.label}
            isActive={localFilters.includes(filter.type)}
            onToggle={() => handleFilterToggle(filter.type)}
          />
        ))}
      </div>

      {/* Event List */}
      <div className="exec-activity__list" ref={listRef}>
        {filteredEvents.length === 0 ? (
          <div className="exec-activity__empty">
            <span>No events to display</span>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventItem
              key={event.id}
              event={event}
              isExpanded={expandedEvents.has(event.id)}
              onToggle={() => handleEventToggle(event.id)}
              agentColor={getAgentColor(event.agentId)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
