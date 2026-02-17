import { useMemo } from 'react'
import { Pause, Play, RotateCcw, Square, Activity, AlertTriangle, CheckCircle2, Timer, Bug, FileText, Code2, Link2, Braces, CircleDot } from 'lucide-react'
import { useCommandCenterStore, type CommandRun, type RunStatus, type StepStatus, type DiagnosticLevel } from '@/stores/commandCenterStore'

const statusClasses: Record<RunStatus, string> = {
  queued: 'bg-white/10 text-white/70',
  running: 'bg-rose-gold-400/25 text-rose-gold-300',
  paused: 'bg-rose-gold-400/15 text-rose-gold-400',
  retrying: 'bg-rose-gold-400/20 text-rose-gold-300',
  completed: 'bg-rose-gold-400/20 text-rose-gold-300',
  failed: 'bg-rose-gold-500/25 text-rose-gold-300',
  cancelled: 'bg-white/10 text-white/50'
}

const stepDot: Record<StepStatus, string> = {
  pending: 'bg-white/20',
  running: 'bg-rose-gold-400 animate-pulse',
  completed: 'bg-rose-gold-400',
  failed: 'bg-rose-gold-500',
  skipped: 'bg-white/30'
}

const levelStyles: Record<DiagnosticLevel, string> = {
  info: 'text-white/70 border-white/10',
  warn: 'text-rose-gold-400 border-rose-gold-400/20 bg-rose-gold-400/5',
  error: 'text-rose-gold-300 border-rose-gold-500/20 bg-rose-gold-500/10'
}

export default function CommandCenterView() {
  const { runs, selectedRunId, setSelectedRun, pauseRun, resumeRun, retryRun, cancelRun } = useCommandCenterStore()

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? runs[0],
    [runs, selectedRunId]
  )

  const activeCount = runs.filter((r) => r.status === 'running' || r.status === 'retrying').length
  const failedCount = runs.filter((r) => r.status === 'failed').length
  const completedCount = runs.filter((r) => r.status === 'completed').length

  return (
    <div className="h-full overflow-y-auto morphic-scrollbar p-6 space-y-6">
      <header className="morphic-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Command Center</h1>
            <p className="text-sm text-white/60 mt-1">Observe autonomous runs, intervene quickly, and inspect diagnostics in one place.</p>
          </div>
          <div className="flex gap-3">
            <StatCard icon={Activity} label="Active" value={String(activeCount)} />
            <StatCard icon={AlertTriangle} label="Failed" value={String(failedCount)} />
            <StatCard icon={CheckCircle2} label="Completed" value={String(completedCount)} />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-1 space-y-3">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRun(run.id)}
              className={`w-full text-left morphic-card border transition-all hover-lift ${selectedRun?.id === run.id ? 'border-rose-gold-400/40 bg-rose-gold-400/10' : 'border-white/10'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{run.name}</p>
                  <p className="text-xs text-white/50 mt-1 line-clamp-2">{run.objective}</p>
                </div>
                <span className={`text-[11px] px-2 py-1 rounded-full ${statusClasses[run.status]}`}>{run.status}</span>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-xs text-white/60 mb-1">
                  <span>{run.worker}</span>
                  <span>{run.progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-rose-gold-400 to-rose-gold-300" style={{ width: `${run.progress}%` }} />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-white/40">
                <span className="inline-flex items-center gap-1"><Timer className="w-3 h-3" /> {run.eta ?? '—'}</span>
                <span>Retries {run.retryCount}/{run.maxRetries}</span>
              </div>

              <div className="mt-3 flex gap-1.5">
                <RunControls run={run} pauseRun={pauseRun} resumeRun={resumeRun} retryRun={retryRun} cancelRun={cancelRun} compact />
              </div>
            </button>
          ))}
        </div>

        {selectedRun && (
          <div className="xl:col-span-2 space-y-5">
            <section className="morphic-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl text-white font-semibold">{selectedRun.name}</h2>
                  <p className="text-sm text-white/60 mt-1">{selectedRun.objective}</p>
                  {selectedRun.errorMessage && <p className="text-xs text-rose-gold-300 mt-2">{selectedRun.errorMessage}</p>}
                </div>
                <RunControls run={selectedRun} pauseRun={pauseRun} resumeRun={resumeRun} retryRun={retryRun} cancelRun={cancelRun} />
              </div>
            </section>

            <section className="morphic-panel p-5">
              <h3 className="text-sm uppercase tracking-wider text-rose-gold-400/70 mb-3">Progress Timeline</h3>
              <div className="space-y-3">
                {selectedRun.timeline.map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1 ${stepDot[event.status]}`} />
                      <span className="w-px h-full bg-white/10" />
                    </div>
                    <div className="pb-2">
                      <p className="text-sm text-white font-medium">{event.title}</p>
                      <p className="text-xs text-white/60">{event.detail}</p>
                      <p className="text-[11px] text-white/35 mt-1">{event.timestamp.toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
              <div className="morphic-panel p-5">
                <h3 className="text-sm uppercase tracking-wider text-rose-gold-400/70 mb-3">Diagnostics</h3>
                <div className="space-y-2 max-h-[280px] overflow-y-auto morphic-scrollbar pr-1">
                  {selectedRun.diagnostics.map((d) => (
                    <div key={d.id} className={`rounded-xl border px-3 py-2 ${levelStyles[d.level]}`}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="inline-flex items-center gap-1"><Bug className="w-3 h-3" /> {d.source}</span>
                        <span>{d.timestamp.toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs mt-1">{d.message}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="morphic-panel p-5">
                <h3 className="text-sm uppercase tracking-wider text-rose-gold-400/70 mb-3">Outputs</h3>
                <div className="space-y-2 max-h-[280px] overflow-y-auto morphic-scrollbar pr-1">
                  {selectedRun.outputs.map((o) => (
                    <div key={o.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-white inline-flex items-center gap-1.5">{getOutputIcon(o.type)} {o.title}</p>
                        <span className="text-[11px] text-white/40">{o.createdAt.toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs text-white/60 mt-1 line-clamp-2">{o.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}

function RunControls({
  run,
  pauseRun,
  resumeRun,
  retryRun,
  cancelRun,
  compact
}: {
  run: CommandRun
  pauseRun: (runId: string) => void
  resumeRun: (runId: string) => void
  retryRun: (runId: string) => void
  cancelRun: (runId: string) => void
  compact?: boolean
}) {
  const btn = compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'

  return (
    <>
      {(run.status === 'running' || run.status === 'retrying') && (
        <button className={`morphic-btn-ghost ${btn}`} onClick={(e) => { e.stopPropagation(); pauseRun(run.id) }}><Pause className="w-3 h-3 inline" /> Pause</button>
      )}
      {run.status === 'paused' && (
        <button className={`morphic-btn-ghost ${btn}`} onClick={(e) => { e.stopPropagation(); resumeRun(run.id) }}><Play className="w-3 h-3 inline" /> Resume</button>
      )}
      {(run.status === 'failed' || run.status === 'cancelled') && run.retryCount < run.maxRetries && (
        <button className={`morphic-btn-ghost ${btn}`} onClick={(e) => { e.stopPropagation(); retryRun(run.id) }}><RotateCcw className="w-3 h-3 inline" /> Retry</button>
      )}
      {(run.status === 'running' || run.status === 'paused' || run.status === 'retrying' || run.status === 'queued') && (
        <button className={`glass-btn-danger ${btn}`} onClick={(e) => { e.stopPropagation(); cancelRun(run.id) }}><Square className="w-3 h-3 inline" /> Cancel</button>
      )}
    </>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="morphic-card px-3 py-2 min-w-[86px]">
      <div className="flex items-center gap-1.5 text-white/50 text-[11px]"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className="text-lg font-semibold text-white mt-0.5">{value}</div>
    </div>
  )
}

function getOutputIcon(type: CommandRun['outputs'][number]['type']) {
  switch (type) {
    case 'code':
      return <Code2 className="w-3.5 h-3.5 text-rose-gold-400" />
    case 'link':
      return <Link2 className="w-3.5 h-3.5 text-rose-gold-400" />
    case 'json':
      return <Braces className="w-3.5 h-3.5 text-rose-gold-400" />
    case 'text':
      return <FileText className="w-3.5 h-3.5 text-rose-gold-400" />
    default:
      return <CircleDot className="w-3.5 h-3.5 text-rose-gold-400" />
  }
}
