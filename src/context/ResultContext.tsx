import { createContext, useContext, useState, useMemo, ReactNode, useCallback } from 'react';
import { ScanResult } from '../rules/types';
import {
  saveScan,
  initDatabase,
  getScansPage,
  countScans,
  DEFAULT_PAGE_SIZE,
  HistoryScan,
} from '../db/history';

interface HistoryPage {
  scans: HistoryScan[];
  hasMore: boolean;
}

const EMPTY_PAGE: HistoryPage = { scans: [], hasMore: false };

/**
 * Reads the first page straight from the database. The store is opened and
 * migrated synchronously on first access, so there is nothing to wait for and
 * no reason to defer this to an effect.
 */
function readFirstPage(): HistoryPage {
  try {
    initDatabase();
    const scans = getScansPage(DEFAULT_PAGE_SIZE, 0);
    return { scans, hasMore: scans.length < countScans() };
  } catch (error) {
    console.error('Failed to load history:', error);
    return EMPTY_PAGE;
  }
}

interface ResultContextType {
  result: ScanResult | null;
  setResult: (result: ScanResult, saveToHistory?: boolean) => void;
  clearResult: () => void;
  scans: HistoryScan[];
  hasMore: boolean;
  refreshScans: () => void;
  loadMore: () => void;
}

const ResultContext = createContext<ResultContextType | undefined>(undefined);

export function ResultProvider({ children }: { children: ReactNode }) {
  const [result, setResultState] = useState<ScanResult | null>(null);
  const [page, setPage] = useState<HistoryPage>(readFirstPage);

  const refreshScans = useCallback(() => {
    setPage(readFirstPage());
  }, []);

  const loadMore = useCallback(() => {
    setPage(current => {
      try {
        const next = getScansPage(DEFAULT_PAGE_SIZE, current.scans.length);
        const scans = [...current.scans, ...next];
        return { scans, hasMore: scans.length < countScans() };
      } catch (error) {
        console.error('Failed to load more history:', error);
        return current;
      }
    });
  }, []);

  const setResult = useCallback(
    (newResult: ScanResult, saveToHistory = true) => {
      setResultState(newResult);
      if (saveToHistory) {
        try {
          saveScan(newResult);
        } catch (error) {
          console.error('Failed to save scan to history:', error);
        }
      }
      setPage(readFirstPage());
    },
    []
  );

  const clearResult = useCallback(() => {
    setResultState(null);
  }, []);

  /**
   * Memoized so the context value keeps a stable identity across renders that
   * do not change the data. As a bare object literal it was new on every
   * render, which re-rendered every consumer — including the scanner screen,
   * whose `CameraView` is an expensive subtree to reconcile.
   */
  const value = useMemo<ResultContextType>(
    () => ({
      result,
      setResult,
      clearResult,
      scans: page.scans,
      hasMore: page.hasMore,
      refreshScans,
      loadMore,
    }),
    [result, page, setResult, clearResult, refreshScans, loadMore]
  );

  return <ResultContext.Provider value={value}>{children}</ResultContext.Provider>;
}

export function useResult(): ResultContextType {
  const context = useContext(ResultContext);
  if (!context) {
    throw new Error('useResult must be used within a ResultProvider');
  }
  return context;
}
