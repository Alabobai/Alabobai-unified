/**
 * useMemory Hook
 * React hook for accessing the persistent memory system
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import memoryService, {
  Memory,
  MemoryType,
  MemorySearchResult,
  MemoryStats,
  MemorySettings,
  ConversationMessage,
  ExtractionResult,
  MemoryContext,
  PrivacySetting,
} from '../services/memory';

// ============================================================================
// Types
// ============================================================================

export interface UseMemoryOptions {
  userId?: string;
  autoFetch?: boolean;
  refreshInterval?: number;
}

export interface MemoryState {
  memories: Memory[];
  stats: MemoryStats | null;
  settings: MemorySettings | null;
  isLoading: boolean;
  error: Error | null;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useMemory(options: UseMemoryOptions = {}) {
  const {
    userId = 'default',
    autoFetch = true,
    refreshInterval,
  } = options;

  const queryClient = useQueryClient();

  // Set user ID on mount
  useEffect(() => {
    memoryService.setUserId(userId);
  }, [userId]);

  // ==========================================================================
  // Queries
  // ==========================================================================

  // Fetch all memories
  const {
    data: memories = [],
    isLoading: memoriesLoading,
    error: memoriesError,
    refetch: refetchMemories,
  } = useQuery({
    queryKey: ['memories', userId],
    queryFn: () => memoryService.getAll({ limit: 100, sortBy: 'accessed', sortOrder: 'desc' }),
    enabled: autoFetch,
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  // Fetch stats
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['memory-stats', userId],
    queryFn: () => memoryService.getStats(),
    enabled: autoFetch,
    staleTime: 60000,
  });

  // Fetch settings
  const {
    data: settings,
    isLoading: settingsLoading,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ['memory-settings', userId],
    queryFn: () => memoryService.getSettings(),
    enabled: autoFetch,
    staleTime: 300000,
  });

  // ==========================================================================
  // Mutations
  // ==========================================================================

  // Store memory
  const storeMutation = useMutation({
    mutationFn: (memory: {
      type: MemoryType;
      content: string;
      importance?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
      privacy?: PrivacySetting;
    }) => memoryService.store(memory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats', userId] });
    },
  });

  // Update memory
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: {
      id: string;
      updates: Partial<Omit<Memory, 'id' | 'userId' | 'createdAt'>>;
    }) => memoryService.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
    },
  });

  // Delete memory
  const deleteMutation = useMutation({
    mutationFn: (id: string) => memoryService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats', userId] });
    },
  });

  // Bulk delete
  const bulkDeleteMutation = useMutation({
    mutationFn: (memoryIds?: string[]) => memoryService.bulkDelete(memoryIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats', userId] });
    },
  });

  // Remember
  const rememberMutation = useMutation({
    mutationFn: ({ content, type = 'fact' }: { content: string; type?: MemoryType }) =>
      memoryService.remember(content, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats', userId] });
    },
  });

  // Forget
  const forgetMutation = useMutation({
    mutationFn: (query: string) => memoryService.forget(query),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats', userId] });
    },
  });

  // Update settings
  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: Partial<MemorySettings>) =>
      memoryService.updateSettings(newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-settings', userId] });
    },
  });

  // Consolidate
  const consolidateMutation = useMutation({
    mutationFn: () => memoryService.consolidate(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats', userId] });
    },
  });

  // ==========================================================================
  // Actions
  // ==========================================================================

  const store = useCallback(
    async (memory: {
      type: MemoryType;
      content: string;
      importance?: number;
      tags?: string[];
      metadata?: Record<string, unknown>;
      privacy?: PrivacySetting;
    }) => {
      return storeMutation.mutateAsync(memory);
    },
    [storeMutation]
  );

  const update = useCallback(
    async (id: string, updates: Partial<Omit<Memory, 'id' | 'userId' | 'createdAt'>>) => {
      return updateMutation.mutateAsync({ id, updates });
    },
    [updateMutation]
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      return deleteMutation.mutateAsync(id);
    },
    [deleteMutation]
  );

  const bulkDelete = useCallback(
    async (memoryIds?: string[]) => {
      return bulkDeleteMutation.mutateAsync(memoryIds);
    },
    [bulkDeleteMutation]
  );

  const remember = useCallback(
    async (content: string, type: MemoryType = 'fact') => {
      return rememberMutation.mutateAsync({ content, type });
    },
    [rememberMutation]
  );

  const forget = useCallback(
    async (query: string) => {
      return forgetMutation.mutateAsync(query);
    },
    [forgetMutation]
  );

  const updateSettings = useCallback(
    async (newSettings: Partial<MemorySettings>) => {
      return updateSettingsMutation.mutateAsync(newSettings);
    },
    [updateSettingsMutation]
  );

  const consolidate = useCallback(async () => {
    return consolidateMutation.mutateAsync();
  }, [consolidateMutation]);

  const search = useCallback(
    async (query: string, options?: {
      types?: MemoryType[];
      minImportance?: number;
      minRelevance?: number;
      limit?: number;
    }) => {
      return memoryService.search({ query, ...options });
    },
    []
  );

  const getContext = useCallback(
    async (query: string, limit?: number) => {
      return memoryService.getContext(query, limit);
    },
    []
  );

  const extract = useCallback(
    async (messages: ConversationMessage[], options?: {
      extractFacts?: boolean;
      extractPreferences?: boolean;
      extractSummary?: boolean;
      extractPatterns?: boolean;
      store?: boolean;
    }) => {
      return memoryService.extract(messages, options);
    },
    []
  );

  const exportMemories = useCallback(async () => {
    return memoryService.downloadExport();
  }, []);

  const importMemories = useCallback(
    async (data: { memories: Memory[]; preferences?: any[] }) => {
      const result = await memoryService.import(data);
      queryClient.invalidateQueries({ queryKey: ['memories', userId] });
      queryClient.invalidateQueries({ queryKey: ['memory-stats', userId] });
      return result;
    },
    [queryClient, userId]
  );

  const refresh = useCallback(() => {
    refetchMemories();
    refetchStats();
    refetchSettings();
  }, [refetchMemories, refetchStats, refetchSettings]);

  // ==========================================================================
  // Return
  // ==========================================================================

  return {
    // State
    memories,
    stats,
    settings,
    isLoading: memoriesLoading || statsLoading || settingsLoading,
    error: memoriesError as Error | null,

    // Mutation states
    isStoring: storeMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending || bulkDeleteMutation.isPending,
    isConsolidating: consolidateMutation.isPending,

    // Actions
    store,
    update,
    delete: deleteMemory,
    bulkDelete,
    remember,
    forget,
    search,
    getContext,
    extract,
    updateSettings,
    consolidate,
    export: exportMemories,
    import: importMemories,
    refresh,
  };
}

// ============================================================================
// Search Hook
// ============================================================================

export function useMemorySearch(initialQuery?: string) {
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<NodeJS.Timeout>();

  const search = useCallback(async (searchQuery: string, options?: {
    types?: MemoryType[];
    minImportance?: number;
    minRelevance?: number;
    limit?: number;
  }) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const searchResults = await memoryService.search({ query: searchQuery, ...options });
      setResults(searchResults);
    } catch (err) {
      setError(err as Error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const debouncedSearch = useCallback((searchQuery: string, options?: {
    types?: MemoryType[];
    minImportance?: number;
    minRelevance?: number;
    limit?: number;
  }) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      search(searchQuery, options);
    }, 300);
  }, [search]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    isSearching,
    error,
    search,
    debouncedSearch,
    clear: () => {
      setQuery('');
      setResults([]);
    },
  };
}

// ============================================================================
// Chat Memory Integration Hook
// ============================================================================

export function useChatMemory(userId?: string) {
  const { settings, getContext, extract, remember, forget } = useMemory({
    userId,
    autoFetch: true,
  });

  const [usingMemory, setUsingMemory] = useState(false);
  const [relevantMemories, setRelevantMemories] = useState<Memory[]>([]);
  const conversationRef = useRef<ConversationMessage[]>([]);

  /**
   * Get context for a query and inject into chat
   */
  const getMemoryContext = useCallback(async (query: string): Promise<{
    contextPrompt: string;
    memories: Memory[];
    isUsingMemory: boolean;
  }> => {
    if (!settings?.memoryEnabled) {
      return { contextPrompt: '', memories: [], isUsingMemory: false };
    }

    try {
      const context = await getContext(query, 5);
      setRelevantMemories(context.memories);
      setUsingMemory(context.memories.length > 0);

      return {
        contextPrompt: context.contextPrompt,
        memories: context.memories,
        isUsingMemory: context.memories.length > 0,
      };
    } catch (err) {
      console.error('[useChatMemory] Failed to get context:', err);
      return { contextPrompt: '', memories: [], isUsingMemory: false };
    }
  }, [settings, getContext]);

  /**
   * Add message to conversation tracking
   */
  const trackMessage = useCallback((message: ConversationMessage) => {
    conversationRef.current.push(message);
    // Keep last 20 messages
    if (conversationRef.current.length > 20) {
      conversationRef.current = conversationRef.current.slice(-20);
    }
  }, []);

  /**
   * Extract and store memories from conversation
   */
  const extractAndStore = useCallback(async () => {
    if (!settings?.memoryEnabled || !settings?.autoExtract) {
      return null;
    }

    if (conversationRef.current.length < 2) {
      return null;
    }

    try {
      const result = await extract(conversationRef.current, { store: true });
      return result;
    } catch (err) {
      console.error('[useChatMemory] Failed to extract:', err);
      return null;
    }
  }, [settings, extract]);

  /**
   * Handle explicit "remember" command from chat
   */
  const handleRememberCommand = useCallback(async (content: string) => {
    try {
      const result = await remember(content);
      return result;
    } catch (err) {
      console.error('[useChatMemory] Remember failed:', err);
      throw err;
    }
  }, [remember]);

  /**
   * Handle explicit "forget" command from chat
   */
  const handleForgetCommand = useCallback(async (query: string) => {
    try {
      const result = await forget(query);
      return result;
    } catch (err) {
      console.error('[useChatMemory] Forget failed:', err);
      throw err;
    }
  }, [forget]);

  /**
   * Clear conversation tracking
   */
  const clearConversation = useCallback(() => {
    conversationRef.current = [];
    setRelevantMemories([]);
    setUsingMemory(false);
  }, []);

  /**
   * Check if message contains memory command
   */
  const parseMemoryCommand = useCallback((message: string): {
    type: 'remember' | 'forget' | null;
    content: string | null;
  } => {
    const rememberPatterns = [
      /(?:please\s+)?remember\s+(?:that\s+)?(.+)/i,
      /(?:please\s+)?note\s+(?:that\s+)?(.+)/i,
      /keep\s+(?:in\s+)?mind\s+(?:that\s+)?(.+)/i,
    ];

    const forgetPatterns = [
      /(?:please\s+)?forget\s+(?:that\s+)?(.+)/i,
      /(?:please\s+)?don'?t\s+remember\s+(.+)/i,
    ];

    for (const pattern of rememberPatterns) {
      const match = message.match(pattern);
      if (match) {
        return { type: 'remember', content: match[1].trim() };
      }
    }

    for (const pattern of forgetPatterns) {
      const match = message.match(pattern);
      if (match) {
        return { type: 'forget', content: match[1].trim() };
      }
    }

    return { type: null, content: null };
  }, []);

  return {
    // State
    isMemoryEnabled: settings?.memoryEnabled ?? true,
    usingMemory,
    relevantMemories,

    // Actions
    getMemoryContext,
    trackMessage,
    extractAndStore,
    handleRememberCommand,
    handleForgetCommand,
    clearConversation,
    parseMemoryCommand,
  };
}

export default useMemory;
